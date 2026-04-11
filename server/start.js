import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "config.env") });

console.log("ATLAS_URI loaded?", Boolean(process.env.ATLAS_URI));

await import("./server.js");
