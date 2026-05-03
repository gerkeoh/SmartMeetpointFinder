const EARTH_RADIUS_KM = 6371;
const OSRM_BASE_URL = "https://router.project-osrm.org";
const ROUTE_TIMEOUT_MS = 9000;
const CANDIDATE_COUNT = 9;

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
  return ["off", "current", "rush", "quiet"].includes(mode) ? mode : "off";
}

function trafficMultiplier(trafficMode) {
  if (trafficMode === "rush") return 1.35;
  if (trafficMode === "quiet") return 0.88;
  return 1;
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

async function getTomTomDuration(from, to, profile) {
  const apiKey = process.env.TOMTOM_API_KEY || process.env.REACT_APP_TOMTOM_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    key: apiKey,
    traffic: "true",
    travelMode: profile.tomtom,
    routeType: "fastest",
    computeTravelTimeFor: "all",
  });
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json?${params}`;
  const data = await fetchJson(url);
  const summary = data.routes?.[0]?.summary;

  if (!summary) return null;

  const noTrafficTime =
    typeof summary.noTrafficTravelTimeInSeconds === "number"
      ? summary.noTrafficTravelTimeInSeconds
      : null;
  const trafficDelay =
    typeof summary.trafficDelayInSeconds === "number" ? summary.trafficDelayInSeconds : null;

  const durationSeconds =
    summary.liveTrafficIncidentsTravelTimeInSeconds ||
    (noTrafficTime !== null && trafficDelay !== null ? noTrafficTime + trafficDelay : null) ||
    summary.travelTimeInSeconds;

  if (typeof durationSeconds !== "number") return null;

  return {
    durationSeconds,
    distanceMeters: summary.lengthInMeters,
    source: "tomtom-traffic",
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

async function getRoute(from, to, profile, trafficMode = "off") {
  let route = null;

  try {
    route = await getOsrmRoute(from, to, profile);
  } catch (error) {
    route = fallbackRoute(from, to, profile);
  }

  if (profile === transportProfiles.driving && trafficMode === "current") {
    try {
      const trafficRoute = await getTomTomDuration(from, to, profile);
      if (trafficRoute) {
        return {
          ...route,
          distanceMeters: trafficRoute.distanceMeters || route.distanceMeters,
          durationSeconds: trafficRoute.durationSeconds,
          source: trafficRoute.source,
        };
      }
    } catch (error) {
      return route;
    }
  }

  return {
    ...route,
    durationSeconds: route.durationSeconds * trafficMultiplier(trafficMode),
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
    const safeIndex = Math.max(1, index);
    const segmentStart = routeCoordinates[safeIndex - 1];
    const segmentEnd = routeCoordinates[safeIndex];
    const segmentDistance = distances[safeIndex] - distances[safeIndex - 1] || 1;
    const ratio = (target - distances[safeIndex - 1]) / segmentDistance;
    candidates.push(interpolatePoint(segmentStart, segmentEnd, ratio));
  }

  candidates.push(fallbackCenter);
  return candidates;
}

function scoreTravelTimes(travelTimes) {
  const maxTime = Math.max(...travelTimes);
  const avgTime = travelTimes.reduce((sum, value) => sum + value, 0) / travelTimes.length;
  const spreadPenalty = stdDev(travelTimes);

  return {
    maxTime,
    avgTime,
    spreadPenalty,
    score: maxTime * 0.6 + avgTime * 0.25 + spreadPenalty * 0.15,
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

export async function calculateBestMeetingPoint(participants, options = {}) {
  validateParticipants(participants);

  const transportMode = transportProfiles[options.transportMode] ? options.transportMode : "driving";
  const trafficMode =
    transportMode === "driving" ? normalizeTrafficMode(options.trafficMode || "off") : "off";
  const profile = getTransportProfile(transportMode);
  const farthestPair = findFarthestParticipantPair(participants);
  const geographicCenter = midpoint(farthestPair.a, farthestPair.b);
  const diameterKm = calculateDiameterKm(farthestPair.distanceKm);
  const radiusKm = diameterKm / 2;

  let routeBetweenFarthest = null;
  try {
    routeBetweenFarthest = await getRoute(farthestPair.a, farthestPair.b, profile, trafficMode);
  } catch (error) {
    routeBetweenFarthest = fallbackRoute(farthestPair.a, farthestPair.b, profile);
  }

  const candidates = sampleRouteCandidates(routeBetweenFarthest.coordinates, geographicCenter);
  const scoredCandidates = [];

  for (const candidate of candidates) {
    const participantRoutes = await Promise.all(
      participants.map(async (participant) => {
        const route = await getRoute(participant, candidate, profile, trafficMode);
        return {
          userId: participant.userId,
          durationMinutes: route.durationSeconds / 60,
          distanceKm: route.distanceMeters / 1000,
          coordinates: route.coordinates,
          source: route.source,
        };
      })
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
