import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config(); // Load environment variables

const app = express();
app.use(express.json());

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ALCHEMY_URL = process.env.ALCHEMY_API_URL; // Replace with actual Alchemy API endpoint
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

// ✅ Auto-Refresh Access Token
async function getAccessToken() {
    try {
        const response = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
                grant_type: "refresh_token"
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Error refreshing token: ${data.error}`);
        }

        process.env.GOOGLE_ACCESS_TOKEN = data.access_token; // Store in memory
        return data.access_token;
    } catch (error) {
        console.error("🚨 Failed to refresh access token:", error.message);
        return null;
    }
}

// ✅ Google Calendar Webhook - Handle Event Updates
app.post("/calendar-webhook", async (req, res) => {
    console.log("📡 Received Calendar Update:", JSON.stringify(req.body, null, 2));

    const eventId = req.body.id;
    const status = req.body.status; // Check if it's cancelled
    const startTime = req.body.start?.dateTime;
    const endTime = req.body.end?.dateTime;

    if (!eventId) {
        console.error("❌ Missing Event ID.");
        return res.status(400).json({ error: "Missing Event ID" });
    }

    // ✅ If event was deleted
    if (status === "cancelled") {
        console.log(`❌ Event ${eventId} was cancelled.`);
        await sendUpdateToAlchemy(eventId, "cancelled", null, null);
        return res.sendStatus(200);
    }

    // ✅ If event was moved
    if (startTime && endTime) {
        console.log(`📅 Event ${eventId} moved to: ${startTime} - ${endTime}`);
        await sendUpdateToAlchemy(eventId, "moved", startTime, endTime);
    }

    res.sendStatus(200);
});

// ✅ Send Update to Alchemy
async function sendUpdateToAlchemy(eventId, action, newStart, newEnd) {
    const payload = {
        eventId: eventId,
        action: action,
        newStart: newStart,
        newEnd: newEnd
    };

    console.log("📤 Sending Update to Alchemy:", JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(ALCHEMY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("❌ Error sending update to Alchemy:", await response.text());
        } else {
            console.log("✅ Successfully updated Alchemy.");
        }
    } catch (error) {
        console.error("🚨 Failed to connect to Alchemy:", error.message);
    }
}

// ✅ Auto-Renew Google Webhook Every 23 Hours
async function refreshWebhook() {
    console.log("🔄 Refreshing Google Calendar Webhook...");

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${GOOGLE_CALENDAR_ID}/events/watch`, {
        method: "POST",
        headers: { 
            "Authorization": `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}`, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({
            id: "alchemy-channel-123",
            type: "web_hook",
            address: "https://google-calendar-middleware.onrender.com/calendar-webhook",
            params: { ttl: "86400" }
        })
    });

    if (response.ok) {
        console.log("✅ Webhook successfully refreshed.");
    } else {
        console.error("❌ Failed to refresh webhook:", await response.text());
    }
}

// ✅ Schedule webhook refresh every 23 hours
cron.schedule("0 */23 * * *", refreshWebhook);

// ✅ Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📡 Middleware running on port ${PORT}`);
});

