const EARTH_RADIUS_KM = 6371;
const OSRM_BASE_URL = "https://router.project-osrm.org";
const ROUTE_TIMEOUT_MS = 9000;
const CANDIDATE_COUNT = 25;
const DRIVING_REFINE_STEPS = 10;
const DRIVING_REFINE_PASSES = 3;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

const transportProfiles = {
  driving: {
    osrm: "driving",
    tomtom: "car",
    fallbackSpeedKmh: 45,
    label: "Driving",
  },
  walking: {
    osrm: "walking",
    tomtom: "pedestrian",
    fallbackSpeedKmh: 5,
    label: "Walking",
  },
  cycling: {
    osrm: "cycling",
    tomtom: "bicycle",
    fallbackSpeedKmh: 16,
    label: "Cycling",
  },
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function midpoint(a, b) {
  const lat1 = toRad(a.lat);
  const lng1 = toRad(a.lng);
  const lat2 = toRad(b.lat);
  const lngDelta = toRad(b.lng - a.lng);

  const bx = Math.cos(lat2) * Math.cos(lngDelta);
  const by = Math.cos(lat2) * Math.sin(lngDelta);
  const lat = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2)
  );
  const lng = lng1 + Math.atan2(by, Math.cos(lat1) + bx);

  return {
    lat: toDeg(lat),
    lng: ((toDeg(lng) + 540) % 360) - 180,
  };
}

function stdDev(values) {
  if (!values.length) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function findFarthestParticipantPair(participants) {
  let best = {
    a: participants[0],
    b: participants[1],
    distanceKm: haversineKm(
      participants[0].lat,
      participants[0].lng,
      participants[1].lat,
      participants[1].lng
    ),
  };

  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) {
      const distanceKm = haversineKm(
        participants[i].lat,
        participants[i].lng,
        participants[j].lat,
        participants[j].lng
      );

      if (distanceKm > best.distanceKm) {
        best = { a: participants[i], b: participants[j], distanceKm };
      }
    }
  }

  return best;
}

function calculateDiameterKm(distanceKm) {
  return Math.min(distanceKm * 0.1, 5);
}

function getTransportProfile(mode) {
  return transportProfiles[mode] || transportProfiles.driving;
}

function normalizeTrafficMode(mode) {
  return mode === "current" || mode === "scheduled" ? mode : "current";
}

function normalizeDepartureTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function durationFromDistance(distanceMeters, profile) {
  return (distanceMeters / 1000 / profile.fallbackSpeedKmh) * 60 * 60;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "SmartMeetpointFinder/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Route request failed with ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getOsrmRoute(from, to, profile) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    alternatives: "false",
    steps: "false",
  });
  const url = `${OSRM_BASE_URL}/route/v1/${profile.osrm}/${coords}?${params}`;
  const data = await fetchJson(url);
  const route = data.routes?.[0];

  if (!route) throw new Error("No route found.");

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    coordinates: (route.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]),
    source: "osrm",
  };
}

async function getTomTomRoute(from, to, profile, trafficMode = "current", departureTime = null) {
  const apiKey = process.env.TOMTOM_API_KEY || process.env.REACT_APP_TOMTOM_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    key: apiKey,
    travelMode: profile.tomtom,
    routeType: "fastest",
  });

  if (profile === transportProfiles.driving) {
    params.set("traffic", "true");
    params.set("computeTravelTimeFor", "all");

    if (departureTime) {
      params.set("departAt", departureTime);
    }
  }

  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json?${params}`;
  const data = await fetchJson(url);
  const route = data.routes?.[0];
  const summary = route?.summary;

  if (!summary) return null;

  const noTrafficTime =
    typeof summary.noTrafficTravelTimeInSeconds === "number"
      ? summary.noTrafficTravelTimeInSeconds
      : null;
  const trafficDelay =
    typeof summary.trafficDelayInSeconds === "number" ? summary.trafficDelayInSeconds : null;

  let durationSeconds =
    summary.liveTrafficIncidentsTravelTimeInSeconds ||
    (noTrafficTime !== null && trafficDelay !== null ? noTrafficTime + trafficDelay : null) ||
    summary.travelTimeInSeconds;

  if (typeof durationSeconds !== "number") return null;

  const coordinates =
    route.legs
      ?.flatMap((leg) => leg.points || [])
      .map((point) => [point.latitude, point.longitude]) || [];

  if (profile !== transportProfiles.driving) {
    durationSeconds = durationFromDistance(summary.lengthInMeters, profile);
  }

  return {
    durationSeconds,
    distanceMeters: summary.lengthInMeters,
    coordinates,
    source: profile === transportProfiles.driving ? "tomtom-traffic" : "tomtom",
  };
}

function fallbackRoute(from, to, profile) {
  const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const durationSeconds = (distanceKm / profile.fallbackSpeedKmh) * 60 * 60;

  return {
    distanceMeters: distanceKm * 1000,
    durationSeconds,
    coordinates: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    source: "fallback",
  };
}

async function getRoute(from, to, profile, trafficMode = "current", departureTime = null) {
  let route = null;

  try {
    route = await getTomTomRoute(from, to, profile, trafficMode, departureTime);
  } catch (error) {
    route = null;
  }

  if (route) {
    return route;
  }

  try {
    route = await getOsrmRoute(from, to, profile);
  } catch (error) {
    route = fallbackRoute(from, to, profile);
  }

  return {
    ...route,
    durationSeconds:
      profile === transportProfiles.driving
        ? route.durationSeconds
        : durationFromDistance(route.distanceMeters, profile),
  };
}

function cumulativeDistances(coordinates) {
  const distances = [0];

  for (let i = 1; i < coordinates.length; i += 1) {
    const previous = coordinates[i - 1];
    const current = coordinates[i];
    distances.push(
      distances[i - 1] + haversineKm(previous[0], previous[1], current[0], current[1]) * 1000
    );
  }

  return distances;
}

function interpolatePoint(a, b, ratio) {
  return {
    lat: a[0] + (b[0] - a[0]) * ratio,
    lng: a[1] + (b[1] - a[1]) * ratio,
  };
}

function sampleRouteCandidates(routeCoordinates, fallbackCenter) {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return [fallbackCenter];
  }

  const distances = cumulativeDistances(routeCoordinates);
  const total = distances[distances.length - 1];
  if (!total) return [fallbackCenter];

  const candidates = [];
  for (let i = 1; i <= CANDIDATE_COUNT; i += 1) {
    const target = (total * i) / (CANDIDATE_COUNT + 1);
    const index = distances.findIndex((distance) => distance >= target);
    const safeIndex = index === -1 ? distances.length - 1 : Math.max(1, index);
    const segmentStart = routeCoordinates[safeIndex - 1];
    const segmentEnd = routeCoordinates[safeIndex];
    const segmentDistance = distances[safeIndex] - distances[safeIndex - 1] || 1;
    const ratio = (target - distances[safeIndex - 1]) / segmentDistance;
    candidates.push(interpolatePoint(segmentStart, segmentEnd, ratio));
  }

  return candidates;
}

function routePointAtDistance(routeCoordinates, distances, targetDistanceMeters) {
  if (!routeCoordinates?.length || !distances?.length) return null;

  const total = distances[distances.length - 1];
  const clampedTarget = Math.max(0, Math.min(targetDistanceMeters, total));
  const index = distances.findIndex((distance) => distance >= clampedTarget);
  const safeIndex = index === -1 ? distances.length - 1 : Math.max(1, index);
  const segmentStart = routeCoordinates[safeIndex - 1];
  const segmentEnd = routeCoordinates[safeIndex];
  const segmentDistance = distances[safeIndex] - distances[safeIndex - 1] || 1;
  const ratio = (clampedTarget - distances[safeIndex - 1]) / segmentDistance;

  return {
    point: interpolatePoint(segmentStart, segmentEnd, ratio),
    index: safeIndex,
    ratio,
  };
}

function splitRouteAtDistance(routeCoordinates, targetDistanceMeters) {
  const distances = cumulativeDistances(routeCoordinates);
  const totalDistanceMeters = distances[distances.length - 1] || 0;
  const split = routePointAtDistance(routeCoordinates, distances, targetDistanceMeters);

  if (!split || !totalDistanceMeters) return null;

  const firstSide = [
    ...routeCoordinates.slice(0, split.index),
    [split.point.lat, split.point.lng],
  ];
  const secondSide = [
    [split.point.lat, split.point.lng],
    ...routeCoordinates.slice(split.index),
  ];

  return {
    point: split.point,
    totalDistanceMeters,
    firstSide,
    secondSide,
  };
}

function buildTwoPersonFairRouteResult(participants, route, profile, options) {
  const routeDistances = cumulativeDistances(route.coordinates);
  const routeGeometryDistanceMeters = routeDistances[routeDistances.length - 1] || route.distanceMeters;
  const split = splitRouteAtDistance(route.coordinates, routeGeometryDistanceMeters / 2);
  if (!split) return null;

  const halfDistanceKm = split.totalDistanceMeters / 2 / 1000;
  const durationMinutes =
    profile === transportProfiles.driving
      ? route.durationSeconds / 2 / 60
      : (halfDistanceKm / profile.fallbackSpeedKmh) * 60;
  const firstRoute = {
    userId: participants[0].userId,
    durationMinutes,
    distanceKm: halfDistanceKm,
    coordinates: split.firstSide,
    source: route.source,
  };
  const secondRoute = {
    userId: participants[1].userId,
    durationMinutes,
    distanceKm: halfDistanceKm,
    coordinates: split.secondSide.reverse(),
    source: route.source,
  };

  return buildMeetingPointResult(split.point, [firstRoute, secondRoute], options);
}

function scoreTravelTimes(travelTimes) {
  const maxTime = Math.max(...travelTimes);
  const minTime = Math.min(...travelTimes);
  const avgTime = travelTimes.reduce((sum, value) => sum + value, 0) / travelTimes.length;
  const standardDeviation = stdDev(travelTimes);
  const spreadPenalty = maxTime - minTime;

  return {
    maxTime,
    avgTime,
    spreadPenalty,
    standardDeviation,
    score: spreadPenalty * 100 + standardDeviation * 20 + maxTime * 0.15 + avgTime * 0.05,
  };
}

function validateParticipants(participants) {
  if (!Array.isArray(participants) || participants.length < 2) {
    throw new Error("At least two participant locations are required.");
  }

  participants.forEach((participant) => {
    if (
      typeof participant.lat !== "number" ||
      typeof participant.lng !== "number" ||
      Number.isNaN(participant.lat) ||
      Number.isNaN(participant.lng)
    ) {
      throw new Error("Each participant must include numeric lat and lng.");
    }
  });
}

function validateDestination(destination) {
  if (
    !destination ||
    typeof destination.lat !== "number" ||
    typeof destination.lng !== "number" ||
    Number.isNaN(destination.lat) ||
    Number.isNaN(destination.lng)
  ) {
    throw new Error("Destination must include numeric lat and lng.");
  }
}

async function calculateParticipantRoutes(participants, destination, profile, trafficMode, departureTime) {
  return Promise.all(
    participants.map(async (participant) => {
      const route = await getRoute(participant, destination, profile, trafficMode, departureTime);
      return {
        userId: participant.userId,
        durationMinutes: route.durationSeconds / 60,
        distanceKm: route.distanceMeters / 1000,
        coordinates: route.coordinates,
        source: route.source,
      };
    })
  );
}

async function scoreCandidateAtRouteDistance(
  participants,
  routeCoordinates,
  routeDistances,
  targetDistanceMeters,
  profile,
  trafficMode,
  departureTime
) {
  const split = routePointAtDistance(routeCoordinates, routeDistances, targetDistanceMeters);
  if (!split) return null;

  const participantRoutes = await calculateParticipantRoutes(
    participants,
    split.point,
    profile,
    trafficMode,
    departureTime
  );
  const travelMinutes = participantRoutes.map((route) => route.durationMinutes);
  const scored = scoreTravelTimes(travelMinutes);

  return {
    candidate: split.point,
    targetDistanceMeters,
    participantRoutes,
    travelMinutes,
    ...scored,
  };
}

async function findBestTwoPersonDrivingBalance(
  participants,
  routeBetweenFarthest,
  profile,
  trafficMode,
  departureTime
) {
  const routeCoordinates = routeBetweenFarthest.coordinates || [];
  const routeDistances = cumulativeDistances(routeCoordinates);
  const totalDistanceMeters = routeDistances[routeDistances.length - 1] || 0;

  if (routeCoordinates.length < 2 || !totalDistanceMeters) {
    const fallbackCandidate = midpoint(participants[0], participants[1]);
    const fallbackRoutes = await calculateParticipantRoutes(
      participants,
      fallbackCandidate,
      profile,
      trafficMode,
      departureTime
    );
    const travelMinutes = fallbackRoutes.map((route) => route.durationMinutes);

    return {
      candidate: fallbackCandidate,
      targetDistanceMeters: totalDistanceMeters / 2,
      participantRoutes: fallbackRoutes,
      travelMinutes,
      ...scoreTravelTimes(travelMinutes),
    };
  }

  let lowerBound = 0;
  let upperBound = totalDistanceMeters;
  let best = null;

  for (let pass = 0; pass <= DRIVING_REFINE_PASSES; pass += 1) {
    const stepSize = (upperBound - lowerBound) / (DRIVING_REFINE_STEPS + 1);
    const scoredCandidates = [];

    for (let i = 1; i <= DRIVING_REFINE_STEPS; i += 1) {
      const targetDistanceMeters = lowerBound + stepSize * i;
      const scored = await scoreCandidateAtRouteDistance(
        participants,
        routeCoordinates,
        routeDistances,
        targetDistanceMeters,
        profile,
        trafficMode,
        departureTime
      );
      if (scored) scoredCandidates.push(scored);
    }

    if (!scoredCandidates.length) break;

    scoredCandidates.sort((a, b) => a.spreadPenalty - b.spreadPenalty || a.avgTime - b.avgTime);
    best = !best || scoredCandidates[0].spreadPenalty < best.spreadPenalty ? scoredCandidates[0] : best;

    const bestIndexTarget = scoredCandidates[0].targetDistanceMeters;
    lowerBound = Math.max(0, bestIndexTarget - stepSize);
    upperBound = Math.min(totalDistanceMeters, bestIndexTarget + stepSize);

    if (best.spreadPenalty <= 0.5) break;
  }

  return best;
}

function buildMeetingPointResult(destination, participantRoutes, options = {}) {
  const travelMinutes = participantRoutes.map((route) => route.durationMinutes);
  const scored = scoreTravelTimes(travelMinutes);
  const routeSource = [...new Set(participantRoutes.map((route) => route.source))].join(",");

  return {
    meetingPoint: {
      lat: destination.lat,
      lng: destination.lng,
      radiusKm: options.radiusKm,
      radiusMeters: options.radiusMeters,
      transportMode: options.transportMode,
      trafficMode: options.trafficMode,
      departureTime: options.departureTime,
      selectedPlace: options.selectedPlace || null,
      routeSource,
      participantRoutes: participantRoutes.map((route) => ({
        userId: route.userId,
        durationMinutes: Number(route.durationMinutes.toFixed(1)),
        distanceKm: Number(route.distanceKm.toFixed(2)),
        coordinates: route.coordinates,
        source: route.source,
      })),
    },
    metrics: {
      score: Number(scored.score.toFixed(2)),
      maxTravelMinutes: Number(scored.maxTime.toFixed(1)),
      avgTravelMinutes: Number(scored.avgTime.toFixed(1)),
      fairnessSpread: Number(scored.spreadPenalty.toFixed(1)),
      participantTravelMinutes: travelMinutes.map((time) => Number(time.toFixed(1))),
      transportMode: options.transportMode,
      trafficMode: options.trafficMode,
      departureTime: options.departureTime,
      routeSource,
    },
  };
}

function getRouteOptions(options = {}) {
  const transportMode = transportProfiles[options.transportMode] ? options.transportMode : "driving";
  const trafficMode =
    transportMode === "driving" ? normalizeTrafficMode(options.trafficMode || "current") : "off";
  const departureTime =
    transportMode === "driving" ? normalizeDepartureTime(options.departureTime) : null;

  return {
    transportMode,
    trafficMode,
    departureTime,
    profile: getTransportProfile(transportMode),
  };
}

export async function calculateTravelToPoint(participants, destination, options = {}) {
  validateParticipants(participants);
  validateDestination(destination);

  const { transportMode, trafficMode, departureTime, profile } = getRouteOptions(options);
  const participantRoutes = await calculateParticipantRoutes(
    participants,
    destination,
    profile,
    trafficMode,
    departureTime
  );

  return buildMeetingPointResult(destination, participantRoutes, {
    transportMode,
    trafficMode,
    departureTime,
    radiusMeters: options.radiusMeters,
    radiusKm:
      typeof options.radiusMeters === "number"
        ? Number((options.radiusMeters / 1000).toFixed(2))
        : undefined,
    selectedPlace: options.selectedPlace,
  });
}

export async function calculateBestMeetingPoint(participants, options = {}) {
  validateParticipants(participants);

  const { transportMode, trafficMode, departureTime, profile } = getRouteOptions(options);
  const farthestPair = findFarthestParticipantPair(participants);
  const geographicCenter = midpoint(farthestPair.a, farthestPair.b);
  const diameterKm = calculateDiameterKm(farthestPair.distanceKm);
  const radiusKm = diameterKm / 2;

  let routeBetweenFarthest = null;
  try {
    routeBetweenFarthest = await getRoute(
      farthestPair.a,
      farthestPair.b,
      profile,
      trafficMode,
      departureTime
    );
  } catch (error) {
    routeBetweenFarthest = fallbackRoute(farthestPair.a, farthestPair.b, profile);
  }

  if (participants.length === 2 && transportMode !== "driving") {
    const twoPersonResult = buildTwoPersonFairRouteResult(participants, routeBetweenFarthest, profile, {
      transportMode,
      trafficMode,
      departureTime,
      radiusKm: Number(radiusKm.toFixed(2)),
      radiusMeters: Math.round(radiusKm * 1000),
    });

    if (twoPersonResult) {
      return {
        ...twoPersonResult,
        metrics: {
          ...twoPersonResult.metrics,
          routeDistanceKm: Number((routeBetweenFarthest.distanceMeters / 1000).toFixed(2)),
          lineDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
        },
        debug: {
          farthestPair: {
            a: farthestPair.a.userId,
            b: farthestPair.b.userId,
          },
          center: twoPersonResult.meetingPoint,
          geographicCenter,
          totalDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
          routeDistanceKm: Number((routeBetweenFarthest.distanceMeters / 1000).toFixed(2)),
          diameterKm: Number(diameterKm.toFixed(2)),
          radiusKm: Number(radiusKm.toFixed(2)),
          candidateCount: 1,
          method: "fair_halfway_along_route",
        },
      };
    }
  }

  const candidates = sampleRouteCandidates(routeBetweenFarthest.coordinates, geographicCenter);

  if (participants.length === 2 && transportMode === "driving") {
    const bestDrivingBalance = await findBestTwoPersonDrivingBalance(
      participants,
      routeBetweenFarthest,
      profile,
      trafficMode,
      departureTime
    );

    return {
      meetingPoint: {
        ...bestDrivingBalance.candidate,
        radiusKm: Number(radiusKm.toFixed(2)),
        radiusMeters: Math.round(radiusKm * 1000),
        transportMode,
        trafficMode,
        departureTime,
        routeSource: [...new Set(bestDrivingBalance.participantRoutes.map((route) => route.source))].join(","),
        participantRoutes: bestDrivingBalance.participantRoutes.map((route) => ({
          userId: route.userId,
          durationMinutes: Number(route.durationMinutes.toFixed(1)),
          distanceKm: Number(route.distanceKm.toFixed(2)),
          coordinates: route.coordinates,
          source: route.source,
        })),
      },
      metrics: {
        score: Number(bestDrivingBalance.score.toFixed(2)),
        maxTravelMinutes: Number(bestDrivingBalance.maxTime.toFixed(1)),
        avgTravelMinutes: Number(bestDrivingBalance.avgTime.toFixed(1)),
        fairnessSpread: Number(bestDrivingBalance.spreadPenalty.toFixed(1)),
        participantTravelMinutes: bestDrivingBalance.travelMinutes.map((time) => Number(time.toFixed(1))),
        routeDistanceKm: Number((routeBetweenFarthest.distanceMeters / 1000).toFixed(2)),
        lineDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
        transportMode,
        trafficMode,
        departureTime,
        routeSource: [...new Set(bestDrivingBalance.participantRoutes.map((route) => route.source))].join(","),
      },
      debug: {
        farthestPair: {
          a: farthestPair.a.userId,
          b: farthestPair.b.userId,
        },
        center: bestDrivingBalance.candidate,
        geographicCenter,
        totalDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
        routeDistanceKm: Number((routeBetweenFarthest.distanceMeters / 1000).toFixed(2)),
        diameterKm: Number(diameterKm.toFixed(2)),
        radiusKm: Number(radiusKm.toFixed(2)),
        candidateCount: candidates.length,
        method: "refined_minimize_driving_time_gap",
      },
    };
  }

  const scoredCandidates = [];

  for (const candidate of candidates) {
    const participantRoutes = await calculateParticipantRoutes(
      participants,
      candidate,
      profile,
      trafficMode,
      departureTime
    );
    const travelMinutes = participantRoutes.map((route) => route.durationMinutes);
    const scored = scoreTravelTimes(travelMinutes);

    scoredCandidates.push({
      candidate,
      participantRoutes,
      travelMinutes,
      ...scored,
    });
  }

  scoredCandidates.sort((a, b) => a.score - b.score);
  const best = scoredCandidates[0];

  return {
    meetingPoint: {
      ...best.candidate,
      radiusKm: Number(radiusKm.toFixed(2)),
      radiusMeters: Math.round(radiusKm * 1000),
      transportMode,
      trafficMode,
      departureTime,
      routeSource: [...new Set(best.participantRoutes.map((route) => route.source))].join(","),
      participantRoutes: best.participantRoutes.map((route) => ({
        userId: route.userId,
        durationMinutes: Number(route.durationMinutes.toFixed(1)),
        distanceKm: Number(route.distanceKm.toFixed(2)),
        coordinates: route.coordinates,
        source: route.source,
      })),
    },
    metrics: {
      score: Number(best.score.toFixed(2)),
      maxTravelMinutes: Number(best.maxTime.toFixed(1)),
      avgTravelMinutes: Number(best.avgTime.toFixed(1)),
      fairnessSpread: Number(best.spreadPenalty.toFixed(1)),
      participantTravelMinutes: best.travelMinutes.map((time) => Number(time.toFixed(1))),
      routeDistanceKm: Number((routeBetweenFarthest.distanceMeters / 1000).toFixed(2)),
      lineDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
      transportMode,
      trafficMode,
      departureTime,
      routeSource: [...new Set(best.participantRoutes.map((route) => route.source))].join(","),
    },
    debug: {
      farthestPair: {
        a: farthestPair.a.userId,
        b: farthestPair.b.userId,
      },
      center: best.candidate,
      geographicCenter,
      totalDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
      routeDistanceKm: Number((routeBetweenFarthest.distanceMeters / 1000).toFixed(2)),
      diameterKm: Number(diameterKm.toFixed(2)),
      radiusKm: Number(radiusKm.toFixed(2)),
      candidateCount: candidates.length,
    },
  };
}
