import * as XLSX from "xlsx";
import { fmtDate } from "./utils";
import type { EnrichedRow } from "./store";
import { STATUS_META } from "./utils";
import type { MsgStatus } from "./data";

export const EXPORT_FIELDS = [
  { key: "code", label: "Producer ID" },
  { key: "name", label: "Producer Name" },
  { key: "phone", label: "Phone" },
  { key: "date", label: "Date" },
  { key: "shift", label: "Shift" },
  { key: "milkLtr", label: "Milk Ltr" },
  { key: "fat", label: "FAT" },
  { key: "snf", label: "SNF" },
  { key: "rate", label: "Rate/Ltr" },
  { key: "amount", label: "Milk Amount" },
  { key: "advance", label: "Advance Deduction" },
  { key: "net", label: "Net Payable" },
  { key: "message", label: "Message" },
  { key: "status", label: "WhatsApp Status" },
] as const;

export type ExportFieldKey = (typeof EXPORT_FIELDS)[number]["key"];

function cell(row: EnrichedRow, key: ExportFieldKey, messageFor: (r: EnrichedRow) => string): string | number {
  switch (key) {
    case "code": return row.producer.code;
    case "name": return row.producer.name;
    case "phone": return `+91 ${row.producer.phone}`;
    case "date": return fmtDate(row.date);
    case "shift": return row.shift;
    case "milkLtr": return row.milkLtr;
    case "fat": return row.fat;
    case "snf": return row.snf;
    case "rate": return row.rate;
    case "amount": return row.amount;
    case "advance": return row.advance;
    case "net": return row.net;
    case "message": return messageFor(row);
    case "status": return STATUS_META[(row.msg?.status ?? "pending") as MsgStatus].label;
  }
}

export function exportRowsToXlsx(
  rows: EnrichedRow[],
  fields: ExportFieldKey[],
  fileName: string,
  messageFor: (r: EnrichedRow) => string,
): void {
  const labels = fields.map((f) => EXPORT_FIELDS.find((e) => e.key === f)!.label);
  const aoa: (string | number)[][] = [labels];
  for (const r of rows) aoa.push(fields.map((f) => cell(r, f, messageFor)));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = fields.map((f) => ({ wch: f === "message" ? 48 : f === "name" ? 20 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Milk Collection");
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
