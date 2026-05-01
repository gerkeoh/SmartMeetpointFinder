// server/services/meetingPointService.js

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance using the Haversine formula.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Naive travel-time estimate for MVP.
 * Replace later with routing API matrix results.
 */
function estimateTravelMinutes(from, to, averageSpeedKmh = 30) {
  const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  return (distanceKm / averageSpeedKmh) * 60;
}

/**
 * Arithmetic centroid.
 * Good enough as a seed for local meetup searches.
 */
function centroid(points) {
  const total = points.reduce(
    (acc, p) => {
      acc.lat += p.lat;
      acc.lng += p.lng;
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
}

/**
 * Standard deviation helper.
 */
function stdDev(values) {
  if (!values.length) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Generate candidate points around the seed center.
 * Radius in km.
 */
function generateCandidatePoints(center, radiusKm = 3, rings = 3, perRing = 8) {
  const candidates = [center];

  const kmToLat = (km) => km / 111;
  const kmToLng = (km, lat) => km / (111 * Math.cos((lat * Math.PI) / 180));

  for (let ring = 1; ring <= rings; ring += 1) {
    const ringRadius = (radiusKm / rings) * ring;

    for (let i = 0; i < perRing; i += 1) {
      const angle = (2 * Math.PI * i) / perRing;
      const deltaLat = kmToLat(ringRadius * Math.cos(angle));
      const deltaLng = kmToLng(ringRadius * Math.sin(angle), center.lat);

      candidates.push({
        lat: center.lat + deltaLat,
        lng: center.lng + deltaLng,
      });
    }
  }

  return candidates;
}

/**
 * Score one candidate point.
 * Lower score is better.
 */
function scoreCandidate(candidate, participants, averageSpeedKmh = 30) {
  const travelMinutes = participants.map((p) =>
    estimateTravelMinutes(
      { lat: p.lat, lng: p.lng },
      candidate,
      averageSpeedKmh
    )
  );

  const maxTime = Math.max(...travelMinutes);
  const avgTime =
    travelMinutes.reduce((sum, v) => sum + v, 0) / travelMinutes.length;
  const spreadPenalty = stdDev(travelMinutes);

  // Weighted fairness formula
  const score = maxTime * 0.6 + avgTime * 0.3 + spreadPenalty * 0.1;

  return {
    score,
    travelMinutes,
    maxTime,
    avgTime,
    spreadPenalty,
  };
}

function dynamicSearchRadiusKm(participants) {
  let maxDistance = 0;

  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) {
      const distance = haversineKm(
        participants[i].lat,
        participants[i].lng,
        participants[j].lat,
        participants[j].lng
      );

      if (distance > maxDistance) {
        maxDistance = distance;
      }
    }
  }

  // Use a higher fraction of the participant spread so the circle is more visible
  // on wide-area meetups, while still growing in proportion to distance.
  const radius = Math.max(maxDistance * 0.75, 5);

  return radius;
}

/**
 * Main meeting-point algorithm.
 */
export function calculateBestMeetingPoint(participants, options = {}) {
  if (!Array.isArray(participants) || participants.length < 2) {
    throw new Error("At least two participant locations are required.");
  }

  for (const p of participants) {
    if (
      typeof p.lat !== "number" ||
      typeof p.lng !== "number" ||
      Number.isNaN(p.lat) ||
      Number.isNaN(p.lng)
    ) {
      throw new Error("Each participant must include numeric lat and lng.");
    }
  }

  const averageSpeedKmh = options.averageSpeedKmh ?? 30;

  const seedCenter = centroid(participants);
  const radiusKm = dynamicSearchRadiusKm(participants);
  const candidates = generateCandidatePoints(seedCenter, radiusKm, 4, 12);

  let best = null;

  for (const candidate of candidates) {
    const metrics = scoreCandidate(candidate, participants, averageSpeedKmh);

    if (!best || metrics.score < best.score) {
      best = {
        point: candidate,
        ...metrics,
      };
    }
  }

  return {
    meetingPoint: {
      ...best.point,
      radiusKm: Number(radiusKm.toFixed(2)),
      radiusMeters: Math.round(radiusKm * 1000),
    },
    metrics: {
      score: Number(best.score.toFixed(2)),
      maxTravelMinutes: Number(best.maxTime.toFixed(1)),
      avgTravelMinutes: Number(best.avgTime.toFixed(1)),
      fairnessSpread: Number(best.spreadPenalty.toFixed(1)),
      participantTravelMinutes: best.travelMinutes.map((t) =>
        Number(t.toFixed(1))
      ),
    },
    debug: {
      seedCenter,
      radiusKm: Number(radiusKm.toFixed(2)),
      candidatesChecked: candidates.length,
    },
  };
}