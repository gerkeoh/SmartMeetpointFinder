import express from "express";
import { ObjectId } from "mongodb";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

const USERS = "users";
const CONNECTIONS = "connections";

// Helpful indexes
async function ensureIndexes() {
  const connections = db.collection(CONNECTIONS);

  // Prevent duplicate friend edges (A -> B)
  await connections.createIndex(
    { userId: 1, friendId: 1 },
    { unique: true }
  );

  // Useful for listing
  await connections.createIndex({ userId: 1 });

  // Optional: search index helpers (Mongo does fine without, but nice)
  await db.collection(USERS).createIndex({ username: 1 });
  await db.collection(USERS).createIndex({ email: 1 });
}
ensureIndexes().catch(console.error);

/**
 * GET /api/users/search?q=...
 * Returns minimal public user info for search.
 * (Excludes the requester and excludes already-friends.)
 */
router.get("/users/search", requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(200).json({ results: [] });

    const userId = new ObjectId(req.user.id);

    // Find existing friendIds so we can exclude them from results
    const connections = db.collection(CONNECTIONS);
    const friendEdges = await connections
      .find({ userId })
      .project({ friendId: 1 })
      .toArray();

    const friendIds = friendEdges.map((e) => e.friendId);

    const users = db.collection(USERS);

    // Simple case-insensitive match for username or email
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const results = await users
      .find(
        {
          _id: { $ne: userId, ...(friendIds.length ? { $nin: friendIds } : {}) },
          $or: [{ username: regex }, { email: regex }],
        },
        { projection: { passwordHash: 0 } }
      )
      .project({ _id: 1, username: 1, email: 1 })
      .limit(10)
      .toArray();

    return res.status(200).json({
      results: results.map((u) => ({
        id: u._id.toString(),
        username: u.username,
        email: u.email,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

/**
 * GET /api/friends
 * Lists your friends (returns friend user docs).
 */
router.get("/friends", requireAuth, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const connections = db.collection(CONNECTIONS);

    const edges = await connections
      .find({ userId })
      .project({ friendId: 1, createdAt: 1 })
      .toArray();

    if (!edges.length) return res.status(200).json({ friends: [] });

    const friendIds = edges.map((e) => e.friendId);
    const users = db.collection(USERS);

    const friends = await users
      .find({ _id: { $in: friendIds } })
      .project({ _id: 1, username: 1, email: 1 })
      .toArray();

    // Keep response stable
    const byId = new Map(friends.map((f) => [f._id.toString(), f]));
    const ordered = friendIds
      .map((id) => byId.get(id.toString()))
      .filter(Boolean)
      .map((u) => ({ id: u._id.toString(), username: u.username, email: u.email }));

    return res.status(200).json({ friends: ordered });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

/**
 * POST /api/friends/add
 * Body: { friendId } OR { username } OR { email }
 * Adds friend both ways (A<->B) for "friend" semantics.
 */
router.post("/friends/add", requireAuth, async (req, res) => {
  try {
    const me = new ObjectId(req.user.id);
    const { friendId, username, email } = req.body || {};

    const users = db.collection(USERS);

    let friend = null;
    if (friendId) {
      friend = await users.findOne({ _id: new ObjectId(friendId) });
    } else if (username) {
      friend = await users.findOne({ username: username.trim() });
    } else if (email) {
      friend = await users.findOne({ email: email.trim().toLowerCase() });
    } else {
      return res.status(400).json({ message: "Provide friendId, username, or email." });
    }

    if (!friend) return res.status(404).json({ message: "User not found." });

    const them = new ObjectId(friend._id);
    if (me.equals(them)) return res.status(400).json({ message: "You can't add yourself." });

    const connections = db.collection(CONNECTIONS);

    // Insert both directions to represent "friends"
    // If one already exists, unique index will block duplicates.
    await connections.insertMany(
      [
        { userId: me, friendId: them, createdAt: new Date() },
        { userId: them, friendId: me, createdAt: new Date() },
      ],
      { ordered: false }
    );

    return res.status(200).json({
      message: "Friend added.",
      friend: { id: friend._id.toString(), username: friend.username, email: friend.email },
    });
  } catch (err) {
    // Duplicate friend edge
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Already friends." });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

/**
 * POST /api/friends/remove
 * Body: { friendId }
 * Removes both directions.
 */
router.post("/friends/remove", requireAuth, async (req, res) => {
  try {
    const me = new ObjectId(req.user.id);
    const { friendId } = req.body || {};
    if (!friendId) return res.status(400).json({ message: "friendId is required." });

    const them = new ObjectId(friendId);
    const connections = db.collection(CONNECTIONS);

    await connections.deleteMany({
      $or: [
        { userId: me, friendId: them },
        { userId: them, friendId: me },
      ],
    });

    return res.status(200).json({ message: "Friend removed." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
