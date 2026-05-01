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

function estimateTravelMinutes(from, to, averageSpeedKmh = 30) {
  const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  return (distanceKm / averageSpeedKmh) * 60;
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
        best = {
          a: participants[i],
          b: participants[j],
          distanceKm,
        };
      }
    }
  }

  return best;
}

function midpoint(a, b) {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

function calculateRadiusKm(distanceKm) {
  return Math.min(distanceKm * 0.1, 5);
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
  const farthestPair = findFarthestParticipantPair(participants);
  const meetingPointLocation = midpoint(farthestPair.a, farthestPair.b);
  const radiusKm = calculateRadiusKm(farthestPair.distanceKm);
  const travelMinutes = participants.map((p) =>
    estimateTravelMinutes(
      { lat: p.lat, lng: p.lng },
      meetingPointLocation,
      averageSpeedKmh
    )
  );
  const maxTime = Math.max(...travelMinutes);
  const avgTime = travelMinutes.reduce((sum, v) => sum + v, 0) / travelMinutes.length;
  const spreadPenalty = stdDev(travelMinutes);
  const score = maxTime * 0.6 + avgTime * 0.3 + spreadPenalty * 0.1;

  return {
    meetingPoint: {
      ...meetingPointLocation,
      radiusKm: Number(radiusKm.toFixed(2)),
      radiusMeters: Math.round(radiusKm * 1000),
    },
    metrics: {
      score: Number(score.toFixed(2)),
      maxTravelMinutes: Number(maxTime.toFixed(1)),
      avgTravelMinutes: Number(avgTime.toFixed(1)),
      fairnessSpread: Number(spreadPenalty.toFixed(1)),
      participantTravelMinutes: travelMinutes.map((t) => Number(t.toFixed(1))),
      lineDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
    },
    debug: {
      farthestPair: {
        a: farthestPair.a.userId,
        b: farthestPair.b.userId,
      },
      center: meetingPointLocation,
      totalDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
      radiusKm: Number(radiusKm.toFixed(2)),
    },
  };
}