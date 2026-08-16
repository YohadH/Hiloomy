// Shared helper: converts an uploaded File (CSV or Excel) to CSV text.
//
// Callers can then run their existing CSV parser on the returned string
// without caring whether the user uploaded .csv, .xlsx, .xls, or .xlsm.
//
// Only the first sheet is read from Excel workbooks — matches how every
// merchant we've seen exports (single sheet named "Sheet1" or similar).
//
// Excel with multiple sheets is uncommon for the upload flows we support
// (product costs, affiliate conversions, BixGrow, offline sales). If a
// merchant ever needs multi-sheet, we'd add an opt-in `sheetName` param.

import * as XLSX from "xlsx";
import { AppError } from "@/lib/server/errors";

const EXCEL_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".xlsb"];

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (EXCEL_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  const type = (file.type ?? "").toLowerCase();
  return (
    type.includes("spreadsheetml") ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/**
 * Reads the uploaded file and returns CSV text. Excel workbooks are
 * converted via xlsx's sheet_to_csv on the first sheet. CSV files are
 * returned as-is. Throws AppError on unreadable Excel input.
 */
export async function readUploadAsCsv(file: File): Promise<string> {
  if (!isExcelFile(file)) {
    return file.text();
  }

  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!sheet) {
    throw new AppError("The uploaded Excel file does not contain a readable worksheet.", 400);
  }
  return XLSX.utils.sheet_to_csv(sheet);
}
