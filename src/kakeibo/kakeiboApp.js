import { requireAuth } from "./auth.js";
import { parseMoneyForwardCsv } from "./parseMoneyForwardCsv.js";
import { parseCsvRows } from "./csv.js";
import { combineTransactions } from "./combineTransactions.js";
import { isLedgerCsvHeader, buildLedgerCsv, parseLedgerCsv } from "./ledgerCsv.js";
import { applyMemoOverrides } from "./memoOverrides.js";
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
const MEMO_OVERRIDES_STORAGE_KEY = "kakeibo:memoOverrides:v1";
const PERSON_ORDER = [PERSON_ME, PERSON_SPOUSE, PERSON_SHARED];

const yen = (n) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

const state = {
  transactions: /** @type {object[]} */ ([]),
  transactionsById: /** @type {Map<string, object>} */ (new Map()),
  marks: /** @type {Record<string, string>} */ ({}),
  memoOverrides: /** @type {Record<string, string>} */ ({}),
  filters: { month: "", person: "" },
};

// ---------- persistence ----------

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadMarks() {
  return loadJson(MARKS_STORAGE_KEY);
}

function saveMarks() {
  localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(state.marks));
}

function loadMemoOverrides() {
  return loadJson(MEMO_OVERRIDES_STORAGE_KEY);
}

function saveMemoOverrides() {
  localStorage.setItem(MEMO_OVERRIDES_STORAGE_KEY, JSON.stringify(state.memoOverrides));
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

/** Edit a transaction's memo in place and persist it so it survives reloading the same source CSV later. */
function setMemo(id, text) {
  const tx = state.transactionsById.get(id);
  if (tx) tx.memo = text;
  state.memoOverrides[id] = text;
  saveMemoOverrides();
}

// ---------- CSV loading ----------

/**
 * Detect whether a decoded CSV is a raw MoneyForward ME export or this
 * tool's own previously-exported ledger (which also carries marks and
 * memo edits), and parse it accordingly.
 */
function parseAnyCsv(text, sourceLabel) {
  const [header] = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (isLedgerCsvHeader(header)) {
    const { transactions, marks } = parseLedgerCsv(text, sourceLabel);
    return { transactions, marks, isLedger: true };
  }
  return { transactions: parseMoneyForwardCsv(text, sourceLabel), marks: {}, isLedger: false };
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
    state.transactionsById = new Map(transactions.map((tx) => [tx.id, tx]));

    // A fresh set of files is a new dataset; stale filters from a previous
    // load (e.g. a month that no longer exists) would otherwise silently
    // hide rows without the dropdowns reflecting it.
    state.filters = { month: "", person: "" };
    document.getElementById("person-filter").value = "";

    // Marks + memo edits embedded in a previously exported ledger CSV (if
    // any) take precedence over locally cached values, restoring exactly
    // what was exported without needing a separate JSON import.
    let restoredMarkCount = 0;
    let memoOverridesChanged = false;
    for (const { marks, transactions: srcTxs, isLedger } of parsed) {
      for (const [id, person] of Object.entries(marks)) {
        state.marks[id] = person;
        restoredMarkCount++;
      }
      if (isLedger) {
        for (const tx of srcTxs) {
          state.memoOverrides[tx.id] = tx.memo;
          memoOverridesChanged = true;
        }
      }
    }
    if (restoredMarkCount > 0) saveMarks();

    // Apply persisted memo edits on top (covers both a raw MoneyForward
    // reload restoring prior edits, and re-applying a ledger's own memos
    // after combineTransactions/dedupe).
    applyMemoOverrides(transactions, state.memoOverrides);
    if (memoOverridesChanged) saveMemoOverrides();

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
      「未設定」列はまだマークしていない支出です（${summary.unmarked.count}件 / ${yen(summary.unmarked.amount)}）。
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
      // Each badge's origin: 振替/対象外 come straight from MoneyForward's
      // own CSV columns (振替, 計算対象); 収入 is this tool's own judgement
      // from the amount's sign (MoneyForward has no dedicated column for
      // it); 除外 is a mark you set yourself in this tool (負担者=除外).
      const badges = [
        tx.isTransfer ? '<span class="badge" title="MoneyForward Me側の「振替」列（口座間振替）">振替</span>' : "",
        !tx.isCalcTarget
          ? '<span class="badge" title="MoneyForward Me側で「計算対象外」に設定されている明細">対象外</span>'
          : "",
        tx.amount > 0 && !tx.isTransfer
          ? '<span class="badge income" title="金額がプラス（このツールが金額の符号から判定。MoneyForward側に収入専用の列はありません）">収入</span>'
          : "",
        mark === PERSON_EXCLUDED
          ? '<span class="badge" title="このツールで負担者を「除外」に手動設定した明細">除外</span>'
          : "",
      ].join("");

      const options = ["", ...MARK_KEYS]
        .map((p) => `<option value="${p}" ${mark === p ? "selected" : ""}>${p ? PERSON_LABELS_JA[p] : "未設定"}</option>`)
        .join("");

      // data-label mirrors the column header text; the mobile stylesheet
      // uses it (via CSS attr()) to turn each cell into a "label: value"
      // row when the table collapses into a card layout on narrow screens.
      return `
        <tr data-id="${escapeHtml(tx.id)}" class="${eligible ? "" : "excluded-row"}">
          <td data-label="日付">${tx.date}</td>
          <td data-label="内容">${escapeHtml(tx.content)}</td>
          <td class="num ${tx.amount < 0 ? "neg" : "pos"}" data-label="金額">${yen(tx.amount)}</td>
          <td data-label="保有金融機関">${escapeHtml(tx.institution)}</td>
          <td data-label="カテゴリ">${escapeHtml(tx.majorCategory)} / ${escapeHtml(tx.minorCategory)}</td>
          <td data-label="メモ"><input type="text" class="memo-input" value="${escapeHtml(tx.memo || "")}" placeholder="メモ" /></td>
          <td data-label="タグ"><span class="cell-value">${badges || "—"}</span></td>
          <td data-label="負担者"><select class="mark-select">${options}</select></td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>日付</th><th>内容</th><th>金額</th><th>保有金融機関</th><th>カテゴリ</th><th>メモ</th><th>タグ</th><th>負担者</th>
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

  container.querySelectorAll("tr[data-id] .memo-input").forEach((input) => {
    // Keep the in-memory tx.memo in sync on every keystroke (cheap), not
    // just on blur. Several other actions (bulk-mark apply, marking a row
    // while a person filter is active, etc.) call renderLedger() and
    // rebuild the whole table from state.transactions — without this, an
    // in-progress, not-yet-blurred edit in one row would be silently
    // discarded if the user triggers one of those from another row before
    // tabbing away.
    input.addEventListener("input", (e) => {
      const tr = e.target.closest("tr");
      const tx = state.transactionsById.get(tr.dataset.id);
      if (tx) tx.memo = e.target.value;
    });
    // Persisting to localStorage on every keystroke is unnecessary, so
    // that only happens on "change" (fires on blur if the value changed).
    input.addEventListener("change", (e) => {
      const tr = e.target.closest("tr");
      setMemo(tr.dataset.id, e.target.value);
    });
    // "change" only fires on blur; let Enter commit the edit immediately
    // too, since this plain <input> isn't inside a <form>.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.target.blur();
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

/**
 * Accepts either a JSON marks export or this tool's own ledger CSV. A
 * ledger CSV also carries memo edits, which are restored onto the
 * currently loaded transactions (matched by id) in the same step.
 */
async function importMarksAndMemos(file) {
  const statusEl = document.getElementById("load-status");

  try {
    const text = await file.text();
    let incoming;
    let importedMemoCount = 0;

    const [header] = parseCsvRows(text.replace(/^\uFEFF/, ""));
    if (isLedgerCsvHeader(header)) {
      const { marks, transactions: srcTxs } = parseLedgerCsv(text);
      incoming = marks;
      for (const tx of srcTxs) {
        state.memoOverrides[tx.id] = tx.memo;
        importedMemoCount++;
      }
      applyMemoOverrides(state.transactions, state.memoOverrides);
      saveMemoOverrides();
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
    statusEl.textContent = `マークを ${validEntries.length} 件インポートしました${
      importedMemoCount ? ` / メモ ${importedMemoCount} 件も復元しました` : ""
    }。`;
  } catch (err) {
    statusEl.textContent = `マーク・メモのインポートに失敗しました: ${err.message}`;
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

function startApp() {
  state.marks = loadMarks();
  state.memoOverrides = loadMemoOverrides();

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
    if (e.target.files[0]) importMarksAndMemos(e.target.files[0]);
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

document.addEventListener("DOMContentLoaded", () => {
  requireAuth()
    .then(() => startApp())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
    });
});
