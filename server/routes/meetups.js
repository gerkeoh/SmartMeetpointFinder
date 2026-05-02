import express from "express";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();
const MEETUPS = "meetups";
const CONNECTIONS = "connections";

function createMeetupSaveId() {
  return `meetup_${randomUUID()}`;
}

async function ensureIndexes() {
  await db.collection(MEETUPS).createIndex({ userId: 1, createdAt: -1 });
  await db.collection(MEETUPS).createIndex({ meetupSaveId: 1 }, { unique: true });
}
ensureIndexes().catch(console.error);

router.get("/meetups", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const meetups = await db
      .collection(MEETUPS)
      .find({ userId })
      .toArray();

    return res.status(200).json({
      meetups: meetups.map((meetup) => ({
        id: meetup._id.toString(),
        meetupSaveId: meetup.meetupSaveId || meetup._id.toString(),
        title: meetup.title || "",
        participantIds: meetup.participantIds?.map((id) => id.toString()) || [],
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
    const userId = new ObjectId(req.user.id);
    const { title, friendId, friendIds, invitedFriendId, invitedFriendIds } = req.body || {};
    const requestedFriendIds = [
      ...(Array.isArray(friendIds) ? friendIds : []),
      ...(Array.isArray(invitedFriendIds) ? invitedFriendIds : []),
      friendId,
      invitedFriendId,
    ].filter(Boolean);

    if (requestedFriendIds.length === 0) {
      return res.status(400).json({ message: "One friend is required." });
    }

    const uniqueFriendIds = [...new Set(requestedFriendIds.filter((id) => typeof id === "string"))];
    const hasInvalidFriendId = uniqueFriendIds.some((id) => !ObjectId.isValid(id));

    if (uniqueFriendIds.length !== 1) {
      return res.status(400).json({ message: "Choose exactly one friend for this meetup." });
    }

    if (hasInvalidFriendId) {
      return res.status(400).json({ message: "One or more friendIds are invalid." });
    }

    const participantIds = uniqueFriendIds.map((id) => new ObjectId(id));

    const friendCount = await db.collection(CONNECTIONS).countDocuments({
      userId,
      friendId: { $in: participantIds },
    });

    if (friendCount !== participantIds.length) {
      return res.status(400).json({ message: "Meetups can only include your friends." });
    }

    const meetup = {
      userId,
      meetupSaveId: createMeetupSaveId(),
      title: typeof title === "string" ? title.trim() : "",
      participantIds,
      createdAt: new Date(),
    };

    const result = await db.collection(MEETUPS).insertOne(meetup);

    return res.status(200).json({
      message: "Meetup created.",
      meetupId: result.insertedId.toString(),
      meetupSaveId: meetup.meetupSaveId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
