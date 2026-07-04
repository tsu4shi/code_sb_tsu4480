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
export const PERSON_UNSET = "unset";

export const PERSON_KEYS = [PERSON_ME, PERSON_SPOUSE, PERSON_SHARED];

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
 * @param {Record<string, string>} marks - transaction id -> person key
 * @returns {{
 *   months: string[],
 *   byMonth: Record<string, Record<string, number>>,
 *   totals: Record<string, number>,
 *   unmarked: { count: number, amount: number, byMonth: Record<string, number> },
 *   excludedCount: number,
 * }}
 */
export function summarizeByMonthAndPerson(transactions, marks = {}) {
  const byMonth = {};
  const totals = { [PERSON_ME]: 0, [PERSON_SPOUSE]: 0, [PERSON_SHARED]: 0 };
  const unmarked = { count: 0, amount: 0, byMonth: {} };
  let excludedCount = 0;

  const ensureMonth = (month) => {
    if (!byMonth[month]) {
      byMonth[month] = { [PERSON_ME]: 0, [PERSON_SPOUSE]: 0, [PERSON_SHARED]: 0 };
    }
    return byMonth[month];
  };

  for (const tx of transactions) {
    if (!isExpenseEligible(tx)) {
      excludedCount++;
      continue;
    }

    const amount = Math.abs(tx.amount);
    const person = marks[tx.id];
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

  return { months, byMonth, totals, unmarked, excludedCount };
}
