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

// ✅ Function to Convert Google Calendar Date Format to Alchemy Expected Format
function convertToAlchemyFormat(dateString) {
    try {
        let date = DateTime.fromISO(dateString, { zone: "UTC" });
        if (!date.isValid) {
            throw new Error(`Invalid date format received: ${dateString}`);
        }

        return date.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"); // ✅ Correct Alchemy format
    } catch (error) {
        console.error("Date conversion error:", error.message);
        return null;
    }
}

const ALCHEMY_REFRESH_TOKEN = process.env.ALCHEMY_REFRESH_TOKEN;
const ALCHEMY_REFRESH_URL = "https://core-production.alchemy.cloud/core/api/v2/refresh-token";
const ALCHEMY_UPDATE_URL = "https://core-production.alchemy.cloud/core/api/v2/update-record";
const TENANT_NAME = "productcaseelnlims4uat"; // ✅ Ensure correct tenant

// ✅ Function to Refresh Alchemy Token
async function refreshAlchemyToken() {
    try {
        const response = await fetch(ALCHEMY_REFRESH_URL, {
            method: "PUT", // ✅ Correct method for refreshing token
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: ALCHEMY_REFRESH_TOKEN })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Alchemy Token Refresh Failed: ${JSON.stringify(data)}`);
        }

        // ✅ Extract correct tenant token
        const tenantToken = data.tokens.find(token => token.tenant === TENANT_NAME);

        if (!tenantToken) {
            throw new Error(`Tenant '${TENANT_NAME}' not found in response.`);
        }

        console.log("✅ Alchemy Token Refreshed Successfully");
        return tenantToken.accessToken;
    } catch (error) {
        console.error("🔴 Error refreshing Alchemy token:", error.message);
        return null;
    }
}

// ✅ Route to Handle Google Calendar Updates & Push to Alchemy
app.put("/update-alchemy", async (req, res) => {
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
    const formattedStart = convertToAlchemyFormat(req.body.start.dateTime);
    const formattedEnd = convertToAlchemyFormat(req.body.end.dateTime);

    if (!formattedStart || !formattedEnd) {
        return res.status(400).json({ error: "Invalid date format received" });
    }

    // Refresh Alchemy Token
    const alchemyToken = await refreshAlchemyToken();
    if (!alchemyToken) {
        return res.status(500).json({ error: "Failed to refresh Alchemy token" });
    }

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
        const alchemyResponse = await fetch(ALCHEMY_UPDATE_URL, {
            method: "PUT", // ✅ Correct method for updating records
            headers: {
                "Authorization": `Bearer ${alchemyToken}`,
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
        console.error("🔴 Error updating Alchemy record:", error.message);
        res.status(500).json({ error: "Failed to update Alchemy", details: error.message });
    }
});

// ✅ Fix Port Binding for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Middleware running on port ${PORT}`);
});
