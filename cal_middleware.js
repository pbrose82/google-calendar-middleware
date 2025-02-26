import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon";

dotenv.config();

const app = express();
app.use(express.json());

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ALCHEMY_API_URL = process.env.ALCHEMY_API_URL;
const ALCHEMY_AUTH_TOKEN = process.env.ALCHEMY_AUTH_TOKEN;

// ✅ Health Check Route
app.get("/health", (req, res) => {
    res.status(200).json({ status: "Middleware is running fine" });
});

// ✅ Function to refresh Google access token
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
            throw new Error(`Google OAuth Error: ${JSON.stringify(data)}`);
        }

        return data.access_token;
    } catch (error) {
        console.error("Error refreshing Google token:", error.message);
        return null;
    }
}

// ✅ Function to refresh Alchemy access token
async function refreshAlchemyToken() {
    try {
        const response = await fetch(`${ALCHEMY_API_URL}/refresh-token`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${ALCHEMY_AUTH_TOKEN}` }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Alchemy Token Refresh Error: ${JSON.stringify(data)}`);
        }

        return data.token;
    } catch (error) {
        console.error("Error refreshing Alchemy token:", error.message);
        return null;
    }
}

// ✅ Function to Convert Alchemy's Date Format ("MMM dd yyyy hh:mm a") to ISO Format
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

// ✅ Google Calendar Event Creation Route
app.post("/create-event", async (req, res) => {
    console.log("Received request from Alchemy:", JSON.stringify(req.body, null, 2));

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({ error: "Failed to obtain Google access token" });
    }

    try {
        const timeZone = req.body.timeZone || "America/New_York";
        const formattedStartUse = convertAlchemyDate(req.body.StartUse, timeZone);
        let formattedEndUse = convertAlchemyDate(req.body.EndUse, timeZone);

        if (formattedEndUse <= formattedStartUse) {
            formattedEndUse = DateTime.fromISO(formattedStartUse).plus({ hours: 1 }).toISO();
        }

        const eventBody = {
            calendarId: req.body.calendarId,
            summary: req.body.summary || "Equipment Reservation",
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
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(eventBody)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Google Calendar API Error: ${JSON.stringify(data)}`);
        }

        res.status(200).json({ success: true, event: data });
    } catch (error) {
        console.error("Error creating event:", error.message);
        res.status(500).json({ error: "Failed to create event", details: error.message });
    }
});

// ✅ Route to update Alchemy when a calendar event changes
app.post("/update-alchemy", async (req, res) => {
    console.log("Received calendar update:", JSON.stringify(req.body, null, 2));

    const description = req.body.description || "";
    const recordIdMatch = description.match(/\b\d+\b/); // Extract first number (Record ID)

    if (!recordIdMatch) {
        return res.status(400).json({ error: "No Record ID found in event description" });
    }

    const recordId = recordIdMatch[0];

    const alchemyToken = await refreshAlchemyToken();
    if (!alchemyToken) {
        return res.status(500).json({ error: "Failed to obtain Alchemy access token" });
    }

    const alchemyUpdateBody = {
        recordId: recordId,
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

    try {
        const response = await fetch(`${ALCHEMY_API_URL}/update-record`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${alchemyToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(alchemyUpdateBody)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Alchemy API Error: ${JSON.stringify(data)}`);
        }

        res.status(200).json({ success: true, alchemyResponse: data });
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
