import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { calculateBestMeetingPoint } from "../services/meetingPointService.js";

const router = express.Router();

const MEETUPS = "meetups";
const PARTICIPANTS = "participants";
const CONNECTIONS = "connections";

const toObjectIds = (ids = []) => ids.map((id) => new ObjectId(id));

const buildMeetupResponse = async (meetup, currentUserId) => {
  const participantsCol = db.collection(PARTICIPANTS);
  const usersCol = db.collection("users");

  const participantDocs = await participantsCol.find({ meetupId: meetup._id }).toArray();

  const users = await usersCol
    .find(
      { _id: { $in: participantDocs.map((p) => p.userId) } },
      { projection: { username: 1, email: 1 } }
    )
    .toArray();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return {
    meetup: {
      id: meetup._id.toString(),
      title: meetup.title,
      status: meetup.status,
      isCreator: meetup.creatorId.equals(currentUserId),
      suggestedMeetingPoint: meetup.suggestedMeetingPoint || null,
      algorithmMetrics: meetup.algorithmMetrics || null,
    },
    suggestedMeetingPoint: meetup.suggestedMeetingPoint || null,
    participants: participantDocs.map((p) => {
      const user = userMap.get(p.userId.toString());

      return {
        userId: p.userId.toString(),
        username: user?.username || "",
        email: user?.email || "",
        isCurrentUser: p.userId.equals(currentUserId),
        responseStatus: p.responseStatus,
        location: p.responseStatus === "accepted" ? p.location || null : null,
        locationSource: p.locationSource || null,
      };
    }),
  };
};

router.post("/meetups", requireAuth, async (req, res) => {
  try {
    const creatorId = new ObjectId(req.user.id);
    const { title = "", invitedFriendIds = [] } = req.body || {};

    if (!title.trim()) {
      return res.status(400).json({ message: "Meetup name is required." });
    }

    if (!Array.isArray(invitedFriendIds) || invitedFriendIds.length === 0) {
      return res.status(400).json({
        message: "At least one friend must be invited.",
      });
    }

    const invitedIds = toObjectIds(invitedFriendIds);

    const validEdges = await db
      .collection(CONNECTIONS)
      .find({
        userId: creatorId,
        friendId: { $in: invitedIds },
      })
      .toArray();

    if (validEdges.length !== invitedFriendIds.length) {
      return res.status(403).json({
        message: "You can only create meetups with your friends.",
      });
    }

    const meetupDoc = {
      title: title.trim().slice(0, 80),
      creatorId,
      invitedUserIds: invitedIds,
      status: "pending_responses",
      createdAt: new Date(),
      updatedAt: new Date(),
      finalLocation: null,
      suggestedMeetingPoint: null,
      algorithmMetrics: null,
    };

    const meetupResult = await db.collection(MEETUPS).insertOne(meetupDoc);
    const meetupId = meetupResult.insertedId;

    await db.collection(PARTICIPANTS).insertMany([
      {
        meetupId,
        userId: creatorId,
        responseStatus: "accepted",
        respondedAt: new Date(),
        location: null,
        locationSource: null,
      },
      ...invitedIds.map((userId) => ({
        meetupId,
        userId,
        responseStatus: "pending",
        respondedAt: null,
        location: null,
        locationSource: null,
      })),
    ]);

    return res.status(201).json({
      message: "Meetup invitations sent.",
      meetupId: meetupId.toString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/meetups", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);

    const participantDocs = await db
      .collection(PARTICIPANTS)
      .find({ userId, responseStatus: { $ne: "rejected" } })
      .toArray();

    const meetupIds = participantDocs.map((p) => p.meetupId);

    const meetups = await db
      .collection(MEETUPS)
      .find({ _id: { $in: meetupIds } })
      .sort({ updatedAt: -1 })
      .toArray();

    const responseMap = new Map(
      participantDocs.map((p) => [p.meetupId.toString(), p.responseStatus])
    );

    return res.status(200).json({
      meetups: meetups.map((m) => ({
        id: m._id.toString(),
        title: m.title || "Untitled meetup",
        status: m.status,
        isCreator: m.creatorId.equals(userId),
        responseStatus: responseMap.get(m._id.toString()),
      })),
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

    return res.status(200).json(await buildMeetupResponse(meetup, currentUserId));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.patch("/meetups/:meetupId/respond", requireAuth, async (req, res) => {
  try {
    const meetupId = new ObjectId(req.params.meetupId);
    const userId = new ObjectId(req.user.id);
    const { response } = req.body || {};

    if (!["accepted", "rejected"].includes(response)) {
      return res.status(400).json({
        message: "response must be accepted or rejected.",
      });
    }

    const result = await db.collection(PARTICIPANTS).updateOne(
      {
        meetupId,
        userId,
        responseStatus: "pending",
      },
      {
        $set: {
          responseStatus: response,
          respondedAt: new Date(),
          location: null,
          locationSource: null,
        },
      }
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        message: "Pending invitation not found.",
      });
    }

    await db.collection(MEETUPS).updateOne(
      { _id: meetupId },
      {
        $set: {
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({ message: `Invitation ${response}.` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
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
      {
        meetupId,
        userId,
        responseStatus: "accepted",
      },
      {
        $set: {
          location: { lat, lng, updatedAt: new Date() },
          locationSource: source,
        },
      }
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        message: "Accepted participant record not found.",
      });
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

    const meetup = await meetupsCol.findOne({ _id: meetupId });

    if (!meetup) {
      return res.status(404).json({ message: "Meetup not found." });
    }

    if (!meetup.creatorId.equals(currentUserId)) {
      return res.status(403).json({
        message: "Only the meetup creator can calculate the meeting point.",
      });
    }

    const participantDocs = await participantsCol
      .find({
        meetupId,
        responseStatus: "accepted",
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
