import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReceiptCsv, RECEIPT_CSV_HEADER } from "../../src/receipts/receiptCsv.js";
import {
  extractDate,
  extractPaymentMethod,
  extractStoreName,
  extractTotal,
  parseAmount,
  parseReceiptText,
} from "../../src/receipts/parseReceiptText.js";
import { FREE_TIER_MONTHLY_LIMIT } from "../../src/receipts/config.js";
import { currentMonthKey, getQuotaStatus, planBatch, readQuota, recordUsage, writeQuota } from "../../src/receipts/quota.js";

describe("parseAmount", () => {
  it("parses yen amounts with commas and symbols", () => {
    assert.equal(parseAmount("¥1,234"), 1234);
    assert.equal(parseAmount("980円"), 980);
    assert.equal(parseAmount("-100"), -100);
    assert.equal(parseAmount("abc"), null);
  });
});

describe("receipt field extractors", () => {
  const sample = `
スーパーサンプル店
東京都千代田区1-1
TEL 03-0000-0000
2024年07月15日 12:34
牛乳 198
食パン 150
小計 348
消費税 35
合計 ¥383
PayPayでお支払い
ありがとうございました
`.trim();

  it("extracts date, store, payment, total", () => {
    assert.equal(extractDate(sample), "2024-07-15");
    assert.equal(extractStoreName(sample), "スーパーサンプル店");
    assert.equal(extractPaymentMethod(sample), "PayPay");
    assert.equal(extractTotal(sample), 383);
  });

  it("parses line items and skips totals/tax lines", () => {
    const parsed = parseReceiptText(sample, {
      sourceFile: "sample.jpg",
      receiptId: "r_test",
    });
    assert.equal(parsed.date, "2024-07-15");
    assert.equal(parsed.storeName, "スーパーサンプル店");
    assert.equal(parsed.paymentMethod, "PayPay");
    assert.equal(parsed.total, 383);
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].itemName, "牛乳");
    assert.equal(parsed.items[0].amount, 198);
    assert.equal(parsed.items[1].itemName, "食パン");
    assert.equal(parsed.items[1].amount, 150);
    assert.equal(parsed.items[0].sourceFile, "sample.jpg");
    assert.equal(parsed.items[0].receiptId, "r_test");
  });

  it("falls back to a total row when no line items are found", () => {
    const text = `コンビニX\n2024/01/02\n合計 500\n現金`;
    const parsed = parseReceiptText(text, { receiptId: "r_empty" });
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].amount, 500);
    assert.match(parsed.items[0].itemName, /合計/);
  });
});

describe("buildReceiptCsv", () => {
  it("emits UTF-8 BOM, header, and escaped fields", () => {
    const csv = buildReceiptCsv([
      {
        receiptId: "r1",
        date: "2024-07-15",
        storeName: '店"A"',
        itemName: "牛乳",
        quantity: "1",
        unitPrice: "198",
        amount: 198,
        paymentMethod: "現金",
        taxNote: "",
        memo: "テスト",
        sourceFile: "a.jpg",
      },
    ]);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes(RECEIPT_CSV_HEADER.map((h) => `"${h}"`).join(",")));
    assert.ok(csv.includes('"店""A"""'));
    assert.ok(csv.includes('"198"'));
  });
});

describe("quota helpers", () => {
  /** Minimal localStorage stub for Node tests. */
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  it("tracks remaining capacity against the free-tier limit", () => {
    store.clear();
    writeQuota(FREE_TIER_MONTHLY_LIMIT - 2);
    const plan = planBatch(5);
    assert.equal(plan.allowed, 2);
    assert.equal(plan.blocked, 3);
    assert.equal(getQuotaStatus().remaining, 2);

    recordUsage(2);
    assert.equal(getQuotaStatus().remaining, 0);
    assert.equal(planBatch(1).allowed, 0);
  });

  it("resets when the UTC month key changes", () => {
    store.clear();
    const month = currentMonthKey();
    writeQuota(10);
    assert.equal(readQuota().month, month);
    assert.equal(readQuota().used, 10);
  });
});
