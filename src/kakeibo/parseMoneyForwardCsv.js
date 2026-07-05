import { parseCsvRows } from "./csv.js";

/**
 * Expected MoneyForward ME "収入・支出詳細" export header (Japanese column
 * names). Order in the file is not assumed; columns are looked up by name
 * so a re-ordered export still parses correctly.
 */
const COLUMN_ALIASES = {
  calcTarget: ["計算対象"],
  date: ["日付"],
  content: ["内容"],
  amount: ["金額（円）", "金額(円)"],
  institution: ["保有金融機関"],
  majorCategory: ["大項目"],
  minorCategory: ["中項目"],
  memo: ["メモ"],
  transfer: ["振替"],
  id: ["ID"],
};

function buildColumnIndex(headerRow) {
  const index = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const found = headerRow.findIndex((h) => aliases.includes(h.trim()));
    if (found === -1) {
      throw new Error(
        `MoneyForward CSV header is missing an expected column for "${key}" (looked for: ${aliases.join(", ")})`
      );
    }
    index[key] = found;
  }
  return index;
}

/** Convert "2026/01/31" -> { date: "2026-01-31", month: "2026-01" }. */
function normalizeDate(raw) {
  const match = raw.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) {
    throw new Error(`Unrecognized date format: "${raw}"`);
  }
  const [, y, m, d] = match;
  const mm = m.padStart(2, "0");
  const dd = d.padStart(2, "0");
  return { date: `${y}-${mm}-${dd}`, month: `${y}-${mm}` };
}

/**
 * Parse decoded MoneyForward ME CSV text ("収入・支出詳細_*.csv") into a
 * flat list of transaction records.
 *
 * @param {string} csvText - CSV text already decoded from Shift_JIS/CP932.
 * @param {string} [sourceLabel] - free-form label (e.g. the file name) kept
 *   on each record for traceability; never parsed or relied upon for logic.
 * @returns {Array<object>} transactions
 */
export function parseMoneyForwardCsv(csvText, sourceLabel = "") {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return [];
  }

  const [header, ...body] = rows;
  const col = buildColumnIndex(header);

  return body
    .filter((row) => row.length >= header.length && row[col.id] !== "")
    .map((row) => {
      const { date, month } = normalizeDate(row[col.date]);
      const amount = Number(row[col.amount].replace(/,/g, ""));

      return {
        id: row[col.id],
        date,
        month,
        content: row[col.content],
        amount,
        institution: row[col.institution],
        majorCategory: row[col.majorCategory],
        minorCategory: row[col.minorCategory],
        memo: row[col.memo],
        isTransfer: row[col.transfer] === "1",
        isCalcTarget: row[col.calcTarget] === "1",
        sourceLabel,
      };
    });
}
