import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accounts } from "@/lib/banking-data";

// UI transaction shape — matches what the dashboard already expects.
export interface UiTransaction {
  id: string;
  isoDate: string;
  date: string;
  narration: string;
  channel: string;
  type: "Credit" | "Debit";
  debit: number;
  credit: number;
  balance: number;
  reference: string | null;
  bank: string | null;
  accountLast4: string | null;
  rawSms: string | null;
  smsSender: string | null;
}

interface DbRow {
  id: string;
  amount: number | string;
  transaction_type: "credit" | "debit";
  sender_name: string | null;
  transaction_reference: string | null;
  bank_name: string | null;
  account_number_last4: string | null;
  message: string | null;
  transaction_date: string;
}

const STARTING_BALANCE = accounts[0]?.balance ?? 0;
const POLL_MS = 10000;

function formatDate(iso: string): { isoDate: string; date: string } {
  const d = new Date(iso);
  const isoDate = isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toISOString().slice(0, 10);
  const date = isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return { isoDate, date };
}

function buildNarration(row: DbRow): string {
  const channel = (row.bank_name || "").toUpperCase();
  const action = row.transaction_type === "credit" ? "CREDIT" : "DEBIT";
  const who = row.sender_name ? `/${row.sender_name.toUpperCase()}` : "";
  const ref = row.transaction_reference ? ` REF ${row.transaction_reference}` : "";
  const prefix = channel ? `${channel}/` : "";
  return `${prefix}${action}${who}${ref}`.trim();
}

function mapRows(rows: DbRow[]): UiTransaction[] {
  let running = STARTING_BALANCE;
  return rows.map((r) => {
    const amount = Number(r.amount) || 0;
    const type: "Credit" | "Debit" = r.transaction_type === "credit" ? "Credit" : "Debit";
    const credit = type === "Credit" ? amount : 0;
    const debit = type === "Debit" ? amount : 0;
    const { isoDate, date } = formatDate(r.transaction_date);
    const txn: UiTransaction = {
      id: r.id,
      isoDate,
      date,
      narration: buildNarration(r) || (r.message ?? "Transaction"),
      channel: (r.bank_name || "SMS").toString(),
      type,
      debit,
      credit,
      balance: running,
      reference: r.transaction_reference,
      bank: r.bank_name,
      accountLast4: r.account_number_last4,
      rawSms: null,
      smsSender: null,
    };
    running = running - credit + debit;
    return txn;
  });
}

async function fetchTransactions(): Promise<DbRow[]> {
  const { data, error } = await supabase.functions.invoke("get-transactions", {
    method: "GET",
  });
  if (error) {
    console.error("[useTransactions] edge function error", error);
    throw error;
  }
  const rows = Array.isArray((data as any)?.transactions)
    ? ((data as any).transactions as DbRow[])
    : [];
  console.log(`[useTransactions] fetched ${rows.length} rows`);
  return rows;
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<UiTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const rows = await fetchTransactions();
        if (!active) return;
        setTransactions(mapRows(rows));
      } catch (err) {
        console.error("[useTransactions] load error", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    // Realtime: refetch whenever the transactions table changes.
    // (RLS blocks anon reads, but Realtime broadcast events still fire; we
    // only use the event as a trigger to re-invoke the edge function.)
    const channel = supabase
      .channel("transactions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        (payload) => {
          console.log("[useTransactions] realtime event", payload.eventType);
          load();
        },
      )
      .subscribe((status) => {
        console.log("[useTransactions] realtime status", status);
      });

    // Fallback polling in case realtime is unavailable.
    const interval = window.setInterval(load, POLL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return { transactions, loading };
}
