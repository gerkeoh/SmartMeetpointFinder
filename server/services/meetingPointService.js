const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateTravelMinutes(from, to, averageSpeedKmh = 30) {
  const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  return (distanceKm / averageSpeedKmh) * 60;
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

function calculateDiameterKm(distanceKm) {
  return Math.min(distanceKm * 0.1, 5);
}

export function calculateBestMeetingPoint(participants, options = {}) {
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

  const averageSpeedKmh = options.averageSpeedKmh ?? 30;
  const farthestPair = findFarthestParticipantPair(participants);
  const meetingPointLocation = midpoint(farthestPair.a, farthestPair.b);
  const diameterKm = calculateDiameterKm(farthestPair.distanceKm);
  const radiusKm = diameterKm / 2;
  const travelMinutes = participants.map((participant) =>
    estimateTravelMinutes(participant, meetingPointLocation, averageSpeedKmh)
  );
  const maxTime = Math.max(...travelMinutes);
  const avgTime = travelMinutes.reduce((sum, value) => sum + value, 0) / travelMinutes.length;
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
      participantTravelMinutes: travelMinutes.map((time) => Number(time.toFixed(1))),
      lineDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
    },
    debug: {
      farthestPair: {
        a: farthestPair.a.userId,
        b: farthestPair.b.userId,
      },
      center: meetingPointLocation,
      totalDistanceKm: Number(farthestPair.distanceKm.toFixed(2)),
      diameterKm: Number(diameterKm.toFixed(2)),
      radiusKm: Number(radiusKm.toFixed(2)),
    },
  };
}
