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
import { isSyncEnabled } from "./supabaseSync.js";
import * as sync from "./supabaseSync.js";

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
  auth: {
    session: /** @type {object | null} */ (null),
    householdId: /** @type {string | null} */ (null),
    syncError: "",
    syncing: false,
  },
};

// ---------- persistence (localStorage + optional Supabase) ----------

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

function saveMarksLocal() {
  localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(state.marks));
}

function loadMemoOverrides() {
  return loadJson(MEMO_OVERRIDES_STORAGE_KEY);
}

function saveMemoOverridesLocal() {
  localStorage.setItem(MEMO_OVERRIDES_STORAGE_KEY, JSON.stringify(state.memoOverrides));
}

function isCloudSyncActive() {
  return isSyncEnabled() && state.auth.session && state.auth.householdId;
}

function setSyncStatus(message, isError = false) {
  state.auth.syncError = isError ? message : "";
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", isError);
}

async function syncLedgerToCloud() {
  if (!isCloudSyncActive()) return;
  state.auth.syncing = true;
  setSyncStatus("クラウドに保存中...");
  try {
    await sync.upsertLedger(state.auth.householdId, state.transactions, state.marks);
    setSyncStatus("クラウドに保存済み");
  } catch (err) {
    setSyncStatus(`クラウド保存エラー: ${err.message}`, true);
    // eslint-disable-next-line no-console
    console.error(err);
  } finally {
    state.auth.syncing = false;
  }
}

async function persistMark(id, person) {
  saveMarksLocal();
  if (!isCloudSyncActive()) return;
  try {
    await sync.updateMark(state.auth.householdId, id, person || null);
    setSyncStatus("クラウドに保存済み");
  } catch (err) {
    setSyncStatus(`マーク保存エラー: ${err.message}`, true);
  }
}

async function persistMemo(id, text) {
  saveMemoOverridesLocal();
  if (!isCloudSyncActive()) return;
  try {
    await sync.updateMemo(state.auth.householdId, id, text);
    setSyncStatus("クラウドに保存済み");
  } catch (err) {
    setSyncStatus(`メモ保存エラー: ${err.message}`, true);
  }
}

function setMark(id, person) {
  if (person) {
    state.marks[id] = person;
  } else {
    delete state.marks[id];
  }
  persistMark(id, person);
  renderSummary();
  if (state.filters.person) {
    renderLedger();
  }
}

function setMemo(id, text) {
  const tx = state.transactionsById.get(id);
  if (tx) tx.memo = text;
  state.memoOverrides[id] = text;
  persistMemo(id, text);
}

function applyTransactionsToState(transactions) {
  state.transactions = transactions;
  state.transactionsById = new Map(transactions.map((tx) => [tx.id, tx]));
  applyMemoOverrides(transactions, state.memoOverrides);
}

function revealDataPanels() {
  document.getElementById("bulk-section").classList.remove("hidden");
  document.getElementById("summary-section").classList.remove("hidden");
  document.getElementById("ledger-section").classList.remove("hidden");
}

function refreshUiAfterDataChange() {
  const months = [...new Set(state.transactions.map((t) => t.month))].sort();
  populateInstitutionOptions();
  populateContentOptions();
  populateMonthFilter(months);
  renderSummary();
  renderLedger();
  revealDataPanels();
}

// ---------- Supabase auth ----------

function updateAuthUi() {
  const panel = document.getElementById("auth-section");
  const loggedOut = document.getElementById("auth-logged-out");
  const loggedIn = document.getElementById("auth-logged-in");
  const emailEl = document.getElementById("auth-email-display");

  if (!isSyncEnabled()) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  const session = state.auth.session;

  if (session) {
    loggedOut.classList.add("hidden");
    loggedIn.classList.remove("hidden");
    emailEl.textContent = session.user.email || "";
  } else {
    loggedOut.classList.remove("hidden");
    loggedIn.classList.add("hidden");
  }
}

async function handleAuthSession(session) {
  state.auth.session = session;
  updateAuthUi();

  if (!session) {
    state.auth.householdId = null;
    return;
  }

  const statusEl = document.getElementById("auth-status");

  try {
    const allowed = await sync.isEmailAllowed(session.user.email || "");
    if (!allowed) {
      await sync.signOut();
      statusEl.textContent =
        "この Google アカウントはログインできません。許可されたメールアドレス（夫・妻）のみ利用できます。";
      statusEl.classList.add("error");
      state.auth.session = null;
      updateAuthUi();
      return;
    }

    statusEl.classList.remove("error");
    statusEl.textContent = "";

    setSyncStatus("クラウドから読み込み中...");
    state.auth.householdId = await sync.getHouseholdId();
    if (!state.auth.householdId) {
      setSyncStatus("household が見つかりません。Supabase のマイグレーション（002）を確認してください。", true);
      return;
    }

    const { transactions, marks } = await sync.fetchLedger(state.auth.householdId);
    if (transactions.length > 0) {
      Object.assign(state.marks, marks);
      for (const tx of transactions) {
        state.memoOverrides[tx.id] = tx.memo;
      }
      saveMarksLocal();
      saveMemoOverridesLocal();
      applyTransactionsToState(transactions);
      refreshUiAfterDataChange();
      setSyncStatus(`${transactions.length} 件をクラウドから読み込みました`);
    } else {
      setSyncStatus("ログイン済み — CSV を読み込むとクラウドに保存されます");
    }
  } catch (err) {
    setSyncStatus(`クラウド読み込みエラー: ${err.message}`, true);
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

async function handleGoogleSignIn() {
  const statusEl = document.getElementById("auth-status");
  statusEl.classList.remove("error");
  statusEl.textContent = "Google ログイン画面へ移動します...";
  try {
    await sync.signInWithGoogle();
  } catch (err) {
    statusEl.textContent = `ログインエラー: ${err.message}`;
    statusEl.classList.add("error");
  }
}

async function handleSignOut() {
  try {
    await sync.signOut();
    setSyncStatus("");
  } catch (err) {
    setSyncStatus(`ログアウトエラー: ${err.message}`, true);
  }
}

function initAuth() {
  if (!isSyncEnabled()) return;

  document.getElementById("auth-google").addEventListener("click", handleGoogleSignIn);
  document.getElementById("auth-signout").addEventListener("click", handleSignOut);

  sync.onAuthStateChange((_event, session) => {
    handleAuthSession(session);
  });

  sync.getSession().then((session) => handleAuthSession(session));
}

// ---------- CSV loading ----------

function parseAnyCsv(text, sourceLabel) {
  const [header] = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (isLedgerCsvHeader(header)) {
    const { transactions, marks } = parseLedgerCsv(text, sourceLabel);
    return { transactions, marks, isLedger: true };
  }
  return { transactions: parseMoneyForwardCsv(text, sourceLabel), marks: {}, isLedger: false };
}

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

    // When logged in, merge new CSV rows with existing cloud/local ledger.
    const existingTxs = state.transactions.length > 0 ? state.transactions : [];
    const allParsedTxs = parsed.flatMap((p) => p.transactions);
    const { transactions, duplicateCount } = combineTransactions([...existingTxs, ...allParsedTxs]);

    applyTransactionsToState(transactions);

    state.filters = { month: "", person: "" };
    document.getElementById("person-filter").value = "";

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
    saveMarksLocal();
    applyMemoOverrides(transactions, state.memoOverrides);
    if (memoOverridesChanged) saveMemoOverridesLocal();

    const months = [...new Set(transactions.map((t) => t.month))].sort();
    statusEl.textContent = `${files.length}ファイルから${transactions.length}件の明細を読み込みました（対象月: ${months.join(", ")}${
      duplicateCount ? ` / 重複${duplicateCount}件をスキップ` : ""
    }${restoredMarkCount ? ` / 以前のマーク${restoredMarkCount}件を復元` : ""}${
      skipped ? ` / CSV以外の${skipped}件を無視` : ""
    }）`;

    refreshUiAfterDataChange();
    await syncLedgerToCloud();
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

function applyBulkMark(field, value, person, overwrite) {
  let applied = 0;
  for (const tx of state.transactions) {
    if (tx[field] !== value) continue;
    if (!overwrite && state.marks[tx.id]) continue;
    state.marks[tx.id] = person;
    applied++;
  }
  saveMarksLocal();
  renderSummary();
  renderLedger();
  syncLedgerToCloud();
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
    input.addEventListener("input", (e) => {
      const tr = e.target.closest("tr");
      const tx = state.transactionsById.get(tr.dataset.id);
      if (tx) tx.memo = e.target.value;
    });
    input.addEventListener("change", (e) => {
      const tr = e.target.closest("tr");
      setMemo(tr.dataset.id, e.target.value);
    });
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
      saveMemoOverridesLocal();
    } else {
      const data = JSON.parse(text);
      incoming = data.marks || data;
    }

    const validEntries = Object.entries(incoming).filter(([, person]) => VALID_MARK_KEYS.has(person));

    Object.assign(state.marks, Object.fromEntries(validEntries));
    saveMarksLocal();
    renderSummary();
    renderLedger();
    await syncLedgerToCloud();

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

  ["dragover", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (e) => e.preventDefault());
  });
}

function updatePrivacyNote() {
  const note = document.getElementById("privacy-note");
  if (isSyncEnabled()) {
    note.textContent =
      "※ Supabase 設定時: ログイン後は家計データがクラウド DB に保存され、端末間で同期されます。未設定時はブラウザ内（localStorage）のみで処理します。いずれも「全データCSV」でバックアップできます。";
  }
}

function init() {
  state.marks = loadMarks();
  state.memoOverrides = loadMemoOverrides();
  updatePrivacyNote();
  initAuth();

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
  document.getElementById("clear-marks").addEventListener("click", async () => {
    if (confirm("すべてのマークを削除します。よろしいですか？")) {
      state.marks = {};
      saveMarksLocal();
      renderSummary();
      renderLedger();
      if (isCloudSyncActive()) {
        try {
          await sync.clearAllMarks(state.auth.householdId);
          setSyncStatus("クラウドのマークを消去しました");
        } catch (err) {
          setSyncStatus(`クラウド消去エラー: ${err.message}`, true);
        }
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
