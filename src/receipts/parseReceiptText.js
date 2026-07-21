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
  /合計|小計|総計|お会計|お預り|お釣り|釣銭|税込|税抜|消費税|内税|外税|対象額|点数|登録|電話|TEL|〒|領収|レシート|明細|ありがとうございました|またのご来店|担当|レジ|No\.|伝票|会員|ポイント|残高|控え|コピー|税率|軽減|非課税|免税/i;

const PRICE_AT_END_RE = /^(.*?)(?:\s|　)+[¥￥]?\s*(-?\d{1,3}(?:,\d{3})*|-?\d+)\s*[円]?\s*$/;
const PRICE_ONLY_RE = /^[¥￥]?\s*(-?\d{1,3}(?:,\d{3})*|-?\d+)\s*[円]?\s*$/;

/**
 * @param {string|number} raw
 * @returns {number|null}
 */
export function parseAmount(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).replace(/[¥￥,\s円]/g, "");
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} text
 * @returns {string} YYYY-MM-DD or ""
 */
export function extractDate(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines.slice(0, 20)) {
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
 * @param {string} text
 * @returns {string}
 */
export function extractStoreName(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 12)) {
    if (DATE_PATTERNS.some((re) => re.test(line))) continue;
    if (/^[\d\s\/.:-]+$/.test(line)) continue;
    if (/電話|TEL|〒|https?:|www\./i.test(line)) continue;
    if (line.length < 2 || line.length > 40) continue;
    // Prefer lines that look like store names (kana/kanji/latin), not pure prices.
    if (PRICE_ONLY_RE.test(line)) continue;
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
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!/合計|総計|お会計|ご請求/i.test(line)) continue;
    const amounts = [...line.matchAll(/[¥￥]?\s*(-?\d{1,3}(?:,\d{3})*|-?\d+)\s*[円]?/g)]
      .map((m) => parseAmount(m[1]))
      .filter((n) => n != null && n !== 0);
    if (amounts.length) return amounts[amounts.length - 1];
  }
  return null;
}

/**
 * @param {string} line
 * @returns {{ name: string, amount: number } | null}
 */
function parseItemLine(line) {
  const trimmed = line.trim();
  if (!trimmed || SKIP_LINE_RE.test(trimmed)) return null;

  const endMatch = trimmed.match(PRICE_AT_END_RE);
  if (endMatch) {
    const name = endMatch[1].replace(/\s+/g, " ").trim();
    const amount = parseAmount(endMatch[2]);
    if (!name || amount == null || amount === 0) return null;
    if (/^[¥￥\d,.-]+$/.test(name)) return null;
    return { name, amount: Math.abs(amount) };
  }
  return null;
}

/**
 * @param {string} text - full OCR text (legacy heuristic parser)
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
 *   items: Array<{
 *     id: string,
 *     receiptId: string,
 *     date: string,
 *     storeName: string,
 *     itemName: string,
 *     quantity: string,
 *     unitPrice: string,
 *     amount: number|null,
 *     paymentMethod: string,
 *     taxNote: string,
 *     memo: string,
 *     sourceFile: string,
 *   }>
 * }}
 */
export function parseReceiptText(text, meta = {}) {
  const rawText = String(text || "");
  const sourceFile = meta.sourceFile || "";
  const receiptId =
    meta.receiptId ||
    `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const date = extractDate(rawText);
  const storeName = extractStoreName(rawText);
  const paymentMethod = extractPaymentMethod(rawText);
  const total = extractTotal(rawText);

  const lines = rawText.split(/\r?\n/);
  /** @type {Array<{ name: string, amount: number }>} */
  const parsedItems = [];
  for (const line of lines) {
    const item = parseItemLine(line);
    if (item) parsedItems.push(item);
  }

  // Drop a trailing "合計" doppelganger if the last item amount equals total
  // and the name still slipped through somehow — already skipped by SKIP_LINE_RE.
  // If OCR found no line items but found a total, emit one summary row.
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
