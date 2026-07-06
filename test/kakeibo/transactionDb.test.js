import { test } from "node:test";
import assert from "node:assert/strict";

import { txToRow, rowToTx, rowsToLedger, ledgerToRows } from "../../src/kakeibo/transactionDb.js";

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111";

const sampleTx = {
  id: "mf-001",
  date: "2026-01-10",
  month: "2026-01",
  content: "スーパー",
  amount: -1500,
  institution: "PayPayカード",
  majorCategory: "食費",
  minorCategory: "食料品",
  memo: "週末の買い物",
  isTransfer: false,
  isCalcTarget: true,
  sourceLabel: "2026-01.csv",
};

test("txToRow maps camelCase fields to snake_case columns", () => {
  const row = txToRow(sampleTx, HOUSEHOLD, "me");
  assert.equal(row.household_id, HOUSEHOLD);
  assert.equal(row.id, "mf-001");
  assert.equal(row.major_category, "食費");
  assert.equal(row.minor_category, "食料品");
  assert.equal(row.mark, "me");
  assert.equal(row.is_transfer, false);
  assert.equal(row.is_calc_target, true);
});

test("rowToTx round-trips through txToRow", () => {
  const row = txToRow(sampleTx, HOUSEHOLD, "spouse");
  const restored = rowToTx(row);
  assert.deepEqual(restored, {
    id: sampleTx.id,
    date: sampleTx.date,
    month: sampleTx.month,
    content: sampleTx.content,
    amount: sampleTx.amount,
    institution: sampleTx.institution,
    majorCategory: sampleTx.majorCategory,
    minorCategory: sampleTx.minorCategory,
    memo: sampleTx.memo,
    isTransfer: false,
    isCalcTarget: true,
    sourceLabel: sampleTx.sourceLabel,
  });
});

test("rowsToLedger splits marks from transactions", () => {
  const rows = [
    txToRow(sampleTx, HOUSEHOLD, "me"),
    txToRow({ ...sampleTx, id: "mf-002", memo: "" }, HOUSEHOLD, null),
  ];
  const { transactions, marks } = rowsToLedger(rows);
  assert.equal(transactions.length, 2);
  assert.deepEqual(marks, { "mf-001": "me" });
});

test("ledgerToRows applies marks map", () => {
  const txs = [sampleTx, { ...sampleTx, id: "mf-002" }];
  const rows = ledgerToRows(txs, { "mf-001": "me", "mf-002": "spouse" }, HOUSEHOLD);
  assert.equal(rows[0].mark, "me");
  assert.equal(rows[1].mark, "spouse");
});
