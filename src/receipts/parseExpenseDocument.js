import { parseAmount } from "./parseReceiptText.js";

/**
 * Map Document AI Expense Parser document.entities → receipt line-item rows.
 * Framework-agnostic plain JS for node --test.
 */

/**
 * @param {object} entity
 * @returns {string}
 */
function entityText(entity) {
  const normalized = entity?.normalizedValue?.text;
  if (normalized != null && String(normalized).trim()) {
    return String(normalized).trim();
  }
  if (entity?.mentionText != null && String(entity.mentionText).trim()) {
    return String(entity.mentionText).trim();
  }
  return "";
}

/**
 * Prefer normalized date (YYYY-MM-DD); fall back to mention text heuristics.
 * @param {object|undefined} entity
 * @returns {string}
 */
function entityDate(entity) {
  if (!entity) return "";
  const nv = entity.normalizedValue;
  if (nv?.dateValue?.year && nv?.dateValue?.month && nv?.dateValue?.day) {
    const y = nv.dateValue.year;
    const m = String(nv.dateValue.month).padStart(2, "0");
    const d = String(nv.dateValue.day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = entityText(entity);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const jp = text.match(/(\d{4})\s*[\/年.-]\s*(\d{1,2})\s*[\/月.-]\s*(\d{1,2})/);
  if (jp) {
    return `${jp[1]}-${String(jp[2]).padStart(2, "0")}-${String(jp[3]).padStart(2, "0")}`;
  }
  return text;
}

/**
 * @param {object|undefined} entity
 * @returns {number|null}
 */
function entityAmount(entity) {
  if (!entity) return null;
  const money = entity.normalizedValue?.moneyValue;
  if (money && money.units != null) {
    const units = Number(money.units);
    const nanos = Number(money.nanos) || 0;
    if (Number.isFinite(units)) {
      const value = units + nanos / 1e9;
      // Yen receipts are whole yen; avoid floating noise like 198.000000001.
      const currency = String(money.currencyCode || "").toUpperCase();
      if (currency === "JPY" || currency === "") {
        return Math.round(value);
      }
      return value;
    }
  }
  const floatVal = entity.normalizedValue?.floatValue;
  if (floatVal != null && Number.isFinite(Number(floatVal))) {
    return Number(floatVal);
  }
  return parseAmount(entityText(entity));
}

/**
 * @param {object[]} entities
 * @param {string} type
 * @returns {object|undefined}
 */
function findEntity(entities, type) {
  return entities.find((e) => e?.type === type);
}

/**
 * @param {object} lineItemEntity
 * @returns {{ description: string, amount: number|null, quantity: string, unitPrice: string }}
 */
function parseLineItemProperties(lineItemEntity) {
  const props = Array.isArray(lineItemEntity?.properties) ? lineItemEntity.properties : [];
  let description = "";
  let amount = null;
  let quantity = "";
  let unitPrice = "";

  for (const prop of props) {
    // Match exact property types only — `endsWith("/amount")` wrongly matches
    // `line_item/payment_amount`.
    const type = String(prop?.type || "");
    if (type === "line_item/description") {
      description = entityText(prop) || description;
    } else if (type === "line_item/amount") {
      amount = entityAmount(prop);
    } else if (type === "line_item/quantity") {
      quantity = entityText(prop);
    } else if (type === "line_item/unit_price") {
      unitPrice = entityText(prop);
      if (amount == null) amount = entityAmount(prop);
    }
  }

  if (!description) {
    description = entityText(lineItemEntity);
  }

  return { description, amount, quantity, unitPrice };
}

/**
 * Normalize payment_type mention into the labels used by the receipts UI.
 * @param {string} raw
 * @returns {string}
 */
export function normalizePaymentType(raw) {
  const s = String(raw || "");
  if (!s) return "";
  if (/クレジット|CREDIT|VISA|MASTER|JCB|AMEX|カード/i.test(s)) return "クレジット";
  if (/PayPay|ペイペイ/i.test(s)) return "PayPay";
  if (/楽天ペイ|Rakuten\s*Pay/i.test(s)) return "楽天ペイ";
  if (/電子マネー|Suica|PASMO|ICOCA|iD\b|QUICPay|nanaco|WAON|Edy/i.test(s)) return "電子マネー";
  if (/現金|CASH/i.test(s)) return "現金";
  return s.replace(/\s+/g, " ").trim();
}

/**
 * @param {object} document - Document AI `document` object
 * @param {object} [meta]
 * @param {string} [meta.sourceFile]
 * @param {string} [meta.receiptId]
 * @returns {{
 *   receiptId: string,
 *   date: string,
 *   storeName: string,
 *   paymentMethod: string,
 *   total: number|null,
 *   rawText: string,
 *   sourceFile: string,
 *   items: Array<object>
 * }}
 */
export function parseExpenseDocument(document, meta = {}) {
  const entities = Array.isArray(document?.entities) ? document.entities : [];
  const sourceFile = meta.sourceFile || "";
  const receiptId =
    meta.receiptId ||
    `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const storeName = entityText(findEntity(entities, "supplier_name"));
  const date = entityDate(findEntity(entities, "receipt_date"));
  const paymentMethod = normalizePaymentType(entityText(findEntity(entities, "payment_type")));
  const total = entityAmount(findEntity(entities, "total_amount"));
  const rawText = String(document?.text || "");

  const lineEntities = entities.filter((e) => e?.type === "line_item");
  /** @type {Array<{ description: string, amount: number|null, quantity: string, unitPrice: string }>} */
  const parsedLines = lineEntities.map(parseLineItemProperties).filter((line) => {
    return Boolean(line.description || line.amount != null);
  });

  let items;
  if (parsedLines.length === 0) {
    items = [
      {
        id: `${receiptId}_0`,
        receiptId,
        date,
        storeName,
        itemName: storeName ? `${storeName}（合計）` : "（合計）",
        quantity: "",
        unitPrice: "",
        amount: total,
        paymentMethod,
        taxNote: "",
        memo: "",
        sourceFile,
      },
    ];
  } else {
    items = parsedLines.map((line, i) => ({
      id: `${receiptId}_${i}`,
      receiptId,
      date,
      storeName,
      itemName: line.description || "（品目）",
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      paymentMethod,
      taxNote: "",
      memo: "",
      sourceFile,
    }));
  }

  return {
    receiptId,
    date,
    storeName,
    paymentMethod,
    total,
    rawText,
    sourceFile,
    items,
  };
}
