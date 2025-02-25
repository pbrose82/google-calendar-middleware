import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Function to refresh the access token
async function getAccessToken() {
    const params = new URLSearchParams();
    params.append("client_id", CLIENT_ID);
    params.append("client_secret", CLIENT_SECRET);
    params.append("refresh_token", REFRESH_TOKEN);
    params.append("grant_type", "refresh_token");

    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const data = await response.json();
    if (data.access_token) {
        return data.access_token;
    } else {
        console.error("Failed to refresh token:", data);
        return null;
    }
}

// API Route: Create Google Calendar Event
app.post("/create-event", async (req, res) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({ error: "Failed to obtain access token" });
    }

    const calendarId = req.body.calendarId || "primary";
    const lambda_url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
    };

    try {
        const response = await fetch(lambda_url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        if (response.ok) {
            res.json({ success: true, event: data });
        } else {
            res.status(400).json({ error: "Failed to create event", details: data });
        }
    } catch (error) {
        res.status(500).json({ error: "Internal server error", details: error });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Middleware running on http://localhost:${PORT}`);
});

