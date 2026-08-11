import * as XLSX from "xlsx";

export type SpreadsheetRow = Record<string, unknown>;

const MAX_SPREADSHEET_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_ROWS = 25_000;
const ALLOWED_EXTENSIONS = new Set(["csv", "xls", "xlsx"]);

function cellText(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/^\uFEFF/, "").trim();
}

function isEmptyRow(row: unknown[]) {
  return row.every((value) => cellText(value) === "");
}

function isBrandingRow(row: unknown[]) {
  const values = row.map(cellText).filter(Boolean);
  if (!values.length) return true;
  return values.some((value) => /(?:^|[\\/])(logo(?:\d|-ui)?|title|iso)\.png$/i.test(value) || /^(logo(?:\d|-ui)?|title|iso)\.png$/i.test(value));
}

/** Finds the real header in both normal spreadsheets and branded exports. */
export function findSpreadsheetHeaderRow(rows: unknown[][]) {
  const candidates = rows
    .slice(0, 30)
    .map((row, index) => {
      const values = row.map(cellText);
      const populated = values.filter(Boolean);
      const distinct = new Set(populated.map((value) => value.toLowerCase())).size;
      const textValues = populated.filter((value) => Number.isNaN(Number(value))).length;
      return {
        index,
        score: populated.length * 100 + distinct * 10 + textValues,
        populated: populated.length,
        branded: isBrandingRow(row),
      };
    })
    .filter((candidate) => candidate.populated > 0 && !candidate.branded)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0]?.index ?? -1;
}

function uniqueHeaders(row: unknown[]) {
  const occurrences = new Map<string, number>();
  return row.map((value, index) => {
    const base = cellText(value) || `Column ${index + 1}`;
    const key = base.toLowerCase();
    const count = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function rowsFromSheet(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
    dateNF: "yyyy-mm-dd",
  });
  const meaningfulRows = matrix.filter((row) => Array.isArray(row) && !isEmptyRow(row));
  const headerIndex = findSpreadsheetHeaderRow(meaningfulRows);
  if (headerIndex < 0) return [] as SpreadsheetRow[];

  const headers = uniqueHeaders(meaningfulRows[headerIndex]);
  return meaningfulRows
    .slice(headerIndex + 1)
    .filter((row) => !isBrandingRow(row) && !isEmptyRow(row))
    .map((row) => {
      const record: SpreadsheetRow = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return record;
    });
}

export async function readSpreadsheetRows(file: File): Promise<SpreadsheetRow[]> {
  const lowerName = file.name.toLowerCase();
  const extension = lowerName.includes(".") ? lowerName.split(".").pop() ?? "" : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported file. Choose an Excel (.xlsx/.xls) or CSV (.csv) file.");
  }
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new Error("The selected file is larger than 25 MB. Split it into smaller files and try again.");
  }

  const isCsv = extension === "csv" || file.type === "text/csv";
  const workbook = isCsv
    ? XLSX.read((await file.text()).replace(/^\uFEFF/, ""), { type: "string", cellDates: true, dense: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, dense: true });

  if (!workbook.SheetNames.length) {
    throw new Error("No worksheet was found in the selected file.");
  }

  let rows: SpreadsheetRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    rows = rowsFromSheet(sheet);
    if (rows.length) break;
  }

  if (!rows.length) {
    throw new Error("The selected file has no data rows below its header.");
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`This file contains ${rows.length.toLocaleString()} rows. Import at most ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time.`);
  }

  return rows;
}
