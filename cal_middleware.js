import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon"; 

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Health Check Route (Keeps Render Active)
app.get("/health", (req, res) => {
    res.status(200).json({ status: "Middleware is running fine" });
});

// ✅ Convert Alchemy's Date Format ("MMM dd yyyy hh:mm a") to ISO Format
function convertAlchemyDate(dateString, timeZone) {
    try {
        let date = DateTime.fromFormat(dateString, "MMM dd yyyy hh:mm a", { zone: "UTC" });

        if (!date.isValid) {
            throw new Error(`Invalid date format received: ${dateString}`);
        }

        date = date.setZone(timeZone, { keepLocalTime: false });

        return date.toISO();
    } catch (error) {
        console.error("Date conversion error:", error.message);
        return null;
    }
}

// ✅ Google API Credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ✅ Alchemy API Credentials
const ALCHEMY_CLIENT_ID = process.env.ALCHEMY_CLIENT_ID;
const ALCHEMY_CLIENT_SECRET = process.env.ALCHEMY_CLIENT_SECRET;
const ALCHEMY_REFRESH_TOKEN = process.env.ALCHEMY_REFRESH_TOKEN;
const ALCHEMY_BASE_URL = "https://core-production.alchemy.cloud/core/api/v2/";
let alchemyAccessToken = process.env.ALCHEMY_ACCESS_TOKEN;

// ✅ Refresh Google Token
async function getGoogleAccessToken() {
    try {
        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: GOOGLE_REFRESH_TOKEN,
                grant_type: "refresh_token"
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Google Token Error: ${JSON.stringify(data)}`);
        }

        return data.access_token;
    } catch (error) {
        console.error("Error refreshing Google token:", error.message);
        return null;
    }
}

// ✅ Refresh Alchemy Token
async function getAlchemyAccessToken() {
    try {
        const response = await fetch(`${ALCHEMY_BASE_URL}refresh-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: ALCHEMY_REFRESH_TOKEN })
        });

        const data = await response.json();
        if (response.status !== 200) {
            throw new Error(`Alchemy Token Error: ${JSON.stringify(data)}`);
        }

        alchemyAccessToken = data.accessToken;
        return data.accessToken;
    } catch (error) {
        console.error("Error refreshing Alchemy token:", error.message);
        return null;
    }
}

// ✅ Google Calendar Event Creation
app.post("/create-event", async (req, res) => {
    console.log("Received request from Alchemy:", JSON.stringify(req.body, null, 2));

    const googleAccessToken = await getGoogleAccessToken();
    if (!googleAccessToken) {
        return res.status(500).json({ error: "Failed to obtain Google access token" });
    }

    try {
        const timeZone = req.body.timeZone || "America/New_York";

        // Convert StartUse and EndUse
        const formattedStartUse = convertAlchemyDate(req.body.StartUse, timeZone);
        let formattedEndUse = convertAlchemyDate(req.body.EndUse, timeZone);

        // Ensure EndUse is later than StartUse
        if (formattedEndUse <= formattedStartUse) {
            formattedEndUse = DateTime.fromISO(formattedStartUse).plus({ hours: 1 }).toISO();
        }

        const eventBody = {
            calendarId: req.body.calendarId,
            summary: req.body.summary || "Default Event Name",
            location: req.body.location || "No Location Provided",
            description: req.body.description || "No Description",
            start: { dateTime: formattedStartUse, timeZone },
            end: { dateTime: formattedEndUse, timeZone },
            reminders: req.body.reminders || { useDefault: true }
        };

        if (req.body.attendees && req.body.attendees.length > 0) {
            eventBody.attendees = req.body.attendees;
        }

        console.log("Final Event Payload:", JSON.stringify(eventBody, null, 2));

        const calendarApiUrl = `https://www.googleapis.com/calendar/v3/calendars/${req.body.calendarId}/events`;

        const response = await fetch(calendarApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${googleAccessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(eventBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Google Calendar Error: ${JSON.stringify(data)}`);
        }

        res.status(200).json({ success: true, event: data });
    } catch (error) {
        console.error("Error creating event:", error.message);
        res.status(500).json({ error: "Failed to create event", details: error.message });
    }
});

// ✅ Update Alchemy Record when Event is Changed in Google Calendar
app.post("/update-alchemy", async (req, res) => {
    console.log("Received update from Google Calendar:", JSON.stringify(req.body, null, 2));

    const recordId = req.body.description.match(/\d+$/)?.[0]; // Extract recordId from description
    if (!recordId) {
        return res.status(400).json({ error: "No valid Record ID found in event description" });
    }

    const alchemyAccessToken = await getAlchemyAccessToken();
    if (!alchemyAccessToken) {
        return res.status(500).json({ error: "Failed to obtain Alchemy access token" });
    }

    try {
        const updateBody = {
            recordId,
            fields: [
                {
                    identifier: "StartUse",
                    rows: [{ row: 0, values: [{ value: req.body.start.dateTime }] }]
                },
                {
                    identifier: "EndUse",
                    rows: [{ row: 0, values: [{ value: req.body.end.dateTime }] }]
                }
            ]
        };

        console.log("Final Update Payload:", JSON.stringify(updateBody, null, 2));

        const response = await fetch(`${ALCHEMY_BASE_URL}update-record`, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${alchemyAccessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(updateBody)
        });

        const data = await response.json();

        if (response.status !== 200) {
            throw new Error(`Alchemy API Error: ${JSON.stringify(data)}`);
        }

        res.status(200).json({ success: true, updatedRecord: data });
    } catch (error) {
        console.error("Error updating Alchemy:", error.message);
        res.status(500).json({ error: "Failed to update Alchemy", details: error.message });
    }
});

// ✅ Fix Port Binding for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Middleware running on port ${PORT}`);
});
