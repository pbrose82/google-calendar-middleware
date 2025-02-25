import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon"; // ✅ Import Luxon for date handling

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Function to Convert Date to "YYYY-MM-DDTHH:mm:ss" Without Timezone Offset
function convertToISO(dateString, timeZone) {
    try {
        // ✅ Remove 'Z' or timezone offset if present before parsing
        let cleanDateString = dateString.replace(/Z$/, "").replace(/([-+]\d{2}:\d{2})$/, "");

        // ✅ Convert input date from "MMM dd yyyy hh:mm a" to simple string
        const date = DateTime.fromFormat(cleanDateString, "MMM dd yyyy hh:mm a", { zone: timeZone });

        if (!date.isValid) {
            throw new Error(`Invalid date format received: ${dateString}`);
        }

        return date.toFormat("yyyy-MM-dd'T'HH:mm:ss"); // ✅ Returns a simple String without ZonedDateTime
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
    console.log("🔵 Received request from Alchemy:", JSON.stringify(req.body, null, 2)); // ✅ Log full request payload

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({ error: "Failed to obtain access token" });
    }

    try {
        // ✅ Use correct timezone (default to America/New_York)
        const timeZone = req.body.timeZone || "America/New_York";

        // ✅ Log the raw StartUse and EndUse before conversion
        console.log("🔵 Raw StartUse from Alchemy:", req.body.StartUse);
        console.log("🔵 Raw EndUse from Alchemy:", req.body.EndUse);

        // ✅ Convert StartUse and EndUse to correct format inside the middleware
        const formattedStartUse = convertToISO(req.body.StartUse, timeZone);
        const formattedEndUse = convertToISO(req.body.EndUse, timeZone);

        // ✅ Log the formatted dates before sending to Google Calendar
        console.log("🟢 Formatted StartUse:", formattedStartUse);
        console.log("🟢 Formatted EndUse:", formattedEndUse);

        if (!formattedStartUse || !formattedEndUse) {
            return res.status(400).json({ error: "Invalid date format for StartUse or EndUse" });
        }

        const eventBody = {
            calendarId: req.body.calendarId,
            summary: req.body.summary || "Default Event Name",
            location: req.body.location || "No Location Provided",
            description: req.body.description || "No Description",
            start: {
                dateTime: formattedStartUse, // ✅ Converted here, no timezone offset
                timeZone: timeZone
            },
            end: {
                dateTime: formattedEndUse, // ✅ Converted here, no timezone offset
                timeZone: timeZone
            },
            attendees: req.body.attendees || [],
            reminders: req.body.reminders || { useDefault: true }
        };

        console.log("🟢 Final Event Payload:", JSON.stringify(eventBody, null, 2));

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
        console.error("🔴 Error creating event:", error.message);
        res.status(500).json({ error: "Failed to create event", details: error.message });
    }
});

// ✅ Fix Port Binding for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Middleware running on port ${PORT}`);
});
