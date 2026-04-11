import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

const USERS = "users";
const CONNECTIONS = "connections";

/**
 * GET /api/profile
 * Returns the logged-in user's profile + friend count.
 */
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);

    const users = db.collection(USERS);
    const user = await users.findOne(
      { _id: userId },
      { projection: { passwordHash: 0 } }
    );

    if (!user) return res.status(404).json({ message: "User not found." });

    const connections = db.collection(CONNECTIONS);
    const friendCount = await connections.countDocuments({ userId });

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        displayName: user.displayName || "",
        bio: user.bio || "",
        createdAt: user.createdAt || null,
      },
      friendCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

/**
 * PATCH /api/profile
 * Body: { displayName?, bio? }
 */
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const { displayName, bio } = req.body || {};

    // simple input hygiene
    const safeDisplayName =
      typeof displayName === "string" ? displayName.trim().slice(0, 40) : undefined;
    const safeBio = typeof bio === "string" ? bio.trim().slice(0, 200) : undefined;

    const $set = {};
    if (safeDisplayName !== undefined) $set.displayName = safeDisplayName;
    if (safeBio !== undefined) $set.bio = safeBio;

    if (!Object.keys($set).length) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const users = db.collection(USERS);
    await users.updateOne({ _id: userId }, { $set });

    return res.status(200).json({ message: "Profile updated." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;