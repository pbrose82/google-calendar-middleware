import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon"; // ✅ Import Luxon for date handling

dotenv.config();

const app = express();
app.use(express.json());

const ALCHEMY_REFRESH_TOKEN = process.env.ALCHEMY_REFRESH_TOKEN;
const ALCHEMY_BASE_URL = "https://core-production.alchemy.cloud/core/api/v2";
const TENANT_NAME = "productcaseelnlims4uat"; // ✅ Correct tenant

let currentAlchemyToken = null; // ✅ Store valid token

// ✅ Function to Refresh Alchemy Token & Extract Correct Tenant Token
async function refreshAlchemyToken() {
    try {
        console.log("🔄 Refreshing Alchemy token...");

        const response = await fetch(`${ALCHEMY_BASE_URL}/refresh-token`, {
            method: "PUT", // ✅ Corrected from POST to PUT
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: ALCHEMY_REFRESH_TOKEN }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Alchemy Token Refresh Failed: ${JSON.stringify(data)}`);
        }

        console.log("✅ Alchemy Token Refreshed. Extracting correct tenant token...");

        // ✅ Find the correct tenant's access token
        const tenantToken = data.tokens.find(token => token.tenant === TENANT_NAME);

        if (!tenantToken) {
            throw new Error(`Tenant '${TENANT_NAME}' not found in token response!`);
        }

        currentAlchemyToken = tenantToken.accessToken; // ✅ Store correct token
        console.log(`✅ Using Token for Tenant: ${TENANT_NAME}`);
    } catch (error) {
        console.error("❌ Error refreshing Alchemy token:", error.message);
    }
}

// ✅ Middleware to Ensure We Always Have a Valid Token Before API Calls
async function ensureAlchemyToken() {
    if (!currentAlchemyToken) {
        console.log("⚠️ No valid Alchemy token found, refreshing...");
        await refreshAlchemyToken();
    }
}

// ✅ Route to Handle Google Calendar Updates & Push to Alchemy
app.put("/update-alchemy", async (req, res) => {
    console.log("📥 Received Google Calendar Update:", JSON.stringify(req.body, null, 2));

    if (!req.body || !req.body.id || !req.body.start || !req.body.end) {
        return res.status(400).json({ error: "Invalid request data" });
    }

    // ✅ Ensure a valid Alchemy token is available before making API calls
    await ensureAlchemyToken();

    if (!currentAlchemyToken) {
        return res.status(500).json({ error: "Failed to obtain a valid Alchemy token" });
    }

    // ✅ Extract Record ID from the event description
    const recordIdMatch = req.body.description.match(/\b\d+\b/);
    if (!recordIdMatch) {
        console.error("⚠️ No Record ID found in event description:", req.body.description);
        return res.status(400).json({ error: "Record ID not found in event description" });
    }

    const recordId = recordIdMatch[0];

    // ✅ Convert Google Calendar timestamps to Alchemy format
    const formattedStart = DateTime.fromISO(req.body.start.dateTime, { zone: req.body.start.timeZone })
        .toFormat("MMM dd yyyy hh:mm a");
    const formattedEnd = DateTime.fromISO(req.body.end.dateTime, { zone: req.body.end.timeZone })
        .toFormat("MMM dd yyyy hh:mm a");

    const alchemyApiUrl = `${ALCHEMY_BASE_URL}/update-record`;

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
        console.log("🔄 Sending update to Alchemy:", JSON.stringify(alchemyPayload, null, 2));

        const alchemyResponse = await fetch(alchemyApiUrl, {
            method: "PUT", // ✅ Changed to PUT
            headers: {
                "Authorization": `Bearer ${currentAlchemyToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(alchemyPayload)
        });

        const data = await alchemyResponse.json();

        if (!alchemyResponse.ok) {
            throw new Error(`Alchemy API Error: ${JSON.stringify(data)}`);
        }

        console.log("✅ Successfully updated Alchemy Record:", data);
        res.status(200).json({ success: true, message: "Alchemy record updated", data });
    } catch (error) {
        console.error("❌ Error updating Alchemy record:", error.message);
        res.status(500).json({ error: "Failed to update Alchemy", details: error.message });
    }
});

// ✅ Fix Port Binding for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Middleware running on port ${PORT}`);
});
