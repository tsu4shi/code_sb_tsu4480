import {
  extractDate,
  extractPaymentMethod,
  extractStoreName,
  extractTotal,
  isCompleteDate,
  parseAmount,
  parseReceiptText,
} from "./parseReceiptText.js";

/**
 * Map Document AI Expense Parser document.entities → receipt line-item rows.
 * When entity extraction is weak (common on JP thermal receipts), fall back to
 * heuristic parsing of document.text while keeping strong header fields.
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
  // Some clients serialize snake_case.
  if (entity?.mention_text != null && String(entity.mention_text).trim()) {
    return String(entity.mention_text).trim();
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
  const nv = entity.normalizedValue || entity.normalized_value;
  const dateValue = nv?.dateValue || nv?.date_value;
  if (dateValue?.year && dateValue?.month && dateValue?.day) {
    const y = dateValue.year;
    const m = String(dateValue.month).padStart(2, "0");
    const d = String(dateValue.day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = entityText(entity);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const jp = text.match(/(\d{4})\s*[\/年.-]\s*(\d{1,2})\s*[\/月.-]\s*(\d{1,2})/);
  if (jp) {
    return `${jp[1]}-${String(jp[2]).padStart(2, "0")}-${String(jp[3]).padStart(2, "0")}`;
  }
  // Year-only / incomplete → empty so callers can fall back to full OCR text.
  if (/^\d{4}$/.test(text)) return "";
  return isCompleteDate(text) ? text : "";
}

/**
 * @param {object|undefined} entity
 * @returns {number|null}
 */
function entityAmount(entity) {
  if (!entity) return null;
  const nv = entity.normalizedValue || entity.normalized_value;
  const money = nv?.moneyValue || nv?.money_value;
  if (money && money.units != null) {
    const units = Number(money.units);
    const nanos = Number(money.nanos) || 0;
    if (Number.isFinite(units)) {
      const value = units + nanos / 1e9;
      const currency = String(money.currencyCode || money.currency_code || "").toUpperCase();
      if (currency === "JPY" || currency === "") {
        return Math.round(value);
      }
      return value;
    }
  }
  const floatVal = nv?.floatValue ?? nv?.float_value;
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
  return entities.find((e) => e?.type === type || e?.type_ === type);
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
    const type = String(prop?.type || prop?.type_ || "");
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
  description = description.replace(/^[0-9０-９]{2,6}\s+/, "").trim();

  return { description, amount, quantity, unitPrice };
}

/**
 * @param {{ description: string, amount: number|null }} line
 * @returns {boolean}
 */
export function isUsefulLineItem(line) {
  const name = String(line?.description || "").trim();
  if (!name) return false;
  // Reject pure numbers / tiny OCR junk like "35" or "ひんだーつ" without amount.
  if (/^[0-9０-９¥￥,，.\s]+$/.test(name)) return false;
  if (name.length <= 1) return false;
  if (line.amount == null && name.length < 4) return false;
  // Reject payment / tax labels mistaken as items.
  if (/^(合計|小計|税|クレジット|現金|PayPay)/i.test(name)) return false;
  return true;
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
 */
export function parseExpenseDocument(document, meta = {}) {
  const entities = Array.isArray(document?.entities) ? document.entities : [];
  const sourceFile = meta.sourceFile || "";
  const receiptId =
    meta.receiptId ||
    `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const rawText = String(document?.text || "");

  const entityStore = entityText(findEntity(entities, "supplier_name"));
  const entityDateValue = entityDate(findEntity(entities, "receipt_date"));
  const entityPayment = normalizePaymentType(entityText(findEntity(entities, "payment_type")));
  const entityTotal = entityAmount(findEntity(entities, "total_amount"));

  const textDate = extractDate(rawText);
  const textStore = extractStoreName(rawText);
  const textPayment = extractPaymentMethod(rawText);
  const textTotal = extractTotal(rawText);

  const date = isCompleteDate(entityDateValue) ? entityDateValue : textDate || entityDateValue;
  const storeName = entityStore || textStore;
  const paymentMethod = entityPayment || textPayment;
  const total = entityTotal != null ? entityTotal : textTotal;

  const lineEntities = entities.filter((e) => e?.type === "line_item" || e?.type_ === "line_item");
  const entityLines = lineEntities.map(parseLineItemProperties).filter(isUsefulLineItem);

  // Prefer OCR-text line items when Expense Parser line items look weak/wrong.
  const textParsed = parseReceiptText(rawText, {
    sourceFile,
    receiptId,
    date,
    storeName,
    paymentMethod,
    total,
  });
  const textHasRealItems = textParsed.items.some(
    (row) => row.itemName && !/（合計）$/.test(row.itemName) && row.amount != null
  );
  const entityLooksWeak =
    entityLines.length === 0 ||
    entityLines.every((line) => line.amount == null) ||
    entityLines.some((line) => /^[0-9０-９]+$/.test(line.description));

  /** @type {Array<object>} */
  let items;
  if (textHasRealItems && (entityLooksWeak || entityLines.length < textParsed.items.filter((r) => r.amount != null).length)) {
    items = textParsed.items;
  } else if (entityLines.length > 0) {
    items = entityLines.map((line, i) => ({
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
  } else {
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
  }

  // Ensure header fields propagate even if text parser built the rows earlier
  // with incomplete entity headers.
  items = items.map((row) => ({
    ...row,
    date: date || row.date,
    storeName: storeName || row.storeName,
    paymentMethod: paymentMethod || row.paymentMethod,
  }));

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
