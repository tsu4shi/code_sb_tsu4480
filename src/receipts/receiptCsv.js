/**
 * CSV export for receipt line items (UTF-8 BOM, CRLF).
 * Column set is intentionally broad for later kakeibo reconciliation.
 */

export const RECEIPT_CSV_HEADER = [
  "レシートID",
  "日付",
  "店名",
  "品目",
  "数量",
  "単価",
  "金額",
  "支払方法",
  "税区分",
  "メモ",
  "元ファイル名",
];

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * @param {object[]} rows - line-item objects from parseReceiptText / UI edits
 * @returns {string}
 */
export function buildReceiptCsv(rows) {
  const lines = [RECEIPT_CSV_HEADER.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.receiptId,
        row.date,
        row.storeName,
        row.itemName,
        row.quantity,
        row.unitPrice,
        row.amount == null || row.amount === "" ? "" : row.amount,
        row.paymentMethod,
        row.taxNote,
        row.memo,
        row.sourceFile,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
