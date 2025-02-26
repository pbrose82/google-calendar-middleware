import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon"; // ✅ Import Luxon for date handling

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Health Check Route (Ensures Render stays active)
app.get("/health", (req, res) => {
    res.status(200).json({ status: "Middleware is running fine" });
});

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

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const ALCHEMY_AUTH_TOKEN = process.env.ALCHEMY_AUTH_TOKEN;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ✅ Function to refresh the Google API access token
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

// ✅ Route to Create a Google Calendar Event from Alchemy
app.post("/create-event", async (req, res) => {
    console.log("Received request from Alchemy:", JSON.stringify(req.body, null, 2));

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({ error: "Failed to obtain access token" });
    }

    try {
        const timeZone = req.body.timeZone || "America/New_York";

        // Convert StartUse and EndUse
        const formattedStartUse = convertAlchemyDate(req.body.StartUse, timeZone);
        let formattedEndUse = convertAlchemyDate(req.body.EndUse, timeZone);

        // Ensure EndUse is later than StartUse
        if (formattedEndUse <= formattedStartUse) {
            console.log("EndUse is invalid, adjusting to +1 hour...");
            formattedEndUse = DateTime.fromISO(formattedStartUse).plus({ hours: 1 }).toISO();
        }

        const eventBody = {
            calendarId: req.body.calendarId,
            summary: req.body.summary || "Default Event Name",
            location: req.body.location || "No Location Provided",
            description: req.body.description || "No Description",
            start: {
                dateTime: formattedStartUse,
                timeZone: timeZone
            },
            end: {
                dateTime: formattedEndUse,
                timeZone: timeZone
            },
            reminders: req.body.reminders || { useDefault: true }
        };

        // Only include attendees if they exist
        if (req.body.attendees && req.body.attendees.length > 0) {
            eventBody.attendees = req.body.attendees;
        }

        console.log("Final Event Payload:", JSON.stringify(eventBody, null, 2));

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
        res.status(500).json({ error: "Failed to create event", details: error.message });
    }
});

// ✅ Route to Handle Google Calendar Updates & Push to Alchemy
app.post("/update-alchemy", async (req, res) => {
    console.log("Received Google Calendar Update:", JSON.stringify(req.body, null, 2));

    if (!req.body || !req.body.id || !req.body.start || !req.body.end) {
        return res.status(400).json({ error: "Invalid request data" });
    }

    // Extract Record ID from the event description
    const recordIdMatch = req.body.description.match(/\b\d+\b/);
    if (!recordIdMatch) {
        console.error("No Record ID found in event description:", req.body.description);
        return res.status(400).json({ error: "Record ID not found in event description" });
    }

    const recordId = recordIdMatch[0];

    // Convert Google Calendar timestamps to Alchemy format
    const formattedStart = DateTime.fromISO(req.body.start.dateTime, { zone: req.body.start.timeZone })
        .toFormat("MMM dd yyyy hh:mm a");
    const formattedEnd = DateTime.fromISO(req.body.end.dateTime, { zone: req.body.end.timeZone })
        .toFormat("MMM dd yyyy hh:mm a");

    const alchemyApiUrl = "https://core-production.alchemy.cloud/core/api/v2/update-record";

    const alchemyPayload = {
        recordId: recordId,
        fields: [
            {
                identifier: "StartUse",
                rows: [{ row: 0, values: [{ value: formattedStart }] }]
            },
            {
                identifier: "EndUse",
                rows: [{ row: 0, values: [{ value: formattedEnd }] }]
            }
        ]
    };

    try {
        const alchemyResponse = await fetch(alchemyApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${ALCHEMY_AUTH_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(alchemyPayload)
        });

        const data = await alchemyResponse.json();

        if (!alchemyResponse.ok) {
            throw new Error(`Alchemy API Error: ${JSON.stringify(data)}`);
        }

        console.log("Successfully updated Alchemy Record:", data);
        res.status(200).json({ success: true, message: "Alchemy record updated", data });
    } catch (error) {
        console.error("Error updating Alchemy record:", error.message);
        res.status(500).json({ error: "Failed to update Alchemy", details: error.message });
    }
});

// ✅ Fix Port Binding for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Middleware running on port ${PORT}`);
});
