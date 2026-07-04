import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename, resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { parseMoneyForwardCsv } from "../../src/kakeibo/parseMoneyForwardCsv.js";
import { combineTransactions } from "../../src/kakeibo/combineTransactions.js";
import { summarizeByMonthAndPerson } from "../../src/kakeibo/aggregate.js";
import { buildLedgerCsv, parseLedgerCsv } from "../../src/kakeibo/ledgerCsv.js";

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
  summarize   Read a marked ledger CSV (the output of "combine", or the
              browser app's "全データCSVをダウンロード", with "負担者" filled
              in as 私/妻/共通) and print a month x person expense summary as JSON.

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
  const csvOut = buildLedgerCsv(transactions, {});

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
  const { transactions, marks } = parseLedgerCsv(text);
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
