import express from "express";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  calculateBestMeetingPoint,
  calculateTravelToPoint,
} from "../services/meetingPointService.js";

const router = express.Router();

const MEETUPS = "meetups";
const PARTICIPANTS = "participants";
const INVITATIONS = "meetupInvitations";
const MESSAGES = "meetupMessages";
const DIRECT_MESSAGES = "directMessages";
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
  await db.collection(INVITATIONS).createIndex({ meetupId: 1, invitedUserId: 1 }, { unique: true });
  await db.collection(INVITATIONS).createIndex({ invitedUserId: 1, status: 1, createdAt: -1 });
  await db.collection(MESSAGES).createIndex({ meetupId: 1, createdAt: 1 });
  await db.collection(DIRECT_MESSAGES).createIndex({ conversationKey: 1, createdAt: 1 });
}
ensureIndexes().catch(console.error);

function getMeetupLookup(meetupId) {
  return ObjectId.isValid(meetupId)
    ? { _id: new ObjectId(meetupId) }
    : { meetupSaveId: meetupId };
}

async function getMeetupParticipant(meetupId, userId) {
  return db.collection(PARTICIPANTS).findOne({ meetupId, userId });
}

function getConversationKey(userId, otherUserId) {
  return [userId.toString(), otherUserId.toString()].sort().join(":");
}

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

router.get("/meetup-invitations", requireAuth, async (req, res) => {
  try {
    const invitedUserId = new ObjectId(req.user.id);
    const invitations = await db
      .collection(INVITATIONS)
      .find({ invitedUserId, status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    if (!invitations.length) {
      return res.status(200).json({ invitations: [] });
    }

    const meetupIds = invitations.map((invitation) => invitation.meetupId);
    const creatorIds = invitations.map((invitation) => invitation.creatorId);
    const [meetups, creators] = await Promise.all([
      db.collection(MEETUPS).find({ _id: { $in: meetupIds } }).toArray(),
      db
        .collection(USERS)
        .find({ _id: { $in: creatorIds } })
        .project({ username: 1, email: 1 })
        .toArray(),
    ]);

    const meetupMap = new Map(meetups.map((meetup) => [meetup._id.toString(), meetup]));
    const creatorMap = new Map(creators.map((creator) => [creator._id.toString(), creator]));

    return res.status(200).json({
      invitations: invitations
        .map((invitation) => {
          const meetup = meetupMap.get(invitation.meetupId.toString());
          const creator = creatorMap.get(invitation.creatorId.toString());
          if (!meetup) return null;

          return {
            id: invitation._id.toString(),
            meetupId: invitation.meetupId.toString(),
            title: meetup.title || "Untitled meetup",
            fromUsername: creator?.username || "Friend",
            createdAt: invitation.createdAt,
          };
        })
        .filter(Boolean),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/meetup-invitations/:invitationId/accept", requireAuth, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.invitationId)) {
      return res.status(400).json({ message: "Invalid invitation id." });
    }

    const invitedUserId = new ObjectId(req.user.id);
    const invitationId = new ObjectId(req.params.invitationId);
    const invitation = await db.collection(INVITATIONS).findOne({
      _id: invitationId,
      invitedUserId,
      status: "pending",
    });

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found." });
    }

    const now = new Date();
    await db.collection(PARTICIPANTS).updateOne(
      { meetupId: invitation.meetupId, userId: invitedUserId },
      {
        $setOnInsert: {
          meetupId: invitation.meetupId,
          userId: invitedUserId,
          joinedAt: now,
          location: null,
          locationSource: null,
        },
      },
      { upsert: true }
    );

    await Promise.all([
      db.collection(INVITATIONS).updateOne(
        { _id: invitationId },
        { $set: { status: "accepted", updatedAt: now, acceptedAt: now } }
      ),
      db.collection(MEETUPS).updateOne(
        { _id: invitation.meetupId },
        { $addToSet: { participantIds: invitedUserId }, $set: { updatedAt: now } }
      ),
    ]);

    return res.status(200).json({
      message: "Invitation accepted.",
      meetupId: invitation.meetupId.toString(),
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
      participantIds: [creatorId],
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
    const now = new Date();

    await db.collection(PARTICIPANTS).insertOne({
      meetupId,
      userId: creatorId,
      joinedAt: now,
      location: null,
      locationSource: null,
    });

    await db.collection(INVITATIONS).insertMany(
      invitedObjectIds.map((invitedUserId) => ({
        meetupId,
        creatorId,
        invitedUserId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })),
      { ordered: false }
    );

    return res.status(201).json({
      message: "Meetup created and invitations sent.",
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
    const { transportMode = "driving", trafficMode = "current", departureTime = null } = req.body || {};
    const result = await calculateBestMeetingPoint(algorithmInput, {
      transportMode,
      trafficMode,
      departureTime,
    });

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

router.post("/meetups/:meetupId/preview-point", requireAuth, async (req, res) => {
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

    const { lat, lng, place, transportMode = "driving", trafficMode = "current", departureTime = null } =
      req.body || {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "Valid lat and lng are required." });
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
    const result = await calculateTravelToPoint(
      algorithmInput,
      { lat, lng },
      {
        transportMode,
        trafficMode,
        departureTime,
        radiusMeters: meetup.suggestedMeetingPoint?.radiusMeters,
        selectedPlace:
          place && typeof place === "object"
            ? {
                id: typeof place.id === "string" ? place.id : "",
                name: typeof place.name === "string" ? place.name.slice(0, 120) : "Selected place",
                type: typeof place.type === "string" ? place.type : "place",
              }
            : null,
      }
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unable to preview this place." });
  }
});

router.get("/direct-messages/:userId", requireAuth, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const userId = new ObjectId(req.user.id);
    const otherUserId = new ObjectId(req.params.userId);

    if (userId.equals(otherUserId)) {
      return res.status(400).json({ message: "Choose another user to chat with." });
    }

    const otherUser = await db
      .collection(USERS)
      .findOne({ _id: otherUserId }, { projection: { username: 1, email: 1 } });
    if (!otherUser) return res.status(404).json({ message: "User not found." });

    const conversationKey = getConversationKey(userId, otherUserId);
    const messages = await db
      .collection(DIRECT_MESSAGES)
      .find({ conversationKey })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray();

    return res.status(200).json({
      contact: {
        id: otherUser._id.toString(),
        username: otherUser.username || "User",
        email: otherUser.email || "",
      },
      messages: messages.map((message) => ({
        id: message._id.toString(),
        senderId: message.senderId.toString(),
        senderUsername: message.senderId.equals(userId) ? req.user.username || "You" : otherUser.username || "User",
        isCurrentUser: message.senderId.equals(userId),
        text: message.text,
        createdAt: message.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/direct-messages/:userId", requireAuth, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const userId = new ObjectId(req.user.id);
    const otherUserId = new ObjectId(req.params.userId);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (userId.equals(otherUserId)) {
      return res.status(400).json({ message: "Choose another user to chat with." });
    }

    if (!text) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const otherUser = await db
      .collection(USERS)
      .findOne({ _id: otherUserId }, { projection: { username: 1 } });
    if (!otherUser) return res.status(404).json({ message: "User not found." });

    const now = new Date();
    const messageText = text.slice(0, 500);
    const result = await db.collection(DIRECT_MESSAGES).insertOne({
      conversationKey: getConversationKey(userId, otherUserId),
      participantIds: [userId, otherUserId],
      senderId: userId,
      recipientId: otherUserId,
      text: messageText,
      createdAt: now,
    });

    return res.status(201).json({
      message: {
        id: result.insertedId.toString(),
        senderId: userId.toString(),
        senderUsername: req.user.username || "You",
        isCurrentUser: true,
        text: messageText,
        createdAt: now,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/meetups/:meetupId/messages", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const meetup = await db.collection(MEETUPS).findOne(getMeetupLookup(req.params.meetupId));
    if (!meetup) return res.status(404).json({ message: "Meetup not found." });

    const participant = await getMeetupParticipant(meetup._id, userId);
    if (!participant) {
      return res.status(403).json({ message: "Join this meetup before opening chat." });
    }

    const messages = await db
      .collection(MESSAGES)
      .find({ meetupId: meetup._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray();
    const senderIds = [...new Set(messages.map((message) => message.senderId.toString()))].map(
      (id) => new ObjectId(id)
    );
    const senders = senderIds.length
      ? await db
          .collection(USERS)
          .find({ _id: { $in: senderIds } })
          .project({ username: 1 })
          .toArray()
      : [];
    const senderMap = new Map(senders.map((sender) => [sender._id.toString(), sender]));

    return res.status(200).json({
      messages: messages.map((message) => ({
        id: message._id.toString(),
        meetupId: message.meetupId.toString(),
        senderId: message.senderId.toString(),
        senderUsername: senderMap.get(message.senderId.toString())?.username || "User",
        isCurrentUser: message.senderId.equals(userId),
        text: message.text,
        createdAt: message.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/meetups/:meetupId/messages", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const meetup = await db.collection(MEETUPS).findOne(getMeetupLookup(req.params.meetupId));
    if (!meetup) return res.status(404).json({ message: "Meetup not found." });

    const participant = await getMeetupParticipant(meetup._id, userId);
    if (!participant) {
      return res.status(403).json({ message: "Join this meetup before sending messages." });
    }

    const now = new Date();
    const result = await db.collection(MESSAGES).insertOne({
      meetupId: meetup._id,
      senderId: userId,
      text: text.slice(0, 500),
      createdAt: now,
    });

    return res.status(201).json({
      message: {
        id: result.insertedId.toString(),
        meetupId: meetup._id.toString(),
        senderId: userId.toString(),
        senderUsername: req.user.username || "You",
        isCurrentUser: true,
        text: text.slice(0, 500),
        createdAt: now,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

async function findPlacesInRadius(req, res) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radiusMeters = parseInt(req.query.radiusMeters, 10);
    const expandWhenEmpty = req.query.expand === "true";
    const requestedType = typeof req.query.type === "string" ? req.query.type : "all";
    const allowedTypes = new Set(["all", "coffee", "restaurant", "pub", "bar", "fast_food"]);
    const placeType = allowedTypes.has(requestedType) ? requestedType : "all";

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

    const buildQuery = (searchRadiusMeters) => {
      const coffeeQueries = `
        nwr["amenity"="cafe"](around:${searchRadiusMeters},${lat},${lng});
        nwr["shop"="coffee"](around:${searchRadiusMeters},${lat},${lng});
        nwr["cuisine"="coffee_shop"](around:${searchRadiusMeters},${lat},${lng});
      `;
      const queryBody =
        placeType === "all"
          ? `
            nwr["amenity"~"^(cafe|restaurant|pub|bar|fast_food)$"](around:${searchRadiusMeters},${lat},${lng});
            nwr["shop"="coffee"](around:${searchRadiusMeters},${lat},${lng});
            nwr["cuisine"="coffee_shop"](around:${searchRadiusMeters},${lat},${lng});
          `
          : placeType === "coffee"
            ? coffeeQueries
            : `nwr["amenity"="${placeType}"](around:${searchRadiusMeters},${lat},${lng});`;

      return `
        [out:json][timeout:25];
        (
          ${queryBody}
        );
        out center;
      `;
    };

    const overpassEndpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.openstreetmap.ru/api/interpreter",
    ];

    const maxSearchRadiusMeters = 10000;
    let currentRadiusMeters = radiusMeters;
    let lastError = null;

    while (currentRadiusMeters <= maxSearchRadiusMeters) {
      const query = buildQuery(currentRadiusMeters);

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
              if (distanceFromMeetingPointMeters > currentRadiusMeters) return null;

              return {
                id: `${element.type}-${element.id}`,
                name: element.tags?.name || "Place",
                type:
                  element.tags?.shop === "coffee" || element.tags?.cuisine === "coffee_shop"
                    ? "coffee"
                    : element.tags?.amenity || element.tags?.shop || "place",
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

          if (shops.length || !expandWhenEmpty || currentRadiusMeters >= maxSearchRadiusMeters) {
            return res.status(200).json({
              places: shops,
              shops,
              radiusMeters: currentRadiusMeters,
              expanded: currentRadiusMeters > radiusMeters,
              placeType,
            });
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (!expandWhenEmpty) break;
      currentRadiusMeters = Math.min(currentRadiusMeters * 2, maxSearchRadiusMeters);
    }

    console.error(lastError);
    return res.status(502).json({ message: "Place search service is unavailable." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unable to load places." });
  }
}

router.get("/places", findPlacesInRadius);
router.get("/coffee-shops", findPlacesInRadius);

export default router;
