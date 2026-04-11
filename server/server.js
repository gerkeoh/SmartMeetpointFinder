import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import friendsRoutes from "./routes/friends.js";
import profileRoutes from "./routes/profile.js";
import meetupsRouter from "./routes/meetups.js";

const PORT = process.env.PORT || 5000
const app = express();

app.use(cors())
app.use(express.json())

app.get("/api", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api", friendsRoutes);
app.use("/api", profileRoutes);
app.use("/api", meetupsRouter);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});