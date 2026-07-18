// Vercel Serverless Function — GET /api/transactions
// Returns transaction rows via the Supabase service role, so the database
// itself is no longer publicly readable through the anon Data API.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v as string);
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v as string);
    return res.end();
  }
  if (req.method !== "GET") {
    return json(res, 405, { success: false, error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, {
      success: false,
      error: "Server not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Project only the fields the UI needs — do NOT return raw_sms or sms_sender.
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, amount, transaction_type, sender_name, transaction_reference, bank_name, account_number_last4, message, transaction_date",
    )
    .order("transaction_date", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[/api/transactions] error", error);
    return json(res, 500, { success: false, error: error.message });
  }

  return json(res, 200, { success: true, transactions: data ?? [] });
}
