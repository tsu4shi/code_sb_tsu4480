/**
 * Marking + monthly aggregation logic for the kakeibo ledger.
 *
 * The user manually tags each transaction with who it belongs to. This
 * module only knows about a small fixed set of person keys; the UI is
 * responsible for mapping those to display labels.
 */

export const PERSON_ME = "me";
export const PERSON_SPOUSE = "spouse";
export const PERSON_SHARED = "shared";
export const PERSON_EXCLUDED = "excluded";
export const PERSON_UNSET = "unset";

/** Marks that contribute to the money totals table (夫/妻/共通). */
export const PERSON_KEYS = [PERSON_ME, PERSON_SPOUSE, PERSON_SHARED];

/** All valid mark values a transaction can be tagged with, including 除外. */
export const MARK_KEYS = [PERSON_ME, PERSON_SPOUSE, PERSON_SHARED, PERSON_EXCLUDED];

/** Japanese display labels for each mark value. */
export const PERSON_LABELS_JA = {
  [PERSON_ME]: "夫",
  [PERSON_SPOUSE]: "妻",
  [PERSON_SHARED]: "共通",
  [PERSON_EXCLUDED]: "除外",
};

/** Reverse lookup: Japanese label -> mark value (accepts English keys too). */
export const PERSON_LABEL_TO_KEY = {
  夫: PERSON_ME,
  私: PERSON_ME,
  妻: PERSON_SPOUSE,
  共通: PERSON_SHARED,
  除外: PERSON_EXCLUDED,
  [PERSON_ME]: PERSON_ME,
  [PERSON_SPOUSE]: PERSON_SPOUSE,
  [PERSON_SHARED]: PERSON_SHARED,
  [PERSON_EXCLUDED]: PERSON_EXCLUDED,
};

/**
 * A transaction counts toward personal expense totals when:
 * - it's included in MoneyForward's own calculation (計算対象 = 1)
 * - it isn't an internal transfer between the user's own accounts (振替 = 0)
 * - the amount is negative (an outflow, not income)
 */
export function isExpenseEligible(tx) {
  return tx.isCalcTarget && !tx.isTransfer && tx.amount < 0;
}

/**
 * @param {object[]} transactions - combined ledger (see combineTransactions)
 * @param {Record<string, string>} marks - transaction id -> mark value (me/spouse/shared/excluded)
 * @returns {{
 *   months: string[],
 *   byMonth: Record<string, Record<string, number>>,
 *   totals: Record<string, number>,
 *   unmarked: { count: number, amount: number, byMonth: Record<string, number> },
 *   excludedByMark: { count: number, amount: number },
 *   excludedCount: number,
 * }}
 */
export function summarizeByMonthAndPerson(transactions, marks = {}) {
  const byMonth = {};
  const totals = { [PERSON_ME]: 0, [PERSON_SPOUSE]: 0, [PERSON_SHARED]: 0 };
  const unmarked = { count: 0, amount: 0, byMonth: {} };
  // Transactions the user manually marked "除外" (e.g. an account transfer
  // MoneyForward didn't flag as 振替): dropped from all totals, tracked
  // separately purely for transparency.
  const excludedByMark = { count: 0, amount: 0 };
  let excludedCount = 0;

  const ensureMonth = (month) => {
    if (!byMonth[month]) {
      byMonth[month] = { [PERSON_ME]: 0, [PERSON_SPOUSE]: 0, [PERSON_SHARED]: 0 };
    }
    return byMonth[month];
  };

  const eligibleTxs = transactions.filter(isExpenseEligible);
  excludedCount = transactions.length - eligibleTxs.length;

  // Pre-register every month with eligible transactions so it still shows
  // up (with zeros) even if every transaction in it ends up marked 除外.
  for (const tx of eligibleTxs) {
    ensureMonth(tx.month);
  }

  for (const tx of eligibleTxs) {
    const amount = Math.abs(tx.amount);
    const person = marks[tx.id];

    if (person === PERSON_EXCLUDED) {
      excludedByMark.count++;
      excludedByMark.amount += amount;
      continue;
    }

    const monthBucket = ensureMonth(tx.month);

    if (person && PERSON_KEYS.includes(person)) {
      monthBucket[person] += amount;
      totals[person] += amount;
    } else {
      unmarked.count++;
      unmarked.amount += amount;
      unmarked.byMonth[tx.month] = (unmarked.byMonth[tx.month] || 0) + amount;
    }
  }

  const months = Object.keys(byMonth).sort();

  return { months, byMonth, totals, unmarked, excludedByMark, excludedCount };
}
