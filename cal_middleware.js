import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Function to Convert Date to Correct ISO Format While Preserving Timezone
function convertToISO(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format received: ${dateString}`);
        }

        // Format as "YYYY-MM-DDTHH:mm:ss-XX:XX" while preserving timezone offset
        const offset = -date.getTimezoneOffset(); // Offset in minutes
        const sign = offset >= 0 ? "+" : "-";
        const hoursOffset = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
        const minutesOffset = String(Math.abs(offset) % 60).padStart(2, "0");

        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}${sign}${hoursOffset}:${minutesOffset}`;
    } catch (error) {
        console.error("Date conversion error:", error.message);
        return null;
    }
}

// ✅ Health Check Route
app.get("/", (req, res) => {
    res.json({ message: "Middleware is running!" });
});

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ✅ Function to refresh the access token
async function getAccessToken() {
    try {
        const response = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: REFRESH_TOKEN,
                grant_type: "refresh_token"
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Error: ${data.error}, Details: ${JSON.stringify(data)}`);
        }

        return data.access_token;
    } catch (error) {
        console.error("Error refreshing token:", error.message);
        return null;
    }
}

// ✅ Google Calendar Event Creation Endpoint
app.post("/create-event", async (req, res) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({ error: "Failed to obtain access token" });
    }

    try {
        // ✅ Convert StartUse and EndUse to correct format inside the middleware
        const formattedStartUse = convertToISO(req.body.StartUse);
        const formattedEndUse = convertToISO(req.body.EndUse);

        if (!formattedStartUse || !formattedEndUse) {
            return res.status(400).json({ error: "Invalid date format for StartUse or EndUse" });
        }

        const eventBody = {
            calendarId: req.body.calendarId,
            summary: req.body.summary || "Default Event Name",
            location: req.body.location || "No Location Provided",
            description: req.body.description || "No Description",
            start: {
                dateTime: formattedStartUse, // ✅ Converted here
                timeZone: req.body.timeZone || "America/New_York"
            },
            end: {
                dateTime: formattedEndUse, // ✅ Converted here
                timeZone: req.body.timeZone || "America/New_York"
            },
            attendees: req.body.attendees || [],
            reminders: req.body.reminders || { useDefault: true }
        };

        const calendarApiUrl = `https://www.googleapis.com/calendar/v3/calendars/${req.body.calendarId}/events`;

        const response = await fetch(calendarApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(eventBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Error creating event: ${data.error}, Details: ${JSON.stringify(data)}`);
        }

        res.status(200).json({ success: true, event: data });
    } catch (error) {
        console.error("Error creating event:", error.message);
        res.status(500).json({ error: "Failed to cr
