import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon"; // Use Luxon for date handling

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Health Check Route
app.get("/health", (req, res) => {
    res.status(200).json({ status: "Middleware is running fine" });
});

// ✅ Google API Authentication
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ✅ Alchemy API Authentication
const ALCHEMY_BASE_URL = "https://core-production.alchemy.cloud/core/api/v2";
const ALCHEMY_USERNAME = process.env.ALCHEMY_USERNAME;
const ALCHEMY_PASSWORD = process.env.ALCHEMY_PASSWORD;
let ALCHEMY_ACCESS_TOKEN = process.env.ALCHEMY_ACCESS_TOKEN;

// ✅ Function to refresh Google Access Token
async function getGoogleAccessToken() {
    try {
        const response = await fetch(GOOGLE_TOKEN_URL, {
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
            throw new Error(`Error refreshing Google token: ${JSON.stringify(data)}`);
        }

        return data.access_token;
    } catch (error) {
        console.error("🔴 Error refreshing Google token:", error.message);
        return null;
    }
}

// ✅ Function to refresh Alchemy Access Token
async function refreshAlchemyToken() {
    try {
        const response = await fetch(`${ALCHEMY_BASE_URL}/sign-in`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                principalEmail: ALCHEMY_USERNAME,
                password: ALCHEMY_PASSWORD
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Error refreshing Alchemy token: ${JSON.stringify(data)}`);
        }

        ALCHEMY_ACCESS_TOKEN = data.accessToken;
        console.log("✅ Alchemy token refreshed!");
        return ALCHEMY_ACCESS_TOKEN;
    } catch (error) {
        console.error("🔴 Error refreshing Alchemy token:", error.message);
        return null;
    }
}

// ✅ Function to Convert Google Calendar Dates to Alchemy Format
function convertToAlchemyFormat(isoDate) {
    return DateTime.fromISO(isoDate).toFormat("MMM dd yyyy hh:mm a");
}

// ✅ Extract Record ID from Google Calendar Event Description
function extractRecordId(description) {
    const match = description.match(/(\d+)$/); // Finds the last number in the description
    return match ? parseInt(match[1], 10) : null;
}

// ✅ Google Webhook to Handle Calendar Event Updates
app.post("/update-alchemy", async (req, res) => {
    console.log("🔵 Received event update from Google:", JSON.stringify(req.body, null, 2));

    const { summary, description, start, end } = req.body;
    const recordId = extractRecordId(description);

    if (!recordId) {
        console.error("🔴 No record ID found in event description!");
        return res.status(400).json({ error: "Record ID missing from event description" });
    }

    const alchemyPayload = {
        recordId: recordId,
        fields: [
            {
                identifier: "StartUse",
                rows: [{ row: 0, values: [{ value: convertToAlchemyFormat(start.dateTime) }] }]
            },
            {
                identifier: "EndUse",
                rows: [{ row: 0, values: [{ value: convertToAlchemyFormat(end.dateTime) }] }]
            }
        ]
    };

    console.log("🟢 Sending update to Alchemy:", JSON.stringify(alchemyPayload, null, 2));

    try {
        // ✅ Ensure Alchemy token is fresh
        if (!ALCHEMY_ACCESS_TOKEN) {
            await refreshAlchemyToken();
        }

        const response = await fetch(`${ALCHEMY_BASE_URL}/update-record`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${ALCHEMY_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(alchemyPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Alchemy API Error: ${JSON.stringify(data)}`);
        }

        console.log("✅ Successfully updated Alchemy record");
        res.status(200).json({ success: true, alchemyResponse: data });
    } catch (error) {
        console.error("🔴 Failed to update Alchemy:", error.message);
        res.status(500).json({ error: "Failed to update Alchemy", details: error.message });
    }
});

// ✅ Fix Port Binding for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Middleware running on port ${PORT}`);
});
