import express from 'express'
import cors from 'cors'
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from './routes/auth.js'
import friendsRoutes from "./routes/friends.js";
import profileRoutes from "./routes/profile.js";
import meetupsRouter from "./routes/meetups.js";

const PORT = process.env.PORT || 5000
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientBuildPath = path.join(__dirname, "..", "build");

app.use(cors())
app.use(express.json())

app.get("/api", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api", friendsRoutes);
app.use("/api", profileRoutes);
app.use("/api", meetupsRouter);

app.use(express.static(clientBuildPath));

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    return next();
  }

  return res.sendFile(path.join(clientBuildPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
