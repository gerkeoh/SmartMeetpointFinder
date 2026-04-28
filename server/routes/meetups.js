import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { calculateBestMeetingPoint } from "../services/meetingPointService.js";

const router = express.Router();

const MEETUPS = "meetups";
const PARTICIPANTS = "participants";
const CONNECTIONS = "connections";

function toObjectId(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

router.post("/meetups", requireAuth, async (req, res) => {
  try {
    const creatorId = new ObjectId(req.user.id);
    const { title = "", invitedFriendIds = [] } = req.body || {};

    const cleanTitle = title.trim().slice(0, 80);

    if (!cleanTitle) {
      return res.status(400).json({
        message: "Meetup name is required.",
      });
    }

    if (!Array.isArray(invitedFriendIds) || invitedFriendIds.length === 0) {
      return res.status(400).json({
        message: "At least one friend must be invited.",
      });
    }

    const invitedObjectIds = invitedFriendIds.map(toObjectId);

    if (invitedObjectIds.some((id) => !id)) {
      return res.status(400).json({
        message: "Invalid invited friend id.",
      });
    }

    const connections = db.collection(CONNECTIONS);

    const validEdges = await connections
      .find({
        userId: creatorId,
        friendId: { $in: invitedObjectIds },
      })
      .toArray();

    if (validEdges.length !== invitedObjectIds.length) {
      return res.status(403).json({
        message: "You can only create meetups with your friends.",
      });
    }

    const meetups = db.collection(MEETUPS);
    const participants = db.collection(PARTICIPANTS);

    const meetupDoc = {
      title: cleanTitle,
      creatorId,
      invitedUserIds: invitedObjectIds,
      status: "pending_responses",
      createdAt: new Date(),
      updatedAt: new Date(),
      finalLocation: null,
      suggestedMeetingPoint: null,
      algorithmMetrics: null,
    };

    const meetupResult = await meetups.insertOne(meetupDoc);
    const meetupId = meetupResult.insertedId;

    const participantDocs = [
      {
        meetupId,
        userId: creatorId,
        role: "creator",
        inviteStatus: "accepted",
        respondedAt: new Date(),
        joinedAt: new Date(),
        location: null,
        locationSource: null,
      },
      ...invitedObjectIds.map((friendId) => ({
        meetupId,
        userId: friendId,
        role: "invitee",
        inviteStatus: "pending",
        respondedAt: null,
        joinedAt: null,
        location: null,
        locationSource: null,
      })),
    ];

    await participants.insertMany(participantDocs);

    return res.status(201).json({
      message: "Meetup created. Invitations sent.",
      meetupId: meetupId.toString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/meetups", requireAuth, async (req, res) => {
  try {
    const currentUserId = new ObjectId(req.user.id);

    const participantsCol = db.collection(PARTICIPANTS);
    const meetupsCol = db.collection(MEETUPS);

    const myParticipantRows = await participantsCol
      .find({ userId: currentUserId })
      .sort({ joinedAt: -1 })
      .toArray();

    const meetupIds = myParticipantRows.map((p) => p.meetupId);

    const meetupDocs = await meetupsCol
      .find({ _id: { $in: meetupIds } })
      .sort({ updatedAt: -1 })
      .toArray();

    const participantMap = new Map(
      myParticipantRows.map((p) => [p.meetupId.toString(), p])
    );

    const meetups = meetupDocs.map((meetup) => {
      const myParticipant = participantMap.get(meetup._id.toString());

      return {
        id: meetup._id.toString(),
        title: meetup.title,
        status: meetup.status,
        isCreator: meetup.creatorId.equals(currentUserId),
        myInviteStatus: myParticipant?.inviteStatus || "pending",
        createdAt: meetup.createdAt,
        updatedAt: meetup.updatedAt,
        suggestedMeetingPoint: meetup.suggestedMeetingPoint || null,
      };
    });

    return res.status(200).json({ meetups });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/meetups/:meetupId", requireAuth, async (req, res) => {
  try {
    const meetupId = toObjectId(req.params.meetupId);
    const currentUserId = new ObjectId(req.user.id);

    if (!meetupId) {
      return res.status(400).json({ message: "Invalid meetup id." });
    }

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
        isCreator: p.userId.equals(meetup.creatorId),
        role: p.role || "invitee",
        inviteStatus: p.inviteStatus || "pending",
        location: p.inviteStatus === "accepted" ? p.location || null : null,
        locationSource: p.locationSource || null,
        joinedAt: p.joinedAt || null,
      };
    });

    return res.status(200).json({
      meetup: {
        id: meetup._id.toString(),
        title: meetup.title,
        status: meetup.status,
        isCreator: meetup.creatorId.equals(currentUserId),
        myInviteStatus: currentParticipant.inviteStatus || "pending",
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

router.post("/meetups/:meetupId/respond", requireAuth, async (req, res) => {
  try {
    const meetupId = toObjectId(req.params.meetupId);
    const userId = new ObjectId(req.user.id);
    const { response } = req.body || {};

    if (!meetupId) {
      return res.status(400).json({ message: "Invalid meetup id." });
    }

    if (!["accepted", "rejected"].includes(response)) {
      return res.status(400).json({
        message: "Response must be accepted or rejected.",
      });
    }

    const participantsCol = db.collection(PARTICIPANTS);
    const meetupsCol = db.collection(MEETUPS);

    const participant = await participantsCol.findOne({ meetupId, userId });

    if (!participant) {
      return res.status(404).json({ message: "Invitation not found." });
    }

    if (participant.role === "creator") {
      return res.status(400).json({
        message: "The creator is already accepted.",
      });
    }

    await participantsCol.updateOne(
      { meetupId, userId },
      {
        $set: {
          inviteStatus: response,
          respondedAt: new Date(),
          joinedAt: response === "accepted" ? new Date() : null,
          location: null,
          locationSource: null,
        },
      }
    );

    await meetupsCol.updateOne(
      { _id: meetupId },
      {
        $set: {
          status: "collecting_locations",
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      message:
        response === "accepted"
          ? "Invitation accepted."
          : "Invitation rejected.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/meetups/:meetupId/location", requireAuth, async (req, res) => {
  try {
    const meetupId = toObjectId(req.params.meetupId);
    const userId = new ObjectId(req.user.id);
    const { lat, lng, source } = req.body || {};

    if (!meetupId) {
      return res.status(400).json({ message: "Invalid meetup id." });
    }

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "Valid lat/lng required." });
    }

    if (!["gps", "manual"].includes(source)) {
      return res.status(400).json({
        message: "source must be 'gps' or 'manual'.",
      });
    }

    const participantsCol = db.collection(PARTICIPANTS);
    const meetupsCol = db.collection(MEETUPS);

    const participant = await participantsCol.findOne({ meetupId, userId });

    if (!participant) {
      return res.status(404).json({ message: "Participant record not found." });
    }

    if (participant.inviteStatus !== "accepted") {
      return res.status(403).json({
        message: "Accept the invitation before sharing your location.",
      });
    }

    await participantsCol.updateOne(
      { meetupId, userId },
      {
        $set: {
          location: { lat, lng, updatedAt: new Date() },
          locationSource: source,
          joinedAt: participant.joinedAt || new Date(),
        },
      }
    );

    await meetupsCol.updateOne(
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
    const meetupId = toObjectId(req.params.meetupId);
    const currentUserId = new ObjectId(req.user.id);

    if (!meetupId) {
      return res.status(400).json({ message: "Invalid meetup id." });
    }

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

    const acceptedParticipants = await participantsCol
      .find({
        meetupId,
        inviteStatus: "accepted",
      })
      .toArray();

    const missingLocation = acceptedParticipants.filter((p) => !p.location);

    if (acceptedParticipants.length < 2) {
      return res.status(400).json({
        message: "At least two accepted participants are required.",
      });
    }

    if (missingLocation.length > 0) {
      return res.status(400).json({
        message:
          "All accepted participants must share their location before calculating.",
      });
    }

    const algorithmInput = acceptedParticipants.map((p) => ({
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