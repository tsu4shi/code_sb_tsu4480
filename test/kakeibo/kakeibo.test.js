import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCsvRows } from "../../src/kakeibo/csv.js";
import { parseMoneyForwardCsv } from "../../src/kakeibo/parseMoneyForwardCsv.js";
import { combineTransactions } from "../../src/kakeibo/combineTransactions.js";
import {
  summarizeByMonthAndPerson,
  isExpenseEligible,
  PERSON_ME,
  PERSON_SPOUSE,
  PERSON_SHARED,
  PERSON_EXCLUDED,
} from "../../src/kakeibo/aggregate.js";
import { buildLedgerCsv, parseLedgerCsv, isLedgerCsvHeader } from "../../src/kakeibo/ledgerCsv.js";

const HEADER =
  '"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"';

function sampleCsv(rows) {
  return [HEADER, ...rows].join("\n");
}

test("parseCsvRows handles quoted fields with embedded commas and quotes", () => {
  const text = '"a","b, with comma","c ""quoted"" word"\n"1","2","3"';
  const rows = parseCsvRows(text);
  assert.deepEqual(rows, [
    ["a", "b, with comma", 'c "quoted" word'],
    ["1", "2", "3"],
  ]);
});

test("parseMoneyForwardCsv maps columns, dates and amounts", () => {
  const csv = sampleCsv([
    '"1","2026/01/31","スーパーで買い物","-1234","太郎_カードA","食費","食料品","","0","id-1"',
    '"1","2026/01/05","給与","300000","太郎_銀行A","収入","給与","","0","id-2"',
    '"0","2026/01/10","口座間振替","-50000","太郎_銀行A","収入","振り替え","","1","id-3"',
  ]);

  const txs = parseMoneyForwardCsv(csv, "test-file.csv");
  assert.equal(txs.length, 3);

  const [first, second, third] = txs;
  assert.equal(first.date, "2026-01-31");
  assert.equal(first.month, "2026-01");
  assert.equal(first.amount, -1234);
  assert.equal(first.isTransfer, false);
  assert.equal(first.isCalcTarget, true);
  assert.equal(first.sourceLabel, "test-file.csv");

  assert.equal(second.amount, 300000);
  assert.equal(second.majorCategory, "収入");

  assert.equal(third.isCalcTarget, false);
  assert.equal(third.isTransfer, true);
});

test("parseMoneyForwardCsv is tolerant of column reordering", () => {
  const reordered =
    '"ID","日付","金額（円）","内容","振替","計算対象","保有金融機関","大項目","中項目","メモ"\n' +
    '"id-9","2026/02/01","-500","コンビニ","0","1","太郎_カードA","食費","食料品",""';
  const [tx] = parseMoneyForwardCsv(reordered);
  assert.equal(tx.id, "id-9");
  assert.equal(tx.amount, -500);
  assert.equal(tx.content, "コンビニ");
});

test("combineTransactions dedupes by id and sorts by date", () => {
  const jan = parseMoneyForwardCsv(
    sampleCsv([
      '"1","2026/01/20","B","-200","太郎_カードA","食費","食料品","","0","id-b"',
      '"1","2026/01/01","A","-100","太郎_カードA","食費","食料品","","0","id-a"',
    ])
  );
  const feb = parseMoneyForwardCsv(
    sampleCsv([
      // id-b re-appears (simulating an overlapping re-export) and must be dropped.
      '"1","2026/01/20","B","-200","太郎_カードA","食費","食料品","","0","id-b"',
      '"1","2026/02/01","C","-300","太郎_カードA","食費","食料品","","0","id-c"',
    ])
  );

  const { transactions, duplicateCount } = combineTransactions([jan, feb]);
  assert.equal(duplicateCount, 1);
  assert.deepEqual(
    transactions.map((t) => t.id),
    ["id-a", "id-b", "id-c"]
  );
});

test("isExpenseEligible excludes income, transfers and calc-excluded rows", () => {
  const [expense, income, transfer, excluded] = parseMoneyForwardCsv(
    sampleCsv([
      '"1","2026/01/01","支出","-1000","太郎_カードA","食費","食料品","","0","id-1"',
      '"1","2026/01/01","収入","1000","太郎_カードA","収入","給与","","0","id-2"',
      '"1","2026/01/01","振替","-1000","太郎_カードA","収入","振り替え","","1","id-3"',
      '"0","2026/01/01","対象外","-1000","太郎_カードA","食費","食料品","","0","id-4"',
    ])
  );
  assert.equal(isExpenseEligible(expense), true);
  assert.equal(isExpenseEligible(income), false);
  assert.equal(isExpenseEligible(transfer), false);
  assert.equal(isExpenseEligible(excluded), false);
});

test("summarizeByMonthAndPerson aggregates marked expenses per month", () => {
  const txs = parseMoneyForwardCsv(
    sampleCsv([
      '"1","2026/01/10","私の食費","-1000","太郎_カードA","食費","食料品","","0","id-1"',
      '"1","2026/01/20","妻の食費","-2000","花子_カードB","食費","食料品","","0","id-2"',
      '"1","2026/01/25","家賃","-80000","太郎_銀行A","住宅","家賃","","0","id-3"',
      '"1","2026/02/05","私の趣味","-3000","太郎_カードA","趣味・娯楽","","","0","id-4"',
      '"1","2026/02/06","未マークの支出","-500","太郎_カードA","日用品","","","0","id-5"',
      '"1","2026/02/07","給与","250000","太郎_銀行A","収入","給与","","0","id-6"',
    ])
  );

  const marks = {
    "id-1": PERSON_ME,
    "id-2": PERSON_SPOUSE,
    "id-3": PERSON_SHARED,
    "id-4": PERSON_ME,
    // id-5 intentionally left unmarked
  };

  const summary = summarizeByMonthAndPerson(txs, marks);

  assert.deepEqual(summary.months, ["2026-01", "2026-02"]);
  assert.equal(summary.byMonth["2026-01"][PERSON_ME], 1000);
  assert.equal(summary.byMonth["2026-01"][PERSON_SPOUSE], 2000);
  assert.equal(summary.byMonth["2026-01"][PERSON_SHARED], 80000);
  assert.equal(summary.byMonth["2026-02"][PERSON_ME], 3000);

  assert.equal(summary.totals[PERSON_ME], 4000);
  assert.equal(summary.totals[PERSON_SPOUSE], 2000);
  assert.equal(summary.totals[PERSON_SHARED], 80000);

  assert.equal(summary.unmarked.count, 1);
  assert.equal(summary.unmarked.amount, 500);
  assert.equal(summary.unmarked.byMonth["2026-02"], 500);

  // income row (id-6) is excluded from expense aggregation.
  assert.equal(summary.excludedCount, 1);
});

test("summarizeByMonthAndPerson drops 除外-marked expenses from all totals", () => {
  const txs = parseMoneyForwardCsv(
    sampleCsv([
      '"1","2026/01/10","私の食費","-1000","太郎_カードA","食費","食料品","","0","id-1"',
      '"1","2026/01/15","現金引き出し(振替判定されず)","-30000","太郎_銀行A","現金・カード","その他","","0","id-2"',
      '"1","2026/02/01","私の趣味","-500","太郎_カードA","趣味・娯楽","","","0","id-3"',
    ])
  );

  const marks = {
    "id-1": PERSON_ME,
    "id-2": PERSON_EXCLUDED,
    "id-3": PERSON_EXCLUDED,
  };

  const summary = summarizeByMonthAndPerson(txs, marks);

  // The excluded transaction's amount must not show up anywhere in totals.
  assert.equal(summary.totals[PERSON_ME], 1000);
  assert.equal(summary.totals[PERSON_SPOUSE], 0);
  assert.equal(summary.totals[PERSON_SHARED], 0);
  assert.equal(summary.unmarked.count, 0);

  assert.equal(summary.excludedByMark.count, 2);
  assert.equal(summary.excludedByMark.amount, 30500);

  // 2026-02 has only an excluded transaction, but the month must still
  // appear (with zeros) rather than disappearing from the summary.
  assert.deepEqual(summary.months, ["2026-01", "2026-02"]);
  assert.deepEqual(summary.byMonth["2026-02"], { [PERSON_ME]: 0, [PERSON_SPOUSE]: 0, [PERSON_SHARED]: 0 });
});

test("buildLedgerCsv + parseLedgerCsv round-trips transactions and marks", () => {
  const txs = parseMoneyForwardCsv(
    sampleCsv([
      '"1","2026/01/10","私の食費","-1000","太郎_カードA","食費","食料品","","0","id-1"',
      '"1","2026/01/20","妻の食費","-2000","花子_カードB","食費","食料品","","0","id-2"',
      '"1","2026/01/25","口座振替","-500","太郎_銀行A","収入","振り替え","","1","id-3"',
    ])
  );
  const marks = { "id-1": PERSON_ME, "id-2": PERSON_SPOUSE, "id-3": PERSON_EXCLUDED };

  const csv = buildLedgerCsv(txs, marks);
  assert.ok(isLedgerCsvHeader(parseCsvRows(csv.replace(/^\uFEFF/, ""))[0]));

  const { transactions: restored, marks: restoredMarks } = parseLedgerCsv(csv);
  assert.equal(restored.length, 3);
  assert.deepEqual(
    restored.map((t) => t.id),
    ["id-1", "id-2", "id-3"]
  );
  assert.equal(restored[0].amount, -1000);
  assert.equal(restored[0].date, "2026-01-10");
  assert.equal(restored[0].month, "2026-01");
  assert.equal(restored[2].isTransfer, true);

  assert.deepEqual(restoredMarks, { "id-1": PERSON_ME, "id-2": PERSON_SPOUSE, "id-3": PERSON_EXCLUDED });
});

test("isLedgerCsvHeader rejects a raw MoneyForward header", () => {
  const [rawHeader] = parseCsvRows(HEADER);
  assert.equal(isLedgerCsvHeader(rawHeader), false);
});
