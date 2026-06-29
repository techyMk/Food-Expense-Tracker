import "dotenv/config";
import app, { ensureSchema } from "./app.js";
import { isConfigured } from "./db.js";

// Local development / `npm start` entry. (On Vercel, api/[...path].js is used instead.)
const PORT = process.env.PORT || 3001;

async function start() {
  if (!isConfigured) {
    console.warn("⚠️  NEON_DATABASE_URL is not set in .env — the app will show the setup screen.");
  } else {
    try {
      await ensureSchema();
      console.log("✅ Connected to Neon and ensured tables exist.");
    } catch (e) {
      console.error("❌ Could not connect to Neon. Check NEON_DATABASE_URL in .env.\n", e.message);
    }
  }
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

start();
