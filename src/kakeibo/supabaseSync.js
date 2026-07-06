import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabaseConfig.js";
import { ledgerToRows, rowsToLedger } from "./transactionDb.js";

/** @type {ReturnType<import("@supabase/supabase-js").createClient> | null} */
let client = null;

function getCreateClient() {
  const lib = typeof globalThis !== "undefined" ? globalThis.supabase : null;
  if (lib?.createClient) return lib.createClient;
  throw new Error("Supabase JS library not loaded. Check the CDN script in kakeibo.html.");
}

export function isSyncEnabled() {
  return isSupabaseConfigured();
}

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY).");
  }
  if (!client) {
    client = getCreateClient()(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

/**
 * @param {(event: string, session: object | null) => void} callback
 */
export function onAuthStateChange(callback) {
  return getSupabase().auth.onAuthStateChange((event, session) => callback(event, session));
}

/** @returns {Promise<object | null>} */
export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

/** Send a Magic Link / OTP email (Supabase Email provider must be enabled). */
export async function signInWithEmail(email) {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

/** Resolve the household the signed-in user belongs to (single-household model for now). */
export async function getHouseholdId() {
  const supabase = getSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.household_id ?? null;
}

/**
 * @param {string} householdId
 * @returns {Promise<{ transactions: object[], marks: Record<string, string> }>}
 */
export async function fetchLedger(householdId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .order("date", { ascending: true });

  if (error) throw error;
  return rowsToLedger(data || []);
}

/**
 * Upsert the full ledger (CSV import or bulk sync).
 * @param {string} householdId
 * @param {object[]} transactions
 * @param {Record<string, string>} marks
 */
export async function upsertLedger(householdId, transactions, marks) {
  if (transactions.length === 0) return;

  const rows = ledgerToRows(transactions, marks, householdId);
  const supabase = getSupabase();

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("transactions").upsert(chunk, {
      onConflict: "household_id,id",
    });
    if (error) throw error;
  }
}

/** @param {string} householdId @param {string} txId @param {string|null} mark */
export async function updateMark(householdId, txId, mark) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("transactions")
    .update({ mark: mark || null })
    .eq("household_id", householdId)
    .eq("id", txId);
  if (error) throw error;
}

/** @param {string} householdId @param {string} txId @param {string} memo */
export async function updateMemo(householdId, txId, memo) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("transactions")
    .update({ memo })
    .eq("household_id", householdId)
    .eq("id", txId);
  if (error) throw error;
}

/** Clear all marks in the household (keeps transaction rows). */
export async function clearAllMarks(householdId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("transactions")
    .update({ mark: null })
    .eq("household_id", householdId);
  if (error) throw error;
}
