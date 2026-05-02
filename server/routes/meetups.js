import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();
const MEETUPS = "meetups";

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
    const { title, friendIds } = req.body || {};

    if (!Array.isArray(friendIds) || friendIds.length === 0) {
      return res.status(400).json({ message: "At least one friendId is required." });
    }

    const participantIds = friendIds
      .filter((id) => typeof id === "string")
      .map((id) => new ObjectId(id));

    const meetup = {
      userId,
      title: typeof title === "string" ? title.trim() : "",
      participantIds,
      createdAt: new Date(),
    };

    const result = await db.collection(MEETUPS).insertOne(meetup);

    return res.status(200).json({
      message: "Meetup created.",
      meetupId: result.insertedId.toString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
