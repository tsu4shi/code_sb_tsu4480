import { requireAuth } from "../kakeibo/auth.js";
import { clearApiKey, getApiKey, maskApiKey, setApiKey } from "./apiKeyStore.js";
import { FREE_TIER_MONTHLY_LIMIT } from "./config.js";
import { ConfigError, QuotaError } from "./errors.js";
import { parseReceiptText } from "./parseReceiptText.js";
import { getQuotaStatus, planBatch, recordUsage } from "./quota.js";
import { buildReceiptCsv } from "./receiptCsv.js";
import { annotateDocumentText, imageToBase64 } from "./visionClient.js";

/** @type {object[]} */
let rows = [];

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;

const COLUMNS = [
  { key: "date", label: "日付", type: "text" },
  { key: "storeName", label: "店名", type: "text" },
  { key: "itemName", label: "品目", type: "text" },
  { key: "quantity", label: "数量", type: "text" },
  { key: "unitPrice", label: "単価", type: "text" },
  { key: "amount", label: "金額", type: "number" },
  { key: "paymentMethod", label: "支払方法", type: "text" },
  { key: "taxNote", label: "税区分", type: "text" },
  { key: "memo", label: "メモ", type: "text" },
  { key: "sourceFile", label: "元ファイル名", type: "text" },
];

function $(id) {
  return document.getElementById(id);
}

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error", Boolean(isError && message));
}

function refreshApiKeyUi() {
  const key = getApiKey();
  const input = $("api-key-input");
  if (input && document.activeElement !== input) {
    input.value = key;
  }
  if (key) {
    setStatus($("api-key-status"), `保存済み: ${maskApiKey(key)}`);
  } else {
    setStatus($("api-key-status"), "未設定");
  }
  refreshQuotaUi();
}

function refreshQuotaUi() {
  const status = getQuotaStatus();
  const el = $("quota-status");
  if (el) {
    el.textContent = `今月のOCR使用量（UTC）: ${status.used} / ${status.limit}（残り ${status.remaining}）`;
  }
  const limitLabel = $("quota-limit-label");
  if (limitLabel) limitLabel.textContent = String(FREE_TIER_MONTHLY_LIMIT);
}

function wireApiKey() {
  $("api-key-save")?.addEventListener("click", () => {
    const value = $("api-key-input")?.value || "";
    setApiKey(value);
    refreshApiKeyUi();
    setStatus($("api-key-status"), getApiKey() ? `保存しました: ${maskApiKey(getApiKey())}` : "削除しました");
  });
  $("api-key-clear")?.addEventListener("click", () => {
    clearApiKey();
    if ($("api-key-input")) $("api-key-input").value = "";
    refreshApiKeyUi();
    setStatus($("api-key-status"), "削除しました");
  });
}

/**
 * @param {FileList|File[]} fileList
 * @returns {File[]}
 */
function filterImageFiles(fileList) {
  return [...fileList].filter((f) => {
    if (f.type && f.type.startsWith("image/")) return true;
    return IMAGE_EXT_RE.test(f.name || "");
  });
}

/**
 * @param {File[]} files
 */
async function processFiles(files) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new ConfigError("先に Vision APIキーを保存してください");
  }
  if (!files.length) {
    setStatus($("load-status"), "画像ファイルが見つかりませんでした", true);
    return;
  }

  const plan = planBatch(files.length);
  if (plan.allowed === 0) {
    throw new QuotaError(
      `今月の無料枠（${plan.status.limit}枚）を使い切っています。GCPのクォータ設定も確認してください。`
    );
  }

  const toProcess = files.slice(0, plan.allowed);
  const skipped = files.length - toProcess.length;
  const statusEl = $("load-status");
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const file = toProcess[i];
    setStatus(statusEl, `OCR中… ${i + 1}/${toProcess.length}: ${file.name}`);
    try {
      const base64 = await imageToBase64(file);
      const { fullText } = await annotateDocumentText({ apiKey, imageBase64: base64 });
      recordUsage(1);
      refreshQuotaUi();

      const parsed = parseReceiptText(fullText, {
        sourceFile: file.name,
        receiptId: `r_${Date.now().toString(36)}_${i}`,
      });
      rows = rows.concat(parsed.items);
      ok += 1;
      renderTable();
    } catch (err) {
      failed += 1;
      console.warn("receipt OCR failed", file.name, err?.code || "", err?.message || err);
    }
  }

  const parts = [`完了: 成功 ${ok}件`];
  if (failed) parts.push(`失敗 ${failed}件`);
  if (skipped) parts.push(`無料枠超過のためスキップ ${skipped}件`);
  setStatus(statusEl, parts.join(" / "), failed > 0 || skipped > 0);
}

function wireDropzone() {
  const dropzone = $("dropzone");
  const input = $("file-input");
  if (!dropzone || !input) return;

  const run = async (fileList) => {
    try {
      await processFiles(filterImageFiles(fileList));
    } catch (err) {
      setStatus($("load-status"), err.message || String(err), true);
    } finally {
      input.value = "";
    }
  };

  input.addEventListener("change", () => {
    if (input.files?.length) run(input.files);
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) run(e.dataTransfer.files);
  });
}

function renderTable() {
  const section = $("ledger-section");
  const container = $("ledger-table-container");
  const countEl = $("ledger-count");
  if (!section || !container || !countEl) return;

  countEl.textContent = String(rows.length);
  section.classList.toggle("hidden", rows.length === 0);
  if (!rows.length) {
    container.innerHTML = "";
    return;
  }

  const thead = `<tr>${COLUMNS.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;
  const body = rows
    .map((row, rowIndex) => {
      const cells = COLUMNS.map((col) => {
        const value = row[col.key] ?? "";
        const inputType = col.type === "number" ? "number" : "text";
        const extraClass = col.type === "number" ? " cell-input num" : " cell-input";
        return `<td data-label="${col.label}"><input class="${extraClass.trim()}" data-row="${rowIndex}" data-key="${col.key}" type="${inputType}" value="${escapeAttr(
          value
        )}" /></td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `<table class="receipt-table"><thead>${thead}</thead><tbody>${body}</tbody></table>`;

  container.querySelectorAll("input[data-row]").forEach((input) => {
    input.addEventListener("change", onCellEdit);
    input.addEventListener("blur", onCellEdit);
  });
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function onCellEdit(event) {
  const input = event.target;
  const rowIndex = Number(input.dataset.row);
  const key = input.dataset.key;
  if (!Number.isInteger(rowIndex) || !rows[rowIndex] || !key) return;

  if (key === "amount") {
    const raw = input.value.trim();
    if (raw === "") {
      rows[rowIndex].amount = null;
    } else {
      const n = Number(raw);
      rows[rowIndex].amount = Number.isFinite(n) ? n : raw;
    }
    return;
  }
  rows[rowIndex][key] = input.value;
}

function wireToolbar() {
  $("export-csv")?.addEventListener("click", () => {
    if (!rows.length) return;
    const csv = buildReceiptCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `receipts-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("clear-rows")?.addEventListener("click", () => {
    if (!rows.length) return;
    if (!window.confirm("表示中の明細をすべてクリアしますか？（APIキーと使用量カウンタは残ります）")) {
      return;
    }
    rows = [];
    renderTable();
    setStatus($("load-status"), "一覧をクリアしました");
  });
}

async function main() {
  wireApiKey();
  wireDropzone();
  wireToolbar();
  refreshApiKeyUi();

  try {
    await requireAuth();
  } catch (err) {
    console.warn("auth gate:", err?.message || err);
  }
}

main();
