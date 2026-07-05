/**
 * Memo edits made inside this tool don't come from any CSV — they need to
 * be layered on top of freshly parsed transactions so they survive
 * re-loading the same source file later (e.g. after a page reload).
 */

/**
 * Mutates `transactions` in place, replacing each `tx.memo` with the
 * persisted override for that id, if one exists. Returns the same array.
 *
 * @param {object[]} transactions
 * @param {Record<string, string>} overrides - transaction id -> memo text
 */
export function applyMemoOverrides(transactions, overrides = {}) {
  for (const tx of transactions) {
    if (Object.prototype.hasOwnProperty.call(overrides, tx.id)) {
      tx.memo = overrides[tx.id];
    }
  }
  return transactions;
}
