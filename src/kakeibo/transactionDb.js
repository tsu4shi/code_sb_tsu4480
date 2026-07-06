/**
 * Maps between in-memory kakeibo transaction objects and Supabase rows.
 * Kept DOM/fetch-free so it can be unit-tested in Node.
 */

/**
 * @param {object} tx - parsed transaction (see parseMoneyForwardCsv)
 * @param {string} householdId
 * @param {string} [mark] - optional mark override (me/spouse/shared/excluded)
 */
export function txToRow(tx, householdId, mark = undefined) {
  const resolvedMark = mark !== undefined ? mark : tx.mark || null;
  return {
    household_id: householdId,
    id: tx.id,
    date: tx.date,
    month: tx.month,
    content: tx.content ?? "",
    amount: tx.amount,
    institution: tx.institution ?? "",
    major_category: tx.majorCategory ?? "",
    minor_category: tx.minorCategory ?? "",
    memo: tx.memo ?? "",
    is_transfer: Boolean(tx.isTransfer),
    is_calc_target: tx.isCalcTarget !== false,
    mark: resolvedMark || null,
    source_label: tx.sourceLabel ?? "",
  };
}

/** @param {object} row - Supabase transactions row */
export function rowToTx(row) {
  return {
    id: row.id,
    date: row.date,
    month: row.month,
    content: row.content ?? "",
    amount: Number(row.amount),
    institution: row.institution ?? "",
    majorCategory: row.major_category ?? "",
    minorCategory: row.minor_category ?? "",
    memo: row.memo ?? "",
    isTransfer: Boolean(row.is_transfer),
    isCalcTarget: row.is_calc_target !== false,
    sourceLabel: row.source_label ?? "",
  };
}

/**
 * Build marks map and transaction list from DB rows.
 * @param {object[]} rows
 * @returns {{ transactions: object[], marks: Record<string, string> }}
 */
export function rowsToLedger(rows) {
  const transactions = [];
  const marks = {};

  for (const row of rows) {
    const tx = rowToTx(row);
    transactions.push(tx);
    if (row.mark) marks[row.id] = row.mark;
  }

  return { transactions, marks };
}

/**
 * @param {object[]} transactions
 * @param {Record<string, string>} marks
 * @param {string} householdId
 * @returns {object[]}
 */
export function ledgerToRows(transactions, marks, householdId) {
  return transactions.map((tx) => txToRow(tx, householdId, marks[tx.id] || null));
}
