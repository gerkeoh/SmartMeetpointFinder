import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { calculateBestMeetingPoint } from "../services/meetingPointService.js";

const router = express.Router();

const MEETUPS = "meetups";
const PARTICIPANTS = "participants";
const CONNECTIONS = "connections";

router.post("/meetups", requireAuth, async (req, res) => {
  try {
    const creatorId = new ObjectId(req.user.id);
    const { title = "", invitedFriendIds = [] } = req.body || {};

    if (!Array.isArray(invitedFriendIds) || invitedFriendIds.length === 0) {
      return res.status(400).json({
        message: "At least one friend must be invited.",
      });
    }

    const connections = db.collection(CONNECTIONS);

    const validEdges = await connections
      .find({
        userId: creatorId,
        friendId: { $in: invitedFriendIds.map((id) => new ObjectId(id)) },
      })
      .toArray();

    if (validEdges.length !== invitedFriendIds.length) {
      return res.status(403).json({
        message: "You can only create meetups with your friends.",
      });
    }

    const meetups = db.collection(MEETUPS);
    const participants = db.collection(PARTICIPANTS);

    const meetupDoc = {
      title: title.trim().slice(0, 80),
      creatorId,
      invitedUserIds: invitedFriendIds.map((id) => new ObjectId(id)),
      status: "collecting_locations",
      createdAt: new Date(),
      updatedAt: new Date(),
      finalLocation: null,
      suggestedMeetingPoint: null,
      algorithmMetrics: null,
    };

    const meetupResult = await meetups.insertOne(meetupDoc);
    const meetupId = meetupResult.insertedId;

    const usersCol = db.collection("users");

    const friendUsers = await usersCol
      .find({ _id: { $in: invitedFriendIds.map((id) => new ObjectId(id)) } })
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

    await participants.insertMany(participantDocs);

    return res.status(201).json({
      message: "Meetup created.",
      meetupId: meetupId.toString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/meetups/:meetupId", requireAuth, async (req, res) => {
  try {
    const meetupId = new ObjectId(req.params.meetupId);
    const currentUserId = new ObjectId(req.user.id);

    const meetupsCol = db.collection(MEETUPS);
    const participantsCol = db.collection(PARTICIPANTS);
    const usersCol = db.collection("users");

    const meetup = await meetupsCol.findOne({ _id: meetupId });

    if (!meetup) {
      return res.status(404).json({ message: "Meetup not found." });
    }

    const currentParticipant = await participantsCol.findOne({
      meetupId,
      userId: currentUserId,
    });

    if (!currentParticipant) {
      return res.status(403).json({
        message: "You do not have access to this meetup.",
      });
    }

    const participantDocs = await participantsCol.find({ meetupId }).toArray();

    const userIds = participantDocs.map((p) => p.userId);
    const users = await usersCol
      .find(
        { _id: { $in: userIds } },
        { projection: { username: 1, email: 1 } }
      )
      .toArray();

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const participants = participantDocs.map((p) => {
      const user = userMap.get(p.userId.toString());

      return {
        userId: p.userId.toString(),
        username: user?.username || "",
        email: user?.email || "",
        isCurrentUser: p.userId.equals(currentUserId),
        location: p.location || null,
        locationSource: p.locationSource || null,
        joinedAt: p.joinedAt || null,
      };
    });

    return res.status(200).json({
      meetup: {
        id: meetup._id.toString(),
        title: meetup.title,
        status: meetup.status,
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

    const maxRadius = Math.max(radiusMeters * 5, 10000);
    const radiusSteps = [radiusMeters, radiusMeters * 2, radiusMeters * 4, maxRadius];

    const buildQuery = (radius) => `
      [out:json][timeout:25];
      (
        node["amenity"="cafe"](around:${radius},${lat},${lng});
        node["shop"="coffee"](around:${radius},${lat},${lng});
        way["amenity"="cafe"](around:${radius},${lat},${lng});
        way["shop"="coffee"](around:${radius},${lat},${lng});
        relation["amenity"="cafe"](around:${radius},${lat},${lng});
        relation["shop"="coffee"](around:${radius},${lat},${lng});
      );
      out center;
    `;

    let shops = [];

    for (const radius of radiusSteps) {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: buildQuery(Math.round(radius)),
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      shops = (data.elements || [])
        .map((element) => {
          const lat = element.lat ?? element.center?.lat;
          const lng = element.lon ?? element.center?.lon;
          if (!lat || !lng) return null;

          return {
            id: `${element.type}-${element.id}`,
            name: element.tags?.name || "Coffee Shop",
            type: element.tags?.amenity || element.tags?.shop || "coffee",
            lat,
            lng,
          };
        })
        .filter(Boolean);

      if (shops.length > 0) {
        break;
      }
    }

    return res.status(200).json({ shops });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unable to load coffee shops." });
  }
});

router.post("/meetups/:meetupId/location", requireAuth, async (req, res) => {
  try {
    const meetupId = new ObjectId(req.params.meetupId);
    const userId = new ObjectId(req.user.id);
    const { lat, lng, source } = req.body || {};

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "Valid lat/lng required." });
    }

    if (!["gps", "manual"].includes(source)) {
      return res.status(400).json({
        message: "source must be 'gps' or 'manual'.",
      });
    }

    const participants = db.collection(PARTICIPANTS);
    const meetups = db.collection(MEETUPS);

    const result = await participants.updateOne(
      { meetupId, userId },
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

    await meetups.updateOne(
      { _id: meetupId },
      {
        $set: {
          status: "collecting_locations",
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({ message: "Location saved." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/meetups/:meetupId/calculate", requireAuth, async (req, res) => {
  try {
    const meetupId = new ObjectId(req.params.meetupId);
    const currentUserId = new ObjectId(req.user.id);

    const participantsCol = db.collection(PARTICIPANTS);
    const meetupsCol = db.collection(MEETUPS);

    const currentParticipant = await participantsCol.findOne({
      meetupId,
      userId: currentUserId,
    });

    if (!currentParticipant) {
      return res.status(403).json({
        message: "You do not have access to this meetup.",
      });
    }

    const participantDocs = await participantsCol
      .find({
        meetupId,
        location: { $ne: null },
      })
      .toArray();

    if (participantDocs.length < 2) {
      return res.status(400).json({
        message: "At least two participant locations are required.",
      });
    }

    const algorithmInput = participantDocs.map((p) => ({
      userId: p.userId.toString(),
      lat: p.location.lat,
      lng: p.location.lng,
    }));

    const result = calculateBestMeetingPoint(algorithmInput);

    await meetupsCol.updateOne(
      { _id: meetupId },
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

export default router;