import app from "../server/app.js";

// All /api/* requests are routed here by the rewrite in vercel.json. The Express
// app registers its routes under /api, so ensure the prefix is present (Vercel's
// behaviour around stripping it varies — this normalisation is safe either way).
export default function handler(req, res) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
  }
  return app(req, res);
}
