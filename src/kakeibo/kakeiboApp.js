import { parseMoneyForwardCsv } from "./parseMoneyForwardCsv.js";
import { parseCsvRows } from "./csv.js";
import { combineTransactions } from "./combineTransactions.js";
import { isLedgerCsvHeader, buildLedgerCsv, parseLedgerCsv } from "./ledgerCsv.js";
import {
  summarizeByMonthAndPerson,
  isExpenseEligible,
  PERSON_ME,
  PERSON_SPOUSE,
  PERSON_SHARED,
  PERSON_EXCLUDED,
  PERSON_UNSET,
  MARK_KEYS,
  PERSON_LABELS_JA,
} from "./aggregate.js";

const MARKS_STORAGE_KEY = "kakeibo:marks:v1";
const PERSON_ORDER = [PERSON_ME, PERSON_SPOUSE, PERSON_SHARED];

const yen = (n) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

const state = {
  transactions: /** @type {object[]} */ ([]),
  marks: /** @type {Record<string, string>} */ ({}),
  filters: { month: "", person: "" },
};

// ---------- persistence ----------

function loadMarks() {
  try {
    const raw = localStorage.getItem(MARKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMarks() {
  localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(state.marks));
}

function setMark(id, person) {
  if (person) {
    state.marks[id] = person;
  } else {
    delete state.marks[id];
  }
  saveMarks();
  renderSummary();
  // Re-sync the ledger table with the "負担者で絞り込み" filter (e.g. a row
  // marked while filtered to "未設定" should drop out of that view).
  if (state.filters.person) {
    renderLedger();
  }
}

// ---------- CSV loading ----------

/**
 * Detect whether a decoded CSV is a raw MoneyForward ME export or this
 * tool's own previously-exported ledger (which also carries marks), and
 * parse it accordingly.
 */
function parseAnyCsv(text, sourceLabel) {
  const [header] = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (isLedgerCsvHeader(header)) {
    const { transactions, marks } = parseLedgerCsv(text, sourceLabel);
    return { transactions, marks };
  }
  return { transactions: parseMoneyForwardCsv(text, sourceLabel), marks: {} };
}

/**
 * Raw MoneyForward exports are Shift_JIS; this tool's own ledger CSV export
 * is UTF-8. Try UTF-8 first (strict) and fall back to Shift_JIS, so either
 * file type can be dropped into the same file picker.
 */
function decodeCsvBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

async function readFile(file) {
  const buffer = await file.arrayBuffer();
  const text = decodeCsvBuffer(buffer);
  try {
    return parseAnyCsv(text, file.name);
  } catch (err) {
    throw new Error(`${file.name}: ${err.message}`);
  }
}

const CSV_EXTENSION = /\.csv$/i;

/** Filter a FileList/array down to .csv files, ignoring anything else. */
function filterCsvFiles(fileList) {
  return Array.from(fileList).filter((f) => CSV_EXTENSION.test(f.name));
}

async function handleFiles(fileList) {
  const statusEl = document.getElementById("load-status");
  statusEl.classList.remove("error");

  const files = filterCsvFiles(fileList);
  const skipped = fileList.length - files.length;

  if (files.length === 0) {
    statusEl.textContent = "CSVファイルが見つかりませんでした（.csv拡張子のファイルを選択してください）。";
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = "読み込み中...";

  try {
    const parsed = await Promise.all(files.map(readFile));
    const { transactions, duplicateCount } = combineTransactions(parsed.map((p) => p.transactions));
    state.transactions = transactions;

    // A fresh set of files is a new dataset; stale filters from a previous
    // load (e.g. a month that no longer exists) would otherwise silently
    // hide rows without the dropdowns reflecting it.
    state.filters = { month: "", person: "" };
    document.getElementById("person-filter").value = "";

    // Marks embedded in a previously exported ledger CSV (if any) restore
    // the person assignment without needing a separate JSON import.
    let restoredMarkCount = 0;
    for (const { marks } of parsed) {
      for (const [id, person] of Object.entries(marks)) {
        state.marks[id] = person;
        restoredMarkCount++;
      }
    }
    if (restoredMarkCount > 0) saveMarks();

    const months = [...new Set(transactions.map((t) => t.month))].sort();
    statusEl.textContent = `${files.length}ファイルから${transactions.length}件の明細を読み込みました（対象月: ${months.join(", ")}${
      duplicateCount ? ` / 重複${duplicateCount}件をスキップ` : ""
    }${restoredMarkCount ? ` / 以前のマーク${restoredMarkCount}件を復元` : ""}${
      skipped ? ` / CSV以外の${skipped}件を無視` : ""
    }）`;

    document.getElementById("bulk-section").classList.remove("hidden");
    document.getElementById("summary-section").classList.remove("hidden");
    document.getElementById("ledger-section").classList.remove("hidden");

    populateInstitutionOptions();
    populateContentOptions();
    populateMonthFilter(months);
    renderSummary();
    renderLedger();
  } catch (err) {
    statusEl.textContent = `読み込みエラー: ${err.message}`;
    statusEl.classList.add("error");
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

// ---------- bulk mark helpers ----------

function countBy(transactions, key) {
  const counts = new Map();
  for (const tx of transactions) {
    counts.set(tx[key], (counts.get(tx[key]) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
}

function populateInstitutionOptions() {
  const select = document.getElementById("bulk-institution");
  const entries = countBy(state.transactions, "institution");
  select.innerHTML = entries
    .map(([value, count]) => `<option value="${escapeHtml(value)}">${escapeHtml(value)} (${count}件)</option>`)
    .join("");
}

function populateContentOptions() {
  const select = document.getElementById("bulk-content");
  const entries = countBy(state.transactions, "content");
  select.innerHTML = entries
    .map(([value, count]) => `<option value="${escapeHtml(value)}">${escapeHtml(value)} (${count}件)</option>`)
    .join("");
}

/**
 * Apply `person` to every transaction whose `field` equals `value`.
 * Existing marks are left untouched unless `overwrite` is true.
 */
function applyBulkMark(field, value, person, overwrite) {
  let applied = 0;
  for (const tx of state.transactions) {
    if (tx[field] !== value) continue;
    if (!overwrite && state.marks[tx.id]) continue;
    state.marks[tx.id] = person;
    applied++;
  }
  saveMarks();
  renderSummary();
  renderLedger();
  return applied;
}

function reportBulkResult(label, value, person, applied, overwrite) {
  const statusEl = document.getElementById("load-status");
  statusEl.classList.remove("error");
  const scope = overwrite ? "" : "（未設定のみ）";
  statusEl.textContent = `${label}「${value}」の明細 ${applied} 件を「${PERSON_LABELS_JA[person]}」に設定しました${scope}。`;
}

// ---------- summary table ----------

function renderSummary() {
  const summary = summarizeByMonthAndPerson(state.transactions, state.marks);
  const container = document.getElementById("summary-table-container");

  if (summary.months.length === 0) {
    container.innerHTML = "<p>データがありません。</p>";
    return;
  }

  const headerCells = ["月", ...PERSON_ORDER.map((p) => PERSON_LABELS_JA[p]), "未設定", "合計"]
    .map((h) => `<th>${h}</th>`)
    .join("");

  const rows = summary.months
    .map((month) => {
      const bucket = summary.byMonth[month];
      const unmarked = summary.unmarked.byMonth[month] || 0;
      const total = PERSON_ORDER.reduce((s, p) => s + bucket[p], 0) + unmarked;
      const cells = PERSON_ORDER.map((p) => `<td class="num">${yen(bucket[p])}</td>`).join("");
      return `<tr><td>${month}</td>${cells}<td class="num muted">${yen(unmarked)}</td><td class="num total">${yen(total)}</td></tr>`;
    })
    .join("");

  const grandTotal = PERSON_ORDER.reduce((s, p) => s + summary.totals[p], 0) + summary.unmarked.amount;
  const totalRow = `<tr class="grand-total"><td>合計</td>${PERSON_ORDER.map(
    (p) => `<td class="num">${yen(summary.totals[p])}</td>`
  ).join("")}<td class="num muted">${yen(summary.unmarked.amount)}</td><td class="num total">${yen(grandTotal)}</td></tr>`;

  const manualExcludedHint = summary.excludedByMark.count
    ? `手動で「除外」に設定した明細 ${summary.excludedByMark.count}件（${yen(summary.excludedByMark.amount)}）も集計から除外しています。`
    : "";

  container.innerHTML = `
    <table class="summary-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
    <p class="hint">
      振替・計算対象外・収入の明細は集計から自動的に除外しています（除外件数: ${summary.excludedCount}件）。${manualExcludedHint}
      「未設定」列はまだマークしていない支出です。
    </p>
  `;
}

// ---------- ledger table ----------

function populateMonthFilter(months) {
  const select = document.getElementById("month-filter");
  select.innerHTML =
    '<option value="">すべて</option>' + months.map((m) => `<option value="${m}">${m}</option>`).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderLedger() {
  const { month, person } = state.filters;
  const countEl = document.getElementById("ledger-count");
  const container = document.getElementById("ledger-table-container");

  const rowsData = state.transactions.filter((tx) => {
    if (month && tx.month !== month) return false;
    const mark = state.marks[tx.id] || "";
    if (person === PERSON_UNSET && mark) return false;
    if (person && person !== PERSON_UNSET && mark !== person) return false;
    return true;
  });

  countEl.textContent = String(rowsData.length);

  const rowsHtml = rowsData
    .map((tx) => {
      const mark = state.marks[tx.id] || "";
      const eligible = isExpenseEligible(tx) && mark !== PERSON_EXCLUDED;
      const badges = [
        tx.isTransfer ? '<span class="badge">振替</span>' : "",
        !tx.isCalcTarget ? '<span class="badge">対象外</span>' : "",
        tx.amount > 0 && !tx.isTransfer ? '<span class="badge income">収入</span>' : "",
        mark === PERSON_EXCLUDED ? '<span class="badge">除外</span>' : "",
      ].join("");

      const options = ["", ...MARK_KEYS]
        .map((p) => `<option value="${p}" ${mark === p ? "selected" : ""}>${p ? PERSON_LABELS_JA[p] : "未設定"}</option>`)
        .join("");

      return `
        <tr data-id="${escapeHtml(tx.id)}" class="${eligible ? "" : "excluded-row"}">
          <td>${tx.date}</td>
          <td>${escapeHtml(tx.content)}</td>
          <td class="num ${tx.amount < 0 ? "neg" : "pos"}">${yen(tx.amount)}</td>
          <td>${escapeHtml(tx.institution)}</td>
          <td>${escapeHtml(tx.majorCategory)} / ${escapeHtml(tx.minorCategory)}</td>
          <td>${badges}</td>
          <td><select class="mark-select">${options}</select></td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>日付</th><th>内容</th><th>金額</th><th>保有金融機関</th><th>カテゴリ</th><th></th><th>負担者</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  container.querySelectorAll("tr[data-id] .mark-select").forEach((select) => {
    select.addEventListener("change", (e) => {
      const tr = e.target.closest("tr");
      setMark(tr.dataset.id, e.target.value);
    });
  });
}

// ---------- export / import ----------

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMarks() {
  downloadFile(
    `kakeibo-marks-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ version: 1, marks: state.marks }, null, 2),
    "application/json"
  );
}

const VALID_MARK_KEYS = new Set(MARK_KEYS);

/** Accepts either a JSON marks export or a ledger CSV (from this tool's own CSV export). */
async function importMarks(file) {
  const statusEl = document.getElementById("load-status");

  try {
    const text = await file.text();
    let incoming;

    const [header] = parseCsvRows(text.replace(/^\uFEFF/, ""));
    if (isLedgerCsvHeader(header)) {
      ({ marks: incoming } = parseLedgerCsv(text));
    } else {
      const data = JSON.parse(text);
      incoming = data.marks || data;
    }

    // Guard against malformed/unrelated JSON silently polluting state with
    // junk keys — only accept known mark values.
    const validEntries = Object.entries(incoming).filter(([, person]) => VALID_MARK_KEYS.has(person));

    Object.assign(state.marks, Object.fromEntries(validEntries));
    saveMarks();
    renderSummary();
    renderLedger();

    statusEl.classList.remove("error");
    statusEl.textContent = `マークを ${validEntries.length} 件インポートしました。`;
  } catch (err) {
    statusEl.textContent = `マークのインポートに失敗しました: ${err.message}`;
    statusEl.classList.add("error");
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

function exportLedgerCsv() {
  downloadFile("kakeibo-ledger.csv", buildLedgerCsv(state.transactions, state.marks), "text/csv");
}

// ---------- wiring ----------

function initDropzone() {
  const dropzone = document.getElementById("dropzone");
  // The dropzone is a <label for="file-input">, so clicking it already
  // opens the native file picker natively — no JS forwarding needed here.

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // Prevent the browser from navigating to/opening the file if a drop
  // lands outside the dropzone (the default behavior for the whole page).
  ["dragover", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (e) => e.preventDefault());
  });
}

function init() {
  state.marks = loadMarks();

  initDropzone();
  document.getElementById("file-input").addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
    e.target.value = "";
  });

  document.getElementById("bulk-apply").addEventListener("click", () => {
    const value = document.getElementById("bulk-institution").value;
    const person = document.getElementById("bulk-person").value;
    const overwrite = document.getElementById("bulk-overwrite").checked;
    if (!value || !person) return;
    const applied = applyBulkMark("institution", value, person, overwrite);
    reportBulkResult("保有金融機関", value, person, applied, overwrite);
  });

  document.getElementById("bulk-content-apply").addEventListener("click", () => {
    const value = document.getElementById("bulk-content").value;
    const person = document.getElementById("bulk-content-person").value;
    const overwrite = document.getElementById("bulk-content-overwrite").checked;
    if (!value || !person) return;
    const applied = applyBulkMark("content", value, person, overwrite);
    reportBulkResult("内容", value, person, applied, overwrite);
  });

  document.getElementById("month-filter").addEventListener("change", (e) => {
    state.filters.month = e.target.value;
    renderLedger();
  });
  document.getElementById("person-filter").addEventListener("change", (e) => {
    state.filters.person = e.target.value;
    renderLedger();
  });
  document.getElementById("export-marks").addEventListener("click", exportMarks);
  document.getElementById("import-marks").addEventListener("change", (e) => {
    if (e.target.files[0]) importMarks(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("export-ledger-csv").addEventListener("click", exportLedgerCsv);
  document.getElementById("clear-marks").addEventListener("click", () => {
    if (confirm("すべてのマークを削除します。よろしいですか？")) {
      state.marks = {};
      saveMarks();
      renderSummary();
      renderLedger();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
