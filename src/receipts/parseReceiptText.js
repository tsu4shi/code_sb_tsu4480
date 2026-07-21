/**
 * Heuristic parser for Japanese receipt OCR text → line items.
 * Designed to be good enough for v1; users can edit rows in the UI.
 */

const DATE_PATTERNS = [
  /(\d{4})\s*[\/年.-]\s*(\d{1,2})\s*[\/月.-]\s*(\d{1,2})\s*日?/,
  /(\d{2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})/,
];

const PAYMENT_PATTERNS = [
  { re: /クレジット|CREDIT|VISA|MASTER|JCB|AMEX|カード決済/i, label: "クレジット" },
  { re: /PayPay|ペイペイ/i, label: "PayPay" },
  { re: /楽天ペイ|Rakuten\s*Pay/i, label: "楽天ペイ" },
  { re: /電子マネー|交通系|Suica|PASMO|ICOCA|iD\b|QUICPay|nanaco|WAON|楽天Edy/i, label: "電子マネー" },
  { re: /現金|CASH/i, label: "現金" },
];

const SKIP_LINE_RE =
  /合計|小計|総計|お会計|お預り|お釣り|釣銭|税込|税抜|消費税|内税|外税|対象額|税額|点数|登録|電話|TEL|〒|領収|レシート|明細|ありがとうございました|またのご来店|担当|レジ|No\.|伝票|会員|ポイント|残高|控え|コピー|税率|軽減|非課税|免税|登録番号/i;

const PAYMENT_LINE_RE =
  /^(クレジット|CREDIT|VISA|MASTER|JCB|AMEX|PayPay|ペイペイ|楽天ペイ|現金|CASH|電子マネー|Suica|PASMO|ICOCA|QUICPay|nanaco|WAON)/i;

/** Half- and full-width digit / yen / comma characters for price tails. */
const PRICE_AT_END_RE =
  /^(.*?)(?:\s|　)+[¥￥]?\s*(-?[0-9０-９]{1,3}(?:[,，][0-9０-９]{3})*|-?[0-9０-９]+)\s*[円]?\s*$/;
const PRICE_ONLY_RE = /^[¥￥]?\s*(-?[0-9０-９]{1,3}(?:[,，][0-9０-９]{3})*|-?[0-9０-９]+)\s*[円]?\s*$/;

/**
 * Normalize full-width digits / punctuation commonly seen on JP receipts.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeReceiptChars(raw) {
  return String(raw || "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[，]/g, ",")
    .replace(/[￥]/g, "¥")
    .replace(/[　]/g, " ");
}

/**
 * @param {string|number} raw
 * @returns {number|null}
 */
export function parseAmount(raw) {
  if (raw == null || raw === "") return null;
  const s = normalizeReceiptChars(raw).replace(/[¥,\s円]/g, "");
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} text
 * @returns {string} YYYY-MM-DD or ""
 */
export function extractDate(text) {
  const normalized = normalizeReceiptChars(text);
  const lines = normalized.split(/\r?\n/);
  for (const line of lines.slice(0, 25)) {
    for (const re of DATE_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      let year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (year < 100) year += 2000;
      if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) continue;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return "";
}

/**
 * True when value looks like a full calendar date (not year-only).
 * @param {string} value
 * @returns {boolean}
 */
export function isCompleteDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

/**
 * @param {string} text
 * @returns {string}
 */
export function extractStoreName(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 12)) {
    if (DATE_PATTERNS.some((re) => re.test(normalizeReceiptChars(line)))) continue;
    if (/^[\d\s\/.:-]+$/.test(line)) continue;
    if (/電話|TEL|〒|https?:|www\.|登録番号|領収/i.test(line)) continue;
    if (line.length < 2 || line.length > 40) continue;
    if (PRICE_ONLY_RE.test(line)) continue;
    // Prefer lines that look like store names (contain kana/kanji or DCM etc.).
    if (!/[一-龥ぁ-んァ-ンA-Za-zＡ-Ｚａ-ｚ]/.test(line)) continue;
    return line.replace(/\s+/g, " ");
  }
  return "";
}

/**
 * @param {string} text
 * @returns {string}
 */
export function extractPaymentMethod(text) {
  const s = String(text || "");
  for (const { re, label } of PAYMENT_PATTERNS) {
    if (re.test(s)) return label;
  }
  return "";
}

/**
 * @param {string} text
 * @returns {number|null}
 */
export function extractTotal(text) {
  const lines = normalizeReceiptChars(text).split(/\r?\n/);
  /** @type {number|null} */
  let fallback = null;
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip tax/subtotal noise; we want the grand total.
    if (/税合計|小計|対象額|税額|内税|外税/i.test(trimmed)) continue;
    if (!/合計|総計|お会計|ご請求/.test(trimmed)) continue;
    const amounts = [...trimmed.matchAll(/[¥]?\s*(-?\d{1,3}(?:,\d{3})*|-?\d+)\s*[円]?/g)]
      .map((m) => parseAmount(m[1]))
      .filter((n) => n != null && n !== 0);
    if (!amounts.length) continue;
    const value = amounts[amounts.length - 1];
    if (/^(合計|総計|お会計|ご請求)/.test(trimmed)) {
      return value;
    }
    fallback = value;
  }
  return fallback;
}

/**
 * @param {string} line
 * @returns {{ name: string, amount: number } | null}
 */
function parseItemLine(line) {
  const trimmed = line.trim();
  if (!trimmed || SKIP_LINE_RE.test(trimmed)) return null;
  if (PAYMENT_LINE_RE.test(trimmed)) return null;

  const endMatch = trimmed.match(PRICE_AT_END_RE);
  if (endMatch) {
    let name = endMatch[1].replace(/\s+/g, " ").trim();
    const amount = parseAmount(endMatch[2]);
    if (!name || amount == null || amount === 0) return null;
    if (/^[¥￥\d０-９,，.-]+$/.test(name)) return null;
    // Drop leading SKU-like codes: "003 花と野菜..." → "花と野菜..."
    name = name.replace(/^[0-9０-９]{2,6}\s+/, "");
    if (!name) return null;
    return { name, amount: Math.abs(amount) };
  }
  return null;
}

/**
 * Pair a description-only line with a following price-only line (common on JP receipts).
 * @param {string[]} lines
 * @returns {Array<{ name: string, amount: number }>}
 */
function parseItemLinesWithContinuation(lines) {
  /** @type {Array<{ name: string, amount: number }>} */
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const sameLine = parseItemLine(line);
    if (sameLine) {
      items.push(sameLine);
      continue;
    }

    if (SKIP_LINE_RE.test(line) || PAYMENT_LINE_RE.test(line) || PRICE_ONLY_RE.test(line)) {
      continue;
    }
    if (DATE_PATTERNS.some((re) => re.test(normalizeReceiptChars(line)))) continue;
    if (line.length < 2 || line.length > 60) continue;
    if (!/[一-龥ぁ-んァ-ンA-Za-zＡ-Ｚａ-ｚ]/.test(line)) continue;

    const next = (lines[i + 1] || "").trim();
    const priceMatch = next.match(PRICE_ONLY_RE);
    if (!priceMatch) continue;
    const amount = parseAmount(priceMatch[1]);
    if (amount == null || amount === 0) continue;
    let name = line.replace(/\s+/g, " ").replace(/^[0-9０-９]{2,6}\s+/, "");
    if (!name) continue;
    items.push({ name, amount: Math.abs(amount) });
    i += 1; // consume price line
  }
  return items;
}

/**
 * @param {string} text - full OCR text (legacy heuristic parser)
 * @param {object} [meta]
 * @param {string} [meta.sourceFile]
 * @param {string} [meta.receiptId]
 * @param {string} [meta.date]
 * @param {string} [meta.storeName]
 * @param {string} [meta.paymentMethod]
 * @param {number|null} [meta.total]
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
export function parseReceiptText(text, meta = {}) {
  const rawText = String(text || "");
  const sourceFile = meta.sourceFile || "";
  const receiptId =
    meta.receiptId ||
    `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const date = isCompleteDate(meta.date) ? meta.date : extractDate(rawText) || meta.date || "";
  const storeName = meta.storeName || extractStoreName(rawText);
  const paymentMethod = meta.paymentMethod || extractPaymentMethod(rawText);
  const total = meta.total != null ? meta.total : extractTotal(rawText);

  const lines = rawText.split(/\r?\n/);
  const parsedItems = parseItemLinesWithContinuation(lines);

  let items;
  if (parsedItems.length === 0) {
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
    items = parsedItems.map((item, i) => ({
      id: `${receiptId}_${i}`,
      receiptId,
      date,
      storeName,
      itemName: item.name,
      quantity: "",
      unitPrice: "",
      amount: item.amount,
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
