/**
 * Listo API — /api/feedback
 * Logs user feedback to Airtable "Listo Feedback" table.
 * Fields: Name, Address, Project Type, Feedback, Rating (1-5), Timestamp
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  const API_KEY = process.env.AIRTABLE_API_KEY;

  if (!BASE_ID || !API_KEY) {
    // Fail silently — feedback is non-critical
    console.warn("Airtable env vars not set — feedback not logged");
    return res.status(200).json({ ok: true, note: "feedback not configured" });
  }

  const { address, projectType, feedback, rating } = req.body;

  try {
    const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Listo%20Feedback`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [{
          fields: {
            "Address": address || "",
            "Project Type": projectType || "",
            "Feedback": feedback || "",
            "Rating": rating || null,
            "Timestamp": new Date().toISOString(),
          }
        }]
      }),
    });

    if (!r.ok) {
      const e = await r.text();
      console.error("Airtable error:", e);
      return res.status(200).json({ ok: false, error: "Airtable write failed" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Feedback error:", err);
    return res.status(200).json({ ok: false }); // always return 200 — feedback is non-critical
  }
}
