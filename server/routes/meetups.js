import express from "express";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { calculateBestMeetingPoint } from "../services/meetingPointService.js";

const router = express.Router();

const MEETUPS = "meetups";
const PARTICIPANTS = "participants";
const CONNECTIONS = "connections";
const USERS = "users";

function createMeetupSaveId() {
  return `meetup_${randomUUID()}`;
}

function uniqueValidObjectIds(ids) {
  const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
  if (uniqueIds.some((id) => !ObjectId.isValid(id))) return null;
  return uniqueIds.map((id) => new ObjectId(id));
}

async function ensureIndexes() {
  await db.collection(MEETUPS).createIndex({ userId: 1, createdAt: -1 });
  await db.collection(MEETUPS).createIndex({ creatorId: 1, createdAt: -1 });
  await db.collection(MEETUPS).createIndex({ meetupSaveId: 1 }, { unique: true, sparse: true });
  await db.collection(PARTICIPANTS).createIndex({ meetupId: 1, userId: 1 }, { unique: true });
}
ensureIndexes().catch(console.error);

router.get("/meetups", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const participantRows = await db
      .collection(PARTICIPANTS)
      .find({ userId })
      .project({ meetupId: 1 })
      .toArray();
    const participantMeetupIds = participantRows.map((row) => row.meetupId);

    const meetups = await db
      .collection(MEETUPS)
      .find({
        $or: [
          { userId },
          { creatorId: userId },
          ...(participantMeetupIds.length ? [{ _id: { $in: participantMeetupIds } }] : []),
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      meetups: meetups.map((meetup) => ({
        id: meetup._id.toString(),
        meetupId: meetup._id.toString(),
        meetupSaveId: meetup.meetupSaveId || meetup._id.toString(),
        title: meetup.title || "",
        participantIds:
          meetup.participantIds?.map((id) => id.toString()) ||
          meetup.invitedUserIds?.map((id) => id.toString()) ||
          [],
        status: meetup.status || "created",
        createdAt: meetup.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/meetups", requireAuth, async (req, res) => {
  try {
    const creatorId = new ObjectId(req.user.id);
    const { title = "", friendId, friendIds, invitedFriendId, invitedFriendIds } = req.body || {};
    const requestedIds = [
      ...(Array.isArray(friendIds) ? friendIds : []),
      ...(Array.isArray(invitedFriendIds) ? invitedFriendIds : []),
      friendId,
      invitedFriendId,
    ].filter(Boolean);
    const invitedObjectIds = uniqueValidObjectIds(requestedIds);

    if (!invitedObjectIds || invitedObjectIds.length === 0) {
      return res.status(400).json({ message: "At least one friend must be invited." });
    }

    const validEdges = await db
      .collection(CONNECTIONS)
      .find({
        userId: creatorId,
        friendId: { $in: invitedObjectIds },
      })
      .toArray();

    if (validEdges.length !== invitedObjectIds.length) {
      return res.status(403).json({ message: "You can only create meetups with your friends." });
    }

    const meetupDoc = {
      title: typeof title === "string" ? title.trim().slice(0, 80) : "",
      creatorId,
      userId: creatorId,
      invitedUserIds: invitedObjectIds,
      participantIds: invitedObjectIds,
      meetupSaveId: createMeetupSaveId(),
      status: "collecting_locations",
      createdAt: new Date(),
      updatedAt: new Date(),
      finalLocation: null,
      suggestedMeetingPoint: null,
      algorithmMetrics: null,
    };

    const meetupResult = await db.collection(MEETUPS).insertOne(meetupDoc);
    const meetupId = meetupResult.insertedId;
    const friendUsers = await db
      .collection(USERS)
      .find({ _id: { $in: invitedObjectIds } })
      .toArray();

    const participantDocs = [
      {
        meetupId,
        userId: creatorId,
        joinedAt: new Date(),
        location: null,
        locationSource: null,
      },
      ...friendUsers.map((user) => ({
        meetupId,
        userId: user._id,
        joinedAt: new Date(),
        location: null,
        locationSource: null,
      })),
    ];

    await db.collection(PARTICIPANTS).insertMany(participantDocs, { ordered: false });

    return res.status(201).json({
      message: "Meetup created.",
      meetupId: meetupId.toString(),
      meetupSaveId: meetupDoc.meetupSaveId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/meetups/:meetupId", requireAuth, async (req, res) => {
  try {
    const currentUserId = new ObjectId(req.user.id);
    const lookup = ObjectId.isValid(req.params.meetupId)
      ? { _id: new ObjectId(req.params.meetupId) }
      : { meetupSaveId: req.params.meetupId };

    const meetup = await db.collection(MEETUPS).findOne(lookup);
    if (!meetup) return res.status(404).json({ message: "Meetup not found." });

    const currentParticipant = await db.collection(PARTICIPANTS).findOne({
      meetupId: meetup._id,
      userId: currentUserId,
    });

    const isLegacyOwner = meetup.userId?.equals?.(currentUserId) || meetup.creatorId?.equals?.(currentUserId);
    if (!currentParticipant && !isLegacyOwner) {
      return res.status(403).json({ message: "You do not have access to this meetup." });
    }

    const participantDocs = await db.collection(PARTICIPANTS).find({ meetupId: meetup._id }).toArray();
    const userIds = participantDocs.map((participant) => participant.userId);
    const users = await db
      .collection(USERS)
      .find({ _id: { $in: userIds } })
      .project({ username: 1, email: 1 })
      .toArray();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const participants = participantDocs.map((participant) => {
      const user = userMap.get(participant.userId.toString());

      return {
        userId: participant.userId.toString(),
        username: user?.username || "",
        email: user?.email || "",
        isCurrentUser: participant.userId.equals(currentUserId),
        location: participant.location || null,
        locationSource: participant.locationSource || null,
        joinedAt: participant.joinedAt || null,
      };
    });

    return res.status(200).json({
      meetup: {
        id: meetup._id.toString(),
        meetupSaveId: meetup.meetupSaveId || meetup._id.toString(),
        title: meetup.title || "",
        status: meetup.status || "created",
        suggestedMeetingPoint: meetup.suggestedMeetingPoint || null,
        algorithmMetrics: meetup.algorithmMetrics || null,
      },
      suggestedMeetingPoint: meetup.suggestedMeetingPoint || null,
      participants,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/meetups/:meetupId/location", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const { lat, lng, source } = req.body || {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "Valid lat/lng required." });
    }

    if (!["gps", "manual"].includes(source)) {
      return res.status(400).json({ message: "source must be 'gps' or 'manual'." });
    }

    const meetup = await db.collection(MEETUPS).findOne(
      ObjectId.isValid(req.params.meetupId)
        ? { _id: new ObjectId(req.params.meetupId) }
        : { meetupSaveId: req.params.meetupId }
    );
    if (!meetup) return res.status(404).json({ message: "Meetup not found." });

    const result = await db.collection(PARTICIPANTS).updateOne(
      { meetupId: meetup._id, userId },
      {
        $set: {
          location: { lat, lng, updatedAt: new Date() },
          locationSource: source,
          joinedAt: new Date(),
        },
      }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Participant record not found." });
    }

    await db.collection(MEETUPS).updateOne(
      { _id: meetup._id },
      { $set: { status: "collecting_locations", updatedAt: new Date() } }
    );

    return res.status(200).json({ message: "Location saved." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/meetups/:meetupId/calculate", requireAuth, async (req, res) => {
  try {
    const currentUserId = new ObjectId(req.user.id);
    const meetup = await db.collection(MEETUPS).findOne(
      ObjectId.isValid(req.params.meetupId)
        ? { _id: new ObjectId(req.params.meetupId) }
        : { meetupSaveId: req.params.meetupId }
    );
    if (!meetup) return res.status(404).json({ message: "Meetup not found." });

    const currentParticipant = await db.collection(PARTICIPANTS).findOne({
      meetupId: meetup._id,
      userId: currentUserId,
    });
    if (!currentParticipant) {
      return res.status(403).json({ message: "You do not have access to this meetup." });
    }

    const participantDocs = await db
      .collection(PARTICIPANTS)
      .find({ meetupId: meetup._id, location: { $ne: null } })
      .toArray();

    if (participantDocs.length < 2) {
      return res.status(400).json({ message: "At least two participant locations are required." });
    }

    const algorithmInput = participantDocs.map((participant) => ({
      userId: participant.userId.toString(),
      lat: participant.location.lat,
      lng: participant.location.lng,
    }));
    const result = calculateBestMeetingPoint(algorithmInput);

    await db.collection(MEETUPS).updateOne(
      { _id: meetup._id },
      {
        $set: {
          suggestedMeetingPoint: result.meetingPoint,
          algorithmMetrics: result.metrics,
          status: "point_calculated",
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/coffee-shops", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radiusMeters = parseInt(req.query.radiusMeters, 10);

    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      Number.isNaN(radiusMeters) ||
      radiusMeters <= 0
    ) {
      return res.status(400).json({ message: "Valid lat, lng, and radiusMeters are required." });
    }

    const toRad = (deg) => (deg * Math.PI) / 180;
    const distanceMeters = (shopLat, shopLng) => {
      const earthRadiusMeters = 6371000;
      const dLat = toRad(shopLat - lat);
      const dLng = toRad(shopLng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(shopLat)) * Math.sin(dLng / 2) ** 2;

      return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="cafe"](around:${radiusMeters},${lat},${lng});
        way["amenity"="cafe"](around:${radiusMeters},${lat},${lng});
        relation["amenity"="cafe"](around:${radiusMeters},${lat},${lng});
        node["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
        way["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
        relation["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
        node["amenity"="pub"](around:${radiusMeters},${lat},${lng});
        way["amenity"="pub"](around:${radiusMeters},${lat},${lng});
        relation["amenity"="pub"](around:${radiusMeters},${lat},${lng});
        node["amenity"="bar"](around:${radiusMeters},${lat},${lng});
        way["amenity"="bar"](around:${radiusMeters},${lat},${lng});
        relation["amenity"="bar"](around:${radiusMeters},${lat},${lng});
        node["amenity"="fast_food"](around:${radiusMeters},${lat},${lng});
        way["amenity"="fast_food"](around:${radiusMeters},${lat},${lng});
        relation["amenity"="fast_food"](around:${radiusMeters},${lat},${lng});
        node["shop"="coffee"](around:${radiusMeters},${lat},${lng});
        way["shop"="coffee"](around:${radiusMeters},${lat},${lng});
        relation["shop"="coffee"](around:${radiusMeters},${lat},${lng});
        node["cuisine"="coffee_shop"](around:${radiusMeters},${lat},${lng});
        way["cuisine"="coffee_shop"](around:${radiusMeters},${lat},${lng});
        relation["cuisine"="coffee_shop"](around:${radiusMeters},${lat},${lng});
      );
      out center;
    `;

    const overpassEndpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.openstreetmap.ru/api/interpreter",
    ];

    let lastError = null;

    for (const endpoint of overpassEndpoints) {
      try {
        const url = `${endpoint}?${new URLSearchParams({ data: query })}`;
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "SmartMeetpointFinder/1.0",
          },
        });

        if (!response.ok) {
          lastError = new Error(`Overpass request failed with ${response.status}`);
          continue;
        }

        const data = await response.json();
        const placesById = new Map();

        (data.elements || [])
          .map((element) => {
            const shopLat = element.lat ?? element.center?.lat;
            const shopLng = element.lon ?? element.center?.lon;
            if (typeof shopLat !== "number" || typeof shopLng !== "number") return null;

            const distanceFromMeetingPointMeters = distanceMeters(shopLat, shopLng);
            if (distanceFromMeetingPointMeters > radiusMeters) return null;

            return {
              id: `${element.type}-${element.id}`,
              name: element.tags?.name || "Place",
              type: element.tags?.amenity || element.tags?.shop || "place",
              lat: shopLat,
              lng: shopLng,
              distanceMeters: Math.round(distanceFromMeetingPointMeters),
            };
          })
          .filter(Boolean)
          .forEach((place) => placesById.set(place.id, place));

        const shops = Array.from(placesById.values()).sort(
          (a, b) => a.distanceMeters - b.distanceMeters
        );

        return res.status(200).json({ shops });
      } catch (error) {
        lastError = error;
      }
    }

    console.error(lastError);
    return res.status(502).json({ message: "Coffee shop search service is unavailable." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unable to load coffee shops." });
  }
});

export default router;
