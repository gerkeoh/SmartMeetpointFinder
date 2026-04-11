import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ message: "Missing auth token." });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "JWT_SECRET not set." });

    const payload = jwt.verify(token, secret);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}
