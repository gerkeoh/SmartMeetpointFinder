import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db/connection.js";

const router = express.Router();

const USERS_COLLECTION = "users";

// Ensure unique indexes exist (email + username)
async function ensureIndexes() {
  const users = db.collection(USERS_COLLECTION);
  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ username: 1 }, { unique: true });
}
ensureIndexes().catch(console.error);

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, username, password, confirmPassword } = req.body;

    // Basic validation
    if (!email || !username || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const users = db.collection(USERS_COLLECTION);

    // Check duplicates (nice message)
    const emailLower = email.trim().toLowerCase();
    const usernameTrim = username.trim();

    const existingEmail = await users.findOne({ email: emailLower });
    if (existingEmail) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const existingUsername = await users.findOne({ username: usernameTrim });
    if (existingUsername) {
      return res.status(409).json({ message: "Username already in use." });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await users.insertOne({
      email: emailLower,
      username: usernameTrim,
      passwordHash,
      createdAt: new Date(),
    });

    return res.status(201).json({ message: "Account created.", userId: result.insertedId });
  } catch (err) {
    // Handle unique index violations (race condition safe)
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return res.status(409).json({ message: `${field} already in use.` });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: "Email/username and password are required." });
    }

    const users = db.collection(USERS_COLLECTION);

    const q = emailOrUsername.includes("@")
      ? { email: emailOrUsername.trim().toLowerCase() }
      : { username: emailOrUsername.trim() };

    const user = await users.findOne(q);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ message: "JWT_SECRET not set on server." });
    }

    const token = jwt.sign(
      { sub: user._id.toString(), username: user.username },
      jwtSecret,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Logged in.",
      token,
      user: { id: user._id, email: user.email, username: user.username },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
