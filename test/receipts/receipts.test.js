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
import { normalizePaymentType, parseExpenseDocument } from "../../src/receipts/parseExpenseDocument.js";
import { buildProcessUrl } from "../../src/receipts/documentAiClient.js";
import { MONTHLY_SOFT_LIMIT } from "../../src/receipts/config.js";
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

describe("parseExpenseDocument", () => {
  const sampleDoc = {
    text: "スーパーサンプル店\n牛乳 198\n合計 383",
    entities: [
      { type: "supplier_name", mentionText: "スーパーサンプル店" },
      {
        type: "receipt_date",
        mentionText: "2024/07/15",
        normalizedValue: {
          text: "2024-07-15",
          dateValue: { year: 2024, month: 7, day: 15 },
        },
      },
      {
        type: "total_amount",
        mentionText: "383",
        normalizedValue: { moneyValue: { currencyCode: "JPY", units: "383" } },
      },
      { type: "payment_type", mentionText: "PayPay" },
      {
        type: "line_item",
        mentionText: "牛乳 198",
        properties: [
          { type: "line_item/description", mentionText: "牛乳" },
          {
            type: "line_item/amount",
            mentionText: "198",
            normalizedValue: { moneyValue: { currencyCode: "JPY", units: "198" } },
          },
        ],
      },
      {
        type: "line_item",
        mentionText: "食パン 150",
        properties: [
          { type: "line_item/description", mentionText: "食パン" },
          { type: "line_item/amount", mentionText: "150" },
          { type: "line_item/quantity", mentionText: "1" },
        ],
      },
    ],
  };

  it("maps Expense Parser entities to editable line items", () => {
    const parsed = parseExpenseDocument(sampleDoc, {
      sourceFile: "sample.jpg",
      receiptId: "r_docai",
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
    assert.equal(parsed.items[1].quantity, "1");
    assert.equal(parsed.items[0].sourceFile, "sample.jpg");
    assert.equal(parsed.items[0].receiptId, "r_docai");
  });

  it("falls back to a total row when no line_item entities exist", () => {
    const parsed = parseExpenseDocument(
      {
        entities: [
          { type: "supplier_name", mentionText: "店A" },
          {
            type: "total_amount",
            mentionText: "500",
            normalizedValue: { moneyValue: { units: "500" } },
          },
        ],
      },
      { receiptId: "r_total_only" }
    );
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].amount, 500);
    assert.match(parsed.items[0].itemName, /合計/);
  });

  it("normalizes common payment labels", () => {
    assert.equal(normalizePaymentType("クレジットカード"), "クレジット");
    assert.equal(normalizePaymentType("現金でお支払い"), "現金");
  });
});

describe("buildProcessUrl", () => {
  it("builds the regional process endpoint", () => {
    const url = buildProcessUrl({
      projectId: "project-85ebb717-8d08-418b-a5e",
      location: "asia-southeast1",
      processorId: "24d5014949bfd930",
    });
    assert.equal(
      url,
      "https://asia-southeast1-documentai.googleapis.com/v1/projects/project-85ebb717-8d08-418b-a5e/locations/asia-southeast1/processors/24d5014949bfd930:process"
    );
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

  it("tracks remaining capacity against the soft monthly limit", () => {
    store.clear();
    writeQuota(MONTHLY_SOFT_LIMIT - 2);
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
