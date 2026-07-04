import { parseMoneyForwardCsv } from "./parseMoneyForwardCsv.js";
import { combineTransactions } from "./combineTransactions.js";
import {
  summarizeByMonthAndPerson,
  isExpenseEligible,
  PERSON_ME,
  PERSON_SPOUSE,
  PERSON_SHARED,
} from "./aggregate.js";

const MARKS_STORAGE_KEY = "kakeibo:marks:v1";

const PERSON_LABELS = {
  [PERSON_ME]: "私",
  [PERSON_SPOUSE]: "妻",
  [PERSON_SHARED]: "共通",
};
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
}

// ---------- CSV loading ----------

async function readFileAsTransactions(file) {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder("shift_jis").decode(buffer);
  return parseMoneyForwardCsv(text, file.name);
}

async function handleFiles(fileList) {
  const statusEl = document.getElementById("load-status");
  statusEl.textContent = "読み込み中...";
  statusEl.classList.remove("error");

  try {
    const files = Array.from(fileList);
    const groups = await Promise.all(files.map(readFileAsTransactions));
    const { transactions, duplicateCount } = combineTransactions(groups);
    state.transactions = transactions;

    const months = [...new Set(transactions.map((t) => t.month))].sort();
    statusEl.textContent = `${files.length}ファイルから${transactions.length}件の明細を読み込みました（対象月: ${months.join(", ")}${
      duplicateCount ? ` / 重複${duplicateCount}件をスキップ` : ""
    }）`;

    document.getElementById("bulk-section").classList.remove("hidden");
    document.getElementById("summary-section").classList.remove("hidden");
    document.getElementById("ledger-section").classList.remove("hidden");

    populateInstitutionOptions();
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

// ---------- bulk mark by institution ----------

function populateInstitutionOptions() {
  const select = document.getElementById("bulk-institution");
  const institutions = [...new Set(state.transactions.map((t) => t.institution))].sort();
  select.innerHTML = institutions.map((i) => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join("");
}

function applyBulkMark() {
  const institution = document.getElementById("bulk-institution").value;
  const person = document.getElementById("bulk-person").value;
  if (!institution || !person) return;

  let applied = 0;
  for (const tx of state.transactions) {
    if (tx.institution === institution && !state.marks[tx.id]) {
      state.marks[tx.id] = person;
      applied++;
    }
  }
  saveMarks();
  renderSummary();
  renderLedger();

  const statusEl = document.getElementById("load-status");
  statusEl.classList.remove("error");
  statusEl.textContent = `「${institution}」の未設定明細 ${applied} 件を「${PERSON_LABELS[person]}」に設定しました。`;
}

// ---------- summary table ----------

function renderSummary() {
  const summary = summarizeByMonthAndPerson(state.transactions, state.marks);
  const container = document.getElementById("summary-table-container");

  if (summary.months.length === 0) {
    container.innerHTML = "<p>データがありません。</p>";
    return;
  }

  const headerCells = ["月", ...PERSON_ORDER.map((p) => PERSON_LABELS[p]), "未設定", "合計"]
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

  container.innerHTML = `
    <table class="summary-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
    <p class="hint">
      振替・計算対象外・収入の明細は集計から除外しています（除外件数: ${summary.excludedCount}件）。「未設定」列はまだマークしていない支出です。
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
    if (person === "unset" && mark) return false;
    if (person && person !== "unset" && mark !== person) return false;
    return true;
  });

  countEl.textContent = String(rowsData.length);

  const rowsHtml = rowsData
    .map((tx) => {
      const mark = state.marks[tx.id] || "";
      const eligible = isExpenseEligible(tx);
      const badges = [
        tx.isTransfer ? '<span class="badge">振替</span>' : "",
        !tx.isCalcTarget ? '<span class="badge">対象外</span>' : "",
        tx.amount > 0 && !tx.isTransfer ? '<span class="badge income">収入</span>' : "",
      ].join("");

      const options = ["", PERSON_ME, PERSON_SPOUSE, PERSON_SHARED]
        .map((p) => `<option value="${p}" ${mark === p ? "selected" : ""}>${p ? PERSON_LABELS[p] : "未設定"}</option>`)
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

async function importMarks(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const incoming = data.marks || data;
  Object.assign(state.marks, incoming);
  saveMarks();
  renderSummary();
  renderLedger();
}

const LEDGER_HEADER = [
  "ID",
  "日付",
  "内容",
  "金額（円）",
  "保有金融機関",
  "大項目",
  "中項目",
  "メモ",
  "振替",
  "計算対象",
  "元ファイル",
  "負担者",
];

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportLedgerCsv() {
  const lines = [LEDGER_HEADER.map(csvEscape).join(",")];
  for (const tx of state.transactions) {
    const mark = state.marks[tx.id];
    const markLabel = mark ? PERSON_LABELS[mark] : "";
    lines.push(
      [
        tx.id,
        tx.date,
        tx.content,
        tx.amount,
        tx.institution,
        tx.majorCategory,
        tx.minorCategory,
        tx.memo,
        tx.isTransfer ? "1" : "0",
        tx.isCalcTarget ? "1" : "0",
        tx.sourceLabel,
        markLabel,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  downloadFile("kakeibo-ledger.csv", "\uFEFF" + lines.join("\r\n") + "\r\n", "text/csv");
}

// ---------- wiring ----------

function init() {
  state.marks = loadMarks();

  document.getElementById("file-input").addEventListener("change", (e) => handleFiles(e.target.files));
  document.getElementById("bulk-apply").addEventListener("click", applyBulkMark);
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
