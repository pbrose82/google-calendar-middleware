import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { DateTime } from "luxon"; // For date formatting

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Health Check Route
app.get("/health", (req, res) => {
    res.status(200).json({ status: "Middleware is running fine" });
});

// ✅ Function to format date to Alchemy's required format
function formatToAlchemyDate(dateString) {
    try {
        let date = DateTime.fromISO(dateString, { zone: "UTC" });

        if (!date.isValid) {
            throw new Error(`Invalid date format received: ${dateString}`);
        }

        return date.toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'"); // Correct format for Alchemy
    } catch (error) {
        console.error("Date conversion error:", error.message);
        return null;
    }
}

// ✅ Function to refresh the Alchemy API token
async function refreshAlchemyToken() {
    const refreshToken = process.env.ALCHEMY_REFRESH_TOKEN;
    const tenant = process.env.ALCHEMY_TENANT; // Make sure this is set correctly

    if (!refreshToken) {
        console.error("❌ No Alchemy refresh token available.");
        return null;
    }

    console.log("🔄 Refreshing Alchemy token...");
    
    try {
        const response = await fetch("https://core-production.alchemy.cloud/core/api/v2/auth/refresh", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("❌ Alchemy Token Refresh Failed:", data);
            return null;
        }

        const tokens = data.tokens;
        let newAccessToken = null;

        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].tenant === tenant) {
                newAccessToken = tokens[i].accessToken;
                break;
            }
        }

        if (!newAccessToken) {
            console.error("❌ Alchemy Token for specified tenant not found.");
            return null;
        }

        console.log("✅ Alchemy Token Refreshed Successfully");
        return newAccessToken;
    } catch (error) {
        console.error("❌ Error refreshing Alchemy token:", error.message);
        return null;
    }
}

// ✅ Route to Update Alchemy Record
app.put("/update-alchemy", async (req, res) => {
    console.log("📩 Received Google Calendar Update:", JSON.stringify(req.body, null, 2));

    if (!req.body || !req.body.id || !req.body.start || !req.body.end) {
        return res.status(400).json({ error: "Invalid request data" });
    }

    // Extract Record ID from the event description
    const recordIdMatch = req.body.description.match(/\b\d+\b/);
    if (!recordIdMatch) {
        console.error("❌ No Record ID found in event description:", req.body.description);
        return res.status(400).json({ error: "Record ID not found in event description" });
    }

    const recordId = recordIdMatch[0];

    // Convert Google Calendar timestamps to Alchemy format
    const formattedStart = formatToAlchemyDate(req.body.start.dateTime);
    const formattedEnd = formatToAlchemyDate(req.body.end.dateTime);

    if (!formattedStart || !formattedEnd) {
        return res.status(400).json({ error: "Date conversion failed" });
    }

    // Refresh Alchemy Token
    const newAlchemyToken = await refreshAlchemyToken();
    if (!newAlchemyToken) {
        return res.status(500).json({ error: "Failed to refresh Alchemy token" });
    }

    // Determine API URL based on tenant type
    const alchemyApiUrl = process.env.ALCHEMY_TENANT.includes("uat")
        ? "https://core-uat.alchemy.cloud/core/api/v2/update-record"
        : "https://core-production.alchemy.cloud/core/api/v2/update-record";

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

    console.log("📤 Sending Alchemy Update Request:", JSON.stringify(alchemyPayload, null, 2));

    try {
        const alchemyResponse = await fetch(alchemyApiUrl, {
            method: "PUT", // ✅ Correct method
            headers: {
                "Authorization": `Bearer ${newAlchemyToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(alchemyPayload)
        });

        // Log raw response before parsing
        const responseText = await alchemyResponse.text();
        console.log("🔍 Alchemy API Response Status:", alchemyResponse.status);
        console.log("🔍 Alchemy API Raw Response:", responseText);

        if (!alchemyResponse.ok) {
            throw new Error(`Alchemy API Error: ${responseText}`);
        }

        res.status(200).json({ success: true, message: "Alchemy record updated", data: responseText });
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
