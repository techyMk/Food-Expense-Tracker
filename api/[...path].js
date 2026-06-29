import app from "../server/app.js";

// Vercel routes every /api/* request to this catch-all function. The Express app
// registers its routes under /api, so make sure the prefix is present (Vercel's
// behaviour around stripping it varies — this normalisation is safe either way).
export default function handler(req, res) {
  if (req.url && !req.url.startsWith("/api")) {
    req.url = "/api" + (req.url.startsWith("/") ? "" : "/") + req.url;
  }
  return app(req, res);
}
