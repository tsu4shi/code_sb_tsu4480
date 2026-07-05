/**
 * Merge transaction arrays parsed from multiple monthly MoneyForward ME
 * exports into a single, deduplicated, date-sorted ledger.
 *
 * MoneyForward ME's per-row "ID" is stable across exports, so if two export
 * files happen to overlap (e.g. re-exporting a month), the later occurrence
 * of the same ID is dropped in favor of the first one encountered.
 *
 * @param {Array<Array<object>>} transactionGroups - one array per source file
 * @returns {{ transactions: object[], duplicateCount: number }}
 */
export function combineTransactions(transactionGroups) {
  const seen = new Map();
  let duplicateCount = 0;

  for (const group of transactionGroups) {
    for (const tx of group) {
      if (seen.has(tx.id)) {
        duplicateCount++;
        continue;
      }
      seen.set(tx.id, tx);
    }
  }

  const transactions = Array.from(seen.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return 0;
  });

  return { transactions, duplicateCount };
}
