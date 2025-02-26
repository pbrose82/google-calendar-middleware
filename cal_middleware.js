import express from "express";
import fetch from "node-fetch";
import { DateTime } from "luxon";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const ALCHEMY_UPDATE_URL = "https://core-production.alchemy.cloud/core/api/v2/update-record";

// ✅ Function to Convert Google Calendar Date Format to Alchemy's Expected Format
function formatDateForAlchemy(isoDateTime) {
    return DateTime.fromISO(isoDateTime, { zone: "America/New_York" }).toFormat("MMM dd yyyy hh:mm a");
}

// ✅ Function to Update Alchemy Record
async function updateAlchemyRecord(recordId, startDateTime, endDateTime) {
    const formattedStartUse = formatDateForAlchemy(startDateTime);
    const formattedEndUse = formatDateForAlchemy(endDateTime);

    const payload = {
        recordId: recordId,
        fields: [
            {
                identifier: "StartUse",
                rows: [
                    {
                        row: 0,
                        values: [{ "value": formattedStartUse }]
                    }
                ]
            },
            {
                identifier: "EndUse",
                rows: [
                    {
                        row: 0,
                        values: [{ "value": formattedEndUse }]
                    }
                ]
            }
        ]
    };

    console.log("🔄 Sending formatted payload to Alchemy:", JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(ALCHEMY_UPDATE_URL, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.ALCHEMY_ACCESS_TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("✅ Alchemy update response:", data);
        return data;
    } catch (error) {
        console.error("❌ Error updating Alchemy:", error);
        return null;
    }
}

// ✅ API Endpoint to Listen for Google Calendar Updates
app.post("/update-alchemy", async (req, res) => {
    try {
        const { recordId, start, end } = req.body;

        if (!recordId || !start || !end) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        console.log("🔄 Received update request:", req.body);

        // Call function to update Alchemy
        const updateResponse = await updateAlchemyRecord(recordId, start.dateTime, end.dateTime);

        res.status(200).json({ success: true, updateResponse });
    } catch (error) {
        console.error("❌ Error processing request:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Start Middleware Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Middleware running on port ${PORT}`);
});
