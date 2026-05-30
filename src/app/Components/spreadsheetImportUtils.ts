import * as XLSX from "xlsx";

export type SpreadsheetRow = Record<string, unknown>;

export async function readSpreadsheetRows(file: File): Promise<SpreadsheetRow[]> {
  const lowerName = file.name.toLowerCase();
  const isCsv = lowerName.endsWith(".csv") || file.type === "text/csv";

  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string", cellDates: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("No sheet found in selected file.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, {
    defval: "",
    raw: false,
  });

  if (!rows.length) {
    throw new Error("The selected file has no data rows.");
  }

  return rows;
}
