import { Router } from "express";
import fetch from "node-fetch";

const router = Router();

router.post("/token", async (req, res) => {
  try {
    const response = await fetch(`https://discord.com/api/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.body.code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[token exchange] Discord error:", data);
      return res.status(response.status).json({
        error: data.error_description ?? data.error ?? "Discord token exchange failed",
      });
    }

    res.send({ access_token: data.access_token });
  } catch (err) {
    console.error("[token exchange] Unexpected error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
