/**
 * Read/write helpers for this tool's own "combined ledger" CSV format,
 * i.e. the file produced by `buildLedgerCsv` / the "全データCSVをダウンロード"
 * button / `tools/kakeibo/cli.js combine`.
 *
 * Unlike a raw MoneyForward ME export, this format also carries the
 * person mark (負担者 column), so re-importing this single file restores
 * both the transaction ledger and the marks in one step.
 */
import { parseCsvRows } from "./csv.js";
import { PERSON_LABELS_JA, PERSON_LABEL_TO_KEY } from "./aggregate.js";

export const LEDGER_HEADER = [
  "ID",
  "日付",
  "内容",
  "金額（円）",
  "保有金融機関",
  "大項目",
  "中項目",
  "メモ",
  "振替",
  "計算対象",
  "元ファイル",
  "負担者",
];

/** Heuristic check: does this header row look like our own ledger export? */
export function isLedgerCsvHeader(headerRow) {
  return (
    Array.isArray(headerRow) &&
    headerRow.length === LEDGER_HEADER.length &&
    LEDGER_HEADER.every((col, i) => headerRow[i] === col)
  );
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * @param {object[]} transactions
 * @param {Record<string, string>} marks - transaction id -> person key
 * @returns {string} CSV text (UTF-8 with BOM, CRLF line endings, ready to download/save)
 */
export function buildLedgerCsv(transactions, marks = {}) {
  const lines = [LEDGER_HEADER.map(csvEscape).join(",")];
  for (const tx of transactions) {
    const mark = marks[tx.id];
    const markLabel = mark ? PERSON_LABELS_JA[mark] || "" : "";
    lines.push(
      [
        tx.id,
        tx.date,
        tx.content,
        tx.amount,
        tx.institution,
        tx.majorCategory,
        tx.minorCategory,
        tx.memo,
        tx.isTransfer ? "1" : "0",
        tx.isCalcTarget ? "1" : "0",
        tx.sourceLabel,
        markLabel,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/**
 * Parse a previously exported ledger CSV back into transactions + marks.
 * Columns are looked up by name (not fixed position) for robustness.
 *
 * @param {string} csvText
 * @param {string} [sourceLabelFallback]
 * @returns {{ transactions: object[], marks: Record<string, string> }}
 */
export function parseLedgerCsv(csvText, sourceLabelFallback = "") {
  const rows = parseCsvRows(csvText.replace(/^\uFEFF/, ""));
  if (rows.length === 0) {
    return { transactions: [], marks: {} };
  }

  const [header, ...body] = rows;
  const idx = (name) => header.indexOf(name);

  const transactions = [];
  const marks = {};

  for (const row of body) {
    const id = row[idx("ID")];
    const date = row[idx("日付")];
    if (!id || !date) continue;

    transactions.push({
      id,
      date,
      month: date.slice(0, 7),
      content: row[idx("内容")],
      amount: Number(row[idx("金額（円）")]),
      institution: row[idx("保有金融機関")],
      majorCategory: row[idx("大項目")],
      minorCategory: row[idx("中項目")],
      memo: row[idx("メモ")],
      isTransfer: row[idx("振替")] === "1",
      isCalcTarget: row[idx("計算対象")] === "1",
      sourceLabel: row[idx("元ファイル")] || sourceLabelFallback,
    });

    const personKey = PERSON_LABEL_TO_KEY[(row[idx("負担者")] || "").trim()];
    if (personKey) marks[id] = personKey;
  }

  return { transactions, marks };
}
