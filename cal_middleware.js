import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon"; // ✅ Import Luxon for time handling

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Function to Convert Alchemy's Date Format ("MMM dd yyyy hh:mm a") to ISO Format
function convertAlchemyDate(dateString, timeZone) {
    try {
        // ✅ Parse "Feb 25 2025 09:00 PM" in the given time zone
        let date = DateTime.fromFormat(dateString, "MMM dd yyyy hh:mm a", { zone: timeZone });

        if (!date.isValid) {
            throw new Error(`Invalid date format received: ${dateString}`);
        }

        // ✅ Keep the local time but correctly apply the timezone
        date = date.setZone(timeZone, { keepLocalTime: true });

        return date.toISO(); // ✅ Converts to correct ISO format
    } catch (error) {
        console.error("🔴 Date conversion error:", error.message);
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
        console.error("🔴 Error refreshing token:", error.message);
        return null;
    }
}

// ✅ Google Calendar Event Creation Endpoint
app.post("/create-event", async (req, res) => {
    console.log("🔵 Received request from Alchemy:", JSON.stringify(req.body, null, 2));

    const accessToken = await getAccessToken();
    if (!accessToken) {
        return res.status(500).json({ error: "Failed to obtain access token" });
    }

    try {
        // ✅ Use correct timezone (default to America/New_York)
        const timeZone = req.body.timeZone || "America/New_York";

        // ✅ Convert StartUse and EndUse from Alchemy's format
        const formattedStartUse = convertAlchemyDate(req.body.StartUse, timeZone);
        const formattedEndUse = convertAlchemyDate(req.body.EndUse, timeZone);

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
                dateTime: formattedStartUse, // ✅ Now correctly formatted
                timeZone: timeZone
            },
            end: {
                dateTime: formattedEndUse, // ✅ Now correctly formatted
                timeZone: timeZone
            },
            attendees: req.body.attendees || [],
            reminders: req.body.reminders || { useDefault: true }
        };

        console.log("🟢 Final Event Payload:", 
