import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename, resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { parseCsvRows } from "../../src/kakeibo/csv.js";
import { parseMoneyForwardCsv } from "../../src/kakeibo/parseMoneyForwardCsv.js";
import { combineTransactions } from "../../src/kakeibo/combineTransactions.js";
import { summarizeByMonthAndPerson, PERSON_ME, PERSON_SPOUSE, PERSON_SHARED } from "../../src/kakeibo/aggregate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--input-dir" || arg === "-i") options.inputDir = rest[++i];
    else if (arg === "--out" || arg === "-o") options.out = rest[++i];
    else if (arg === "--marks" || arg === "-m") options.marksFile = rest[++i];
    else if (arg === "--help" || arg === "-h") options.help = true;
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node tools/kakeibo/cli.js <command> [options]

Commands:
  combine     Read all MoneyForward ME "収入・支出詳細_*.csv" exports in a
              directory, merge them into one deduplicated ledger, and write
              a single UTF-8 CSV with an empty "負担者" column for marking.
  summarize   Read a marked ledger CSV (the output of "combine", with the
              "負担者" column filled in as me/spouse/shared/未設定) and print
              a month x person expense summary as JSON.

Options:
  --input-dir, -i <dir>   Directory containing raw MoneyForward CSV exports
                          (combine only; default: ./data/moneyforward)
  --out, -o <file>        Output CSV path (combine only; default: stdout)
  --marks, -m <file>      Marked ledger CSV path (summarize only, required)
  --help, -h              Show this help

Examples:
  node tools/kakeibo/cli.js combine --input-dir ./data/moneyforward --out ./data/kakeibo-ledger.csv
  node tools/kakeibo/cli.js summarize --marks ./data/kakeibo-ledger.csv
`);
}

function decodeShiftJis(buffer) {
  return new TextDecoder("shift_jis").decode(buffer);
}

function csvEscape(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

const LEDGER_COLUMNS = [
  "id",
  "date",
  "content",
  "amount",
  "institution",
  "majorCategory",
  "minorCategory",
  "memo",
  "isTransfer",
  "isCalcTarget",
  "sourceLabel",
];

const LEDGER_HEADER_JA = [
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
  "負担者", // me / spouse / shared / (blank = unset)
];

function runCombine(options) {
  const inputDir = resolve(options.inputDir || join(__dirname, "../../data/moneyforward"));
  const outPath = options.out ? resolve(options.out) : null;

  const files = readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith(".csv"));
  if (files.length === 0) {
    throw new Error(`No .csv files found in ${inputDir}`);
  }

  const groups = files.map((file) => {
    const buffer = readFileSync(join(inputDir, file));
    const text = decodeShiftJis(buffer);
    return parseMoneyForwardCsv(text, basename(file));
  });

  const { transactions, duplicateCount } = combineTransactions(groups);

  const lines = [LEDGER_HEADER_JA.map(csvEscape).join(",")];
  for (const tx of transactions) {
    const cells = LEDGER_COLUMNS.map((col) => {
      if (col === "isTransfer" || col === "isCalcTarget") {
        return tx[col] ? "1" : "0";
      }
      return tx[col];
    });
    cells.push(""); // 負担者 left blank for manual marking
    lines.push(cells.map(csvEscape).join(","));
  }
  const csvOut = "\uFEFF" + lines.join("\r\n") + "\r\n";

  if (outPath) {
    writeFileSync(outPath, csvOut, "utf8");
  } else {
    process.stdout.write(csvOut);
  }

  const months = [...new Set(transactions.map((t) => t.month))].sort();
  console.error(
    JSON.stringify(
      {
        filesRead: files,
        totalRows: transactions.length,
        duplicateRowsSkipped: duplicateCount,
        months,
        output: outPath || "(stdout)",
      },
      null,
      2
    )
  );
}

function runSummarize(options) {
  if (!options.marksFile) {
    throw new Error("--marks <file> is required for the summarize command");
  }
  const text = readFileSync(resolve(options.marksFile), "utf8");
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const [header, ...body] = rows;

  const idx = (name) => header.indexOf(name);
  const personMap = { 私: PERSON_ME, 妻: PERSON_SPOUSE, 共通: PERSON_SHARED, me: PERSON_ME, spouse: PERSON_SPOUSE, shared: PERSON_SHARED };

  const transactions = body.map((row) => ({
    id: row[idx("ID")],
    month: row[idx("日付")].slice(0, 7),
    amount: Number(row[idx("金額（円）")]),
    isTransfer: row[idx("振替")] === "1",
    isCalcTarget: row[idx("計算対象")] === "1",
  }));

  const marks = {};
  body.forEach((row) => {
    const raw = row[idx("負担者")]?.trim();
    if (raw && personMap[raw]) {
      marks[row[idx("ID")]] = personMap[raw];
    }
  });

  const summary = summarizeByMonthAndPerson(transactions, marks);
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.command) {
    printHelp();
    return;
  }

  if (options.command === "combine") {
    runCombine(options);
  } else if (options.command === "summarize") {
    runSummarize(options);
  } else {
    console.error(`Unknown command: ${options.command}`);
    printHelp();
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.name, message: error.message }, null, 2));
  process.exitCode = 1;
});
