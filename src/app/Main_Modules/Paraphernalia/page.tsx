"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Download, FileText, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import SpreadsheetImportModal from "@/app/Components/SpreadsheetImportModal";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import { addBrandedPdfHeader, buildBrandedAoa, buildBrandedWorkbookBuffer } from "../Components/exportBranding";
import * as XLSX from "xlsx";

type InventoryKind = "SEC" | "OFFICE";
type EntryKind = "stockIn" | "stockOut";
type EntryMode = "create" | "edit";
type ViewAllKind = EntryKind | "secInventory" | "officeInventory";
type ViewAllState = { kind: ViewAllKind; detachment?: string } | null;

type ContractOption = {
  contract_id: string;
  client_name: string | null;
  specific_area: string | null;
  status: string | null;
};

type StockInRow = {
  id: string;
  timestamp: string | null;
  date: string | null;
  status: string | null;
  item: string | null;
  control_number: string | null;
  quantity: number | null;
  attachment: string | null;
  detachment: string | null;
  contract_id: string | null;
  client_name: string | null;
};

type StockOutRow = {
  id: string;
  timestamp: string | null;
  date: string | null;
  names: string | null;
  item: string | null;
  control_number: string | null;
  quantity: number | null;
  price: number | null;
  status: string | null;
  date_posted: string | null;
  contract_id: string | null;
  client_name: string | null;
  specific_area: string | null;
};

type ItemOption = {
  item_id: string | null;
  item_name: string;
  item_category: InventoryKind;
  display_order: number | null;
};

type InventorySummaryRow = {
  id: string;
  clientName: string;
  specificArea: string;
  item: string;
  category: InventoryKind;
  stockIn: number;
  stockOut: number;
  stockBalance: number;
};

type StockInLineForm = {
  key: string;
  item: string;
  controlNumber: string;
  quantity: string;
};

type StockOutLineForm = {
  key: string;
  item: string;
  controlNumber: string;
  quantity: string;
  price: string;
};

type StockInForm = {
  date: string;
  status: string;
  items: StockInLineForm[];
  attachment: string;
  detachment: string;
  clientName: string;
};

type StockOutForm = {
  date: string;
  names: string;
  items: StockOutLineForm[];
  status: string;
  datePosted: string;
  detachment: string;
  clientName: string;
};

type EntryModalState =
  | { kind: "stockIn"; mode: EntryMode; row?: StockInRow }
  | { kind: "stockOut"; mode: EntryMode; row?: StockOutRow }
  | null;

type DeleteState =
  | { kind: "stockIn"; id: string; label: string }
  | { kind: "stockOut"; id: string; label: string }
  | null;

type ColumnDef<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

function makeLineKey() {
  return Math.random().toString(36).slice(2);
}

function newStockInLine(): StockInLineForm {
  return { key: makeLineKey(), item: "", controlNumber: "", quantity: "" };
}

function newStockOutLine(): StockOutLineForm {
  return { key: makeLineKey(), item: "", controlNumber: "", quantity: "", price: "" };
}

const STOCK_IN_STATUSES = ["RE-STOCKED", "PENDING", "CANCELLED"] as const;
const STOCK_OUT_STATUSES = ["FREE", "POSTED", "PAID"] as const;

const EMPTY_STOCK_IN_FORM: StockInForm = {
  date: "",
  status: "RE-STOCKED",
  items: [],
  attachment: "",
  detachment: "",
  clientName: "",
};

const EMPTY_STOCK_OUT_FORM: StockOutForm = {
  date: "",
  names: "",
  items: [],
  status: "FREE",
  datePosted: "",
  detachment: "",
  clientName: "",
};

const ITEM_CATALOG: Array<{ no: number; group: string; item: string; category: InventoryKind }> = [
  { no: 1, group: "Communication", item: "CIGNUS", category: "SEC" },
  { no: 2, group: "Communication", item: "KENWOOD", category: "SEC" },
  { no: 4, group: "Communication", item: "MOTOROLA", category: "SEC" },
  { no: 5, group: "Communication", item: "VERSA", category: "SEC" },
  { no: 6, group: "Communication", item: "IQONIC", category: "SEC" },
  { no: 7, group: "Communication", item: "PHONE", category: "SEC" },
  { no: 8, group: "Communication", item: "SATELLITE PHONE", category: "SEC" },
  { no: 9, group: "Communication", item: "MEGAPHONE", category: "SEC" },
  { no: 10, group: "Security / Safety", item: "BINOCULAR", category: "SEC" },
  { no: 12, group: "Security / Safety", item: "BODYCAMERA", category: "SEC" },
  { no: 13, group: "Security / Safety", item: "BULLET PROOF VEST", category: "SEC" },
  { no: 14, group: "Security / Safety", item: "DRONE", category: "SEC" },
  { no: 15, group: "Security / Safety", item: "FIRE EXTINGUISHER", category: "SEC" },
  { no: 16, group: "Security / Safety", item: "GUARD TOUR SYSTEM", category: "SEC" },
  { no: 17, group: "Security / Safety", item: "HAND TALLY COUNTER", category: "SEC" },
  { no: 18, group: "Security / Safety", item: "INDUSTRIAL MASK", category: "SEC" },
  { no: 19, group: "Security / Safety", item: "LIFE RING", category: "SEC" },
  { no: 20, group: "Security / Safety", item: "LIFE VEST", category: "SEC" },
  { no: 21, group: "Security / Safety", item: "METAL DETECTOR", category: "SEC" },
  { no: 22, group: "Security / Safety", item: "NIGHT STICK", category: "SEC" },
  { no: 23, group: "Security / Safety", item: "SEARCH LIGHT", category: "SEC" },
  { no: 24, group: "Security / Safety", item: "SIGNAGE", category: "SEC" },
  { no: 25, group: "Security / Safety", item: "SPEED RADAR", category: "SEC" },
  { no: 26, group: "Security / Safety", item: "TRAFFIC CONE", category: "SEC" },
  { no: 27, group: "Security / Safety", item: "WALK THROUGH", category: "SEC" },
  { no: 28, group: "Security / Safety", item: "HARD HAT", category: "SEC" },
  { no: 29, group: "Tactical", item: "FLARE GUN", category: "SEC" },
  { no: 30, group: "Tactical", item: "PISTOL", category: "SEC" },
  { no: 31, group: "Tactical", item: "SHOTGUN", category: "SEC" },
  { no: 32, group: "Tactical", item: "TASER GUN", category: "SEC" },
  { no: 33, group: "Tactical", item: "EXTRA MAGAZINE 9MM", category: "SEC" },
  { no: 34, group: "Transportation / Mobility", item: "BIKE", category: "SEC" },
  { no: 35, group: "Transportation / Mobility", item: "MOBILE", category: "SEC" },
  { no: 36, group: "Transportation / Mobility", item: "MOTORCYCLE", category: "SEC" },
  { no: 37, group: "Transportation / Mobility", item: "SEABOURNE", category: "SEC" },
  { no: 38, group: "Emergency / Medical", item: "BP APPRATUS", category: "SEC" },
  { no: 39, group: "Emergency / Medical", item: "C-COLLAR", category: "SEC" },
  { no: 40, group: "Emergency / Medical", item: "CPR DUMMY", category: "SEC" },
  { no: 41, group: "Emergency / Medical", item: "FIRST AID CABINET", category: "SEC" },
  { no: 42, group: "Emergency / Medical", item: "FIRST AID KIT", category: "SEC" },
  { no: 43, group: "Emergency / Medical", item: "OXYGEN TANK", category: "SEC" },
  { no: 44, group: "Emergency / Medical", item: "SPINEBOARD", category: "SEC" },
  { no: 45, group: "Emergency / Medical", item: "STRETCHER", category: "SEC" },
  { no: 46, group: "Emergency / Medical", item: "WHEEL CHAIR", category: "SEC" },
  { no: 47, group: "Office Equipment", item: "AIRCON", category: "OFFICE" },
  { no: 48, group: "Office Equipment", item: "BIOMETRIC", category: "OFFICE" },
  { no: 49, group: "Office Equipment", item: "BUILT-IN-MONITOR", category: "OFFICE" },
  { no: 50, group: "Office Equipment", item: "BUNDYCLOCK", category: "OFFICE" },
  { no: 51, group: "Office Equipment", item: "DISCHARGE TUBE/BOX", category: "OFFICE" },
  { no: 52, group: "Office Equipment", item: "ELECTRICFAN", category: "OFFICE" },
  { no: 53, group: "Office Equipment", item: "INDUSTRIAL FAN", category: "OFFICE" },
  { no: 54, group: "Office Equipment", item: "LIFTING BELT", category: "OFFICE" },
  { no: 55, group: "Office Equipment", item: "MONITOR", category: "OFFICE" },
  { no: 56, group: "Office Equipment", item: "OFFICE TABLE", category: "OFFICE" },
  { no: 57, group: "Office Equipment", item: "PODIUM TABLE", category: "OFFICE" },
  { no: 58, group: "Office Equipment", item: "PRINTER", category: "OFFICE" },
  { no: 59, group: "Office Equipment", item: "PROJECTOR", category: "OFFICE" },
  { no: 60, group: "Office Equipment", item: "SAFETY VAULT", category: "OFFICE" },
  { no: 61, group: "Office Equipment", item: "STEEL CABINET", category: "OFFICE" },
  { no: 62, group: "Office Equipment", item: "STEEL LOCKER", category: "OFFICE" },
  { no: 63, group: "Office Equipment", item: "SYTEM UNIT", category: "OFFICE" },
  { no: 64, group: "Office Equipment", item: "LAPTOP", category: "OFFICE" },
  { no: 65, group: "Office Equipment", item: "CIGNUS CHARGER", category: "OFFICE" },
  { no: 66, group: "Office Equipment", item: "VERSA CHARGER", category: "OFFICE" },
  { no: 67, group: "Office Equipment", item: "SPARE BATTERY", category: "OFFICE" },
  { no: 68, group: "Office Equipment", item: "OFFICE CHAIR", category: "OFFICE" },
  { no: 69, group: "Office Equipment", item: "DOUBLE DECK", category: "OFFICE" },
  { no: 70, group: "Office Equipment", item: "XEROX MACHINE", category: "OFFICE" },
];

const inputClass = "w-full rounded-xl border px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-[#FFDA03]";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1";
const DETACHMENT_TABLE_STORAGE_KEY = "paraphernalia:manual-detachment-tables";
const PARAPHERNALIA_BUCKET = "paraphernalia";
const CONTROL_NUMBER_PREFIXES: Record<string, string> = {
  AIRCON: "AC",
  BIKE: "BK",
  "BODY SCANNER": "BS",
  BODYCAMERA: "BC",
  "BP APPRATUS": "BP",
  BUNDYCLOCK: "BDC",
  "C-COLLAR": "CC",
  CIGNUS: "CIG",
  "CPR DUMMY": "CPR",
  DRONE: "DR",
  ELECTRICFAN: "EF",
  "FIRST AID KIT": "FK",
  "HAND TALLY COUNTER": "HTC",
  KENWOOD: "KEN",
  "LIFE VEST": "LJ",
  "LIFE JACKET": "LJ",
  MEGAPHONE: "MP",
  "METAL DETECTOR": "MD",
  MOBILE: "MV",
  MONITOR: "MON",
  "OFFICE CHAIR": "OC",
  "OXYGEN TANK": "OX",
  PHONE: "CP",
  PISTOL: "PIS",
  "PODIUM TABLE": "PT",
  PRINTER: "PRN",
  "DISCHARGE TUBE/BOX": "DTB",
  "SAND BOX": "SBX",
  SEABOURNE: "SB",
  SHOTGUN: "SG",
  SHREDDER: "SHR",
  SPINEBOARD: "SPB",
  "STEEL CABINET": "SC",
  "TASER GUN": "TG",
  STUNGUN: "SG",
  "SYTEM UNIT": "SU",
  VERSA: "VER",
  "WHEEL CHAIR": "WC",
  "WIFI DONGLE": "WD",
  "XEROX MACHINE": "XM",
  MOTORCYCLE: "MC",
  "BUILT-IN-MONITOR": "BIM",
  BIOMETRIC: "BIO",
  "BULLET PROOF VEST": "BPV",
  "ALCOHOL TESTER": "AT",
  "TRAFFIC CONE": "TC",
  BINOCULAR: "BI",
  SIGNAGE: "SGN",
  "SPEED RADAR": "SRG",
  "LIFE RING": "LR",
  "INDUSTRIAL MASK": "IM",
  "UNDER CHASSIS MIRROR": "UCM",
  "NIGHT STICK": "NS",
  "SOLAR TRAFFIC CONE": "STC",
  "STEEL LOCKER": "SL",
  "OFFICE TABLE": "OT",
  "FIRST AID CABINET": "FAC",
  "GUARD TOUR SYSTEM": "GTS",
  "WALK THROUGH": "WT",
  "SATELLITE PHONE": "SP",
  PROJECTOR: "PJT",
  "INDUSTRIAL FAN": "IF",
  "QR SCANNER": "QR",
  "SEARCH LIGHT": "LS",
  "FLARE GUN": "FG",
  "SAFETY VAULT": "SV",
  "FIRE EXTINGUISHER": "FX",
  "LIFTING BELT": "LB",
  MOTOROLA: "M",
  LAPTOP: "LT",
  "SPARE BATTERY": "BAT",
  "RADIO CHARGER": "RC",
  "CIGNUS CHARGER": "CCH",
  "VERSA CHARGER": "VCH",
  "EXTRA MAGAZINE 9MM": "EM",
  STRETCHER: "ST",
  IQONIC: "IQ",
  "HARD HAT": "HH",
  "KEYBOARD & MOUSE": "KBM",
  DASHCAM: "DC",
  "WIFI MODEM": "WM",
  "DOUBLE DECK": "DD",
};

function safeText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeDetachmentName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function mergeDetachmentTableNames(...sources: Array<Iterable<unknown> | null | undefined>) {
  const map = new Map<string, string>();

  for (const source of sources) {
    if (!source) continue;
    for (const value of source) {
      const text = normalizeDetachmentName(value);
      const key = normalizeKey(text);
      if (key && !map.has(key)) map.set(key, text);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

function readStoredDetachmentTables() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DETACHMENT_TABLE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? mergeDetachmentTableNames(parsed) : [];
  } catch {
    return [];
  }
}

function writeStoredDetachmentTables(values: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DETACHMENT_TABLE_STORAGE_KEY, JSON.stringify(mergeDetachmentTableNames(values)));
  } catch {
  }
}

function normalizeItem(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeControlNumber(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function controlPrefixForItem(itemName: unknown) {
  const normalized = normalizeItem(itemName);
  if (CONTROL_NUMBER_PREFIXES[normalized]) return CONTROL_NUMBER_PREFIXES[normalized];
  const words = normalized.match(/[A-Z0-9]+/g) ?? [];
  const fallback = words.length > 1 ? words.map((word) => word[0]).join("") : normalized.slice(0, 3);
  return fallback || "ITEM";
}

function formatControlNumber(itemName: unknown, sequence: number, year = new Date().getFullYear()) {
  return `${controlPrefixForItem(itemName)}-${year}-${String(Math.max(1, sequence)).padStart(4, "0")}`;
}

function parseControlSequence(value: unknown) {
  const match = normalizeControlNumber(value).match(/-(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function pickByAliases(row: Record<string, unknown>, aliases: string[]) {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    map.set(normalizeKey(key).replace(/[^a-z0-9]+/g, ""), value);
  }
  for (const alias of aliases) {
    const value = map.get(normalizeKey(alias).replace(/[^a-z0-9]+/g, ""));
    if (value !== undefined && String(value ?? "").trim() !== "") return String(value);
  }
  return "";
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim().replace(/,/g, "");
  if (!raw) return null;
  const next = Number(raw);
  return Number.isFinite(next) ? next : null;
}

function formatNumber(value: unknown) {
  const numeric = toNumberOrNull(value);
  if (numeric == null) return "-";
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMoney(value: unknown) {
  const numeric = toNumberOrNull(value);
  if (numeric == null) return "-";
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleString();
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function defaultItemCategory(itemName: unknown): InventoryKind {
  const key = normalizeItem(itemName);
  return ITEM_CATALOG.find((item) => normalizeItem(item.item) === key)?.category ?? "SEC";
}

function formatStockInStatus(value: unknown) {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "RECEIVED") return "RE-STOCKED";
  return safeText(status || value);
}

function makeAttachmentLabel(value: string | null) {
  const text = safeText(value);
  if (text === "-") return text;
  try {
    const url = new URL(text);
    return url.pathname.split("/").filter(Boolean).pop() || text;
  } catch {
    return text;
  }
}

function ModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-5xl",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-hidden rounded-3xl border border-[#e8dfc8] bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b bg-[#fff9e6] px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-black">{title}</div>
            {subtitle ? <div className="mt-1 text-sm text-gray-600">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border bg-white px-4 py-2 text-sm text-black hover:bg-gray-50">
            Close
          </button>
        </div>
        <div className="max-h-[78vh] overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function DataTable<T>({
  storageKey,
  columns,
  rows,
  rowKey,
  loading,
  emptyLabel,
  actions,
  previewLimit,
  onViewAll,
}: {
  storageKey: string;
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading: boolean;
  emptyLabel: string;
  actions?: (row: T) => ReactNode;
  previewLimit?: number;
  onViewAll?: () => void;
}) {
  const displayRows = previewLimit && rows.length > previewLimit ? rows.slice(0, previewLimit) : rows;
  return (
    <TableZoomWrapper storageKey={storageKey}>
      <div className={`overflow-auto rounded-2xl border bg-white shadow-sm ${previewLimit ? "max-h-[260px]" : ""}`}>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#FFDA03] text-black">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 font-semibold ${column.className ?? ""}`}>
                  {column.header}
                </th>
              ))}
              {actions ? <th className="px-4 py-3 text-right font-semibold">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8">
                  <LoadingCircle label="Loading paraphernalia records..." />
                </td>
              </tr>
            ) : displayRows.length ? (
              displayRows.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-[#fff8da]">
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-3 align-top text-gray-800 ${column.className ?? ""}`}>
                      {column.render(row)}
                    </td>
                  ))}
                  {actions ? <td className="px-4 py-3 text-right align-top">{actions(row)}</td> : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {onViewAll && rows.length > (previewLimit ?? 0) ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onViewAll}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
          >
            View full table ({rows.length})
          </button>
        </div>
      ) : null}
    </TableZoomWrapper>
  );
}

export default function ParaphernaliaPage() {
  const { role } = useAuthRole();
  const { allowedColumns, restricted } = useMyColumnAccess("paraphernalia");
  const isAdmin = role === "admin" || role === "superadmin";
  const canViewPermission = (columnKey: string) => !restricted || allowedColumns.has(columnKey);
  const canExport = isAdmin && canViewPermission("export_file");
  const canImport = isAdmin && canViewPermission("import_file");
  const canDownloadTemplate = isAdmin && canViewPermission("export_template");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [schemaWarning, setSchemaWarning] = useState("");
  const [search, setSearch] = useState("");

  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [stockInRows, setStockInRows] = useState<StockInRow[]>([]);
  const [stockOutRows, setStockOutRows] = useState<StockOutRow[]>([]);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [selectedDetachment, setSelectedDetachment] = useState("ALL");
  const [manualDetachmentTables, setManualDetachmentTables] = useState<string[]>([]);
  const [newDetachmentTable, setNewDetachmentTable] = useState("");
  const [itemManagerOpen, setItemManagerOpen] = useState(false);
  const [itemBusy, setItemBusy] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<InventoryKind>("SEC");

  const [entryModal, setEntryModal] = useState<EntryModalState>(null);
  const [stockInForm, setStockInForm] = useState<StockInForm>(EMPTY_STOCK_IN_FORM);
  const [stockOutForm, setStockOutForm] = useState<StockOutForm>(EMPTY_STOCK_OUT_FORM);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [viewAllState, setViewAllState] = useState<ViewAllState>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
  const [importSummaryOpen, setImportSummaryOpen] = useState(false);

  const contractById = useMemo(() => {
    return new Map(contracts.map((contract) => [contract.contract_id, contract]));
  }, [contracts]);

  const contractByArea = useMemo(() => {
    const map = new Map<string, ContractOption>();
    for (const contract of contracts) {
      const areaKey = normalizeKey(contract.specific_area);
      if (areaKey && !map.has(areaKey)) map.set(areaKey, contract);
    }
    return map;
  }, [contracts]);

  const contractOptions = useMemo(() => {
    const seen = new Set<string>();
    return contracts
      .filter((contract) => safeText(contract.specific_area, "") !== "")
      .filter((contract) => {
        const key = normalizeKey(contract.specific_area);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice()
      .sort((a, b) => safeText(a.specific_area).localeCompare(safeText(b.specific_area)));
  }, [contracts]);

  const displayItemOptions = useMemo<ItemOption[]>(() => {
    const fromDb = itemOptions.filter((item) => safeText(item.item_name, "") !== "");
    if (fromDb.length) {
      return fromDb.slice().sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.item_name.localeCompare(b.item_name));
    }

    return ITEM_CATALOG.map((item) => ({
      item_id: null,
      item_name: item.item,
      item_category: item.category,
      display_order: item.no,
    }));
  }, [itemOptions]);

  const itemCategoryByName = useMemo(() => {
    const map = new Map<string, InventoryKind>();
    for (const item of displayItemOptions) {
      map.set(normalizeItem(item.item_name), item.item_category);
    }
    return map;
  }, [displayItemOptions]);

  function resolveItemCategory(itemName: unknown): InventoryKind {
    return itemCategoryByName.get(normalizeItem(itemName)) ?? defaultItemCategory(itemName);
  }

  const detachmentOptions = useMemo(() => {
    const map = new Map<string, string>();

    function add(value: unknown) {
      const text = safeText(value, "");
      const key = normalizeKey(text);
      if (key && !map.has(key)) map.set(key, text);
    }

    for (const contract of contractOptions) add(contract.specific_area);
    for (const row of stockInRows) add(resolveSpecificArea(row.contract_id, row.detachment));
    for (const row of stockOutRows) add(resolveSpecificArea(row.contract_id, row.specific_area));
    for (const value of manualDetachmentTables) add(value);

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [contractOptions, stockInRows, stockOutRows, manualDetachmentTables, contractById, contractByArea]);

  useEffect(() => {
    const storedTables = readStoredDetachmentTables();
    if (storedTables.length) {
      setManualDetachmentTables((prev) => mergeDetachmentTableNames(prev, storedTables));
    }
  }, []);

  useEffect(() => {
    writeStoredDetachmentTables(manualDetachmentTables);
  }, [manualDetachmentTables]);

  function resolveClientName(contractId: string | null | undefined, area: string | null | undefined, fallback: string | null | undefined) {
    const fromId = contractId ? contractById.get(contractId) : null;
    const fromArea = area ? contractByArea.get(normalizeKey(area)) : null;
    return safeText(fallback, "") || safeText(fromId?.client_name, "") || safeText(fromArea?.client_name, "") || "Unassigned Client";
  }

  function resolveSpecificArea(contractId: string | null | undefined, area: string | null | undefined) {
    const fromId = contractId ? contractById.get(contractId) : null;
    const fromArea = area ? contractByArea.get(normalizeKey(area)) : null;
    return safeText(area, "") || safeText(fromId?.specific_area, "") || safeText(fromArea?.specific_area, "") || "Unassigned Detachment";
  }

  function clientNameForDetachment(detachment: string) {
    return safeText(contractByArea.get(normalizeKey(detachment))?.client_name, "");
  }

  function nextControlNumber(itemName: string, offset = 0) {
    const year = new Date().getFullYear();
    const prefix = controlPrefixForItem(itemName);
    const prefixKey = `${prefix}-${year}-`;
    const existingNumbers = [...stockInRows, ...stockOutRows]
      .map((row) => normalizeControlNumber(row.control_number))
      .filter((value) => value.startsWith(prefixKey));
    const maxSequence = existingNumbers.reduce((max, value) => Math.max(max, parseControlSequence(value)), 0);
    return formatControlNumber(itemName, maxSequence + offset + 1, year);
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    setSchemaWarning("");

    try {
      const contractsRes = await supabase
        .from("contracts")
        .select("contract_id, client_name, specific_area, status")
        .order("client_name", { ascending: true })
        .limit(5000);

      if (contractsRes.error) throw contractsRes.error;

      const nextContracts = ((contractsRes.data ?? []) as Record<string, unknown>[])
        .map((row) => ({
          contract_id: String(row.contract_id ?? ""),
          client_name: row.client_name == null ? null : String(row.client_name),
          specific_area: row.specific_area == null ? null : String(row.specific_area),
          status: row.status == null ? null : String(row.status),
        }))
        .filter((row) => row.contract_id);

      setContracts(nextContracts);

      const itemsWide = await supabase
        .from("paraphernalia_items")
        .select("item_id, item_name, item_category, display_order, is_active")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("item_name", { ascending: true });

      if (itemsWide.error) {
        const itemsFallback = await supabase
          .from("paraphernalia_items")
          .select("item_id, item_name")
          .order("item_name", { ascending: true });

        if (itemsFallback.error) {
          setItemOptions([]);
          setSchemaWarning("Run SQL/supabase_paraphernalia_stock_in_out.sql so dropdown items can be added and removed.");
        } else {
          setItemOptions(
            ((itemsFallback.data ?? []) as Record<string, unknown>[])
              .map((row) => ({
                item_id: row.item_id == null ? null : String(row.item_id),
                item_name: normalizeItem(row.item_name),
                item_category: defaultItemCategory(row.item_name),
                display_order: null,
              }))
              .filter((row) => row.item_name)
          );
        }
      } else {
        setItemOptions(
          ((itemsWide.data ?? []) as Record<string, unknown>[])
            .map((row) => ({
              item_id: row.item_id == null ? null : String(row.item_id),
              item_name: normalizeItem(row.item_name),
              item_category: (String(row.item_category ?? "").trim().toUpperCase() === "OFFICE" ? "OFFICE" : "SEC") as InventoryKind,
              display_order: toNumberOrNull(row.display_order),
            }))
            .filter((row) => row.item_name)
        );
      }

      const detachmentTablesRes = await supabase
        .from("paraphernalia_detachment_tables")
        .select("detachment")
        .eq("is_active", true)
        .order("detachment", { ascending: true });

      if (detachmentTablesRes.error) {
        setSchemaWarning("Run SQL/supabase_paraphernalia_stock_in_out.sql so individual detachment tables are saved in Supabase.");
      } else {
        const dbDetachmentTables = ((detachmentTablesRes.data ?? []) as Record<string, unknown>[])
          .map((row) => normalizeDetachmentName(row.detachment))
          .filter(Boolean);

        setManualDetachmentTables((prev) => {
          const next = mergeDetachmentTableNames(prev, readStoredDetachmentTables(), dbDetachmentTables);
          writeStoredDetachmentTables(next);
          return next;
        });
      }

      const stockOutWide = await supabase
        .from("paraphernalia")
        .select("id_paraphernalia, names, items, control_number, quantity, price, date, timestamp, created_at, status, date_posted, contract_id, client_name, specific_area")
        .order("timestamp", { ascending: false })
        .limit(5000);

      let stockOutRaw: Record<string, unknown>[] = [];
      if (stockOutWide.error) {
        const fallback = await supabase
          .from("paraphernalia")
          .select("id_paraphernalia, names, items, quantity, price, date, timestamp, created_at")
          .order("timestamp", { ascending: false })
          .limit(5000);
        if (fallback.error) throw fallback.error;
        stockOutRaw = (fallback.data ?? []) as Record<string, unknown>[];
        setSchemaWarning("Run SQL/supabase_paraphernalia_stock_in_out.sql so Stock Out can save status, date posted, client, and detachment fields.");
      } else {
        stockOutRaw = (stockOutWide.data ?? []) as Record<string, unknown>[];
      }

      const stockInWide = await supabase
        .from("restock")
        .select("id_restock, timestamptz, date, status, item, control_number, quanitity, attachment, detachment, contract_id, client_name")
        .order("timestamptz", { ascending: false })
        .limit(5000);

      let stockInRaw: Record<string, unknown>[] = [];
      if (stockInWide.error) {
        const fallback = await supabase
          .from("restock")
          .select("id_restock, timestamptz, date, status, item, quanitity, contract_id")
          .order("timestamptz", { ascending: false })
          .limit(5000);
        if (fallback.error) throw fallback.error;
        stockInRaw = (fallback.data ?? []) as Record<string, unknown>[];
        setSchemaWarning("Run SQL/supabase_paraphernalia_stock_in_out.sql so Stock In can save attachments, client, and detachment fields.");
      } else {
        stockInRaw = (stockInWide.data ?? []) as Record<string, unknown>[];
      }

      setStockOutRows(
        stockOutRaw
          .map((row) => ({
            id: String(row.id_paraphernalia ?? ""),
            timestamp: row.timestamp == null ? (row.created_at == null ? null : String(row.created_at)) : String(row.timestamp),
            date: row.date == null ? null : String(row.date),
            names: row.names == null ? null : String(row.names),
            item: row.items == null ? null : String(row.items),
            control_number: row.control_number == null ? null : String(row.control_number),
            quantity: toNumberOrNull(row.quantity),
            price: toNumberOrNull(row.price),
            status: row.status == null ? null : String(row.status),
            date_posted: row.date_posted == null ? null : String(row.date_posted),
            contract_id: row.contract_id == null ? null : String(row.contract_id),
            client_name: row.client_name == null ? null : String(row.client_name),
            specific_area: row.specific_area == null ? null : String(row.specific_area),
          }))
          .filter((row) => row.id)
      );

      setStockInRows(
        stockInRaw
          .map((row) => ({
            id: String(row.id_restock ?? ""),
            timestamp: row.timestamptz == null ? null : String(row.timestamptz),
            date: row.date == null ? null : String(row.date),
            status: row.status == null ? null : String(row.status),
            item: row.item == null ? null : String(row.item),
            control_number: row.control_number == null ? null : String(row.control_number),
            quantity: toNumberOrNull(row.quanitity),
            attachment: row.attachment == null ? null : String(row.attachment),
            detachment: row.detachment == null ? null : String(row.detachment),
            contract_id: row.contract_id == null ? null : String(row.contract_id),
            client_name: row.client_name == null ? null : String(row.client_name),
          }))
          .filter((row) => row.id)
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load paraphernalia data.");
      setContracts([]);
      setStockInRows([]);
      setStockOutRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    const channel = supabase
      .channel("realtime:paraphernalia-stock-flows")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia_items" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia_detachment_tables" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "restock" }, () => void loadAll())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const inventoryRows = useMemo<InventorySummaryRow[]>(() => {
    const rows = new Map<string, InventorySummaryRow>();

    function ensureRow(item: string, clientName: string, specificArea: string) {
      const normalizedItem = normalizeItem(item);
      const key = `${normalizeKey(clientName)}|${normalizeKey(specificArea)}|${normalizedItem}`;
      const existing = rows.get(key);
      if (existing) return existing;
      const next: InventorySummaryRow = {
        id: key,
        clientName,
        specificArea,
        item: normalizedItem || safeText(item),
        category: resolveItemCategory(normalizedItem || item),
        stockIn: 0,
        stockOut: 0,
        stockBalance: 0,
      };
      rows.set(key, next);
      return next;
    }

    for (const row of stockInRows) {
      const item = normalizeItem(row.item);
      if (!item) continue;
      const clientName = resolveClientName(row.contract_id, row.detachment, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      ensureRow(item, clientName, area).stockIn += row.quantity ?? 0;
    }

    for (const row of stockOutRows) {
      const item = normalizeItem(row.item);
      if (!item) continue;
      const clientName = resolveClientName(row.contract_id, row.specific_area, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.specific_area);
      ensureRow(item, clientName, area).stockOut += row.quantity ?? 0;
    }

    return Array.from(rows.values())
      .map((row) => ({ ...row, stockBalance: row.stockIn - row.stockOut }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.item.localeCompare(b.item));
  }, [stockInRows, stockOutRows, contractById, contractByArea, itemCategoryByName]);

  const q = search.trim().toLowerCase();
  const selectedDetachmentKey = normalizeKey(selectedDetachment);

  function isSelectedDetachment(area: string) {
    if (!selectedDetachmentKey || selectedDetachmentKey === "all") return true;
    return normalizeKey(area) === selectedDetachmentKey;
  }

  const scopedStockIn = useMemo(() => {
    return stockInRows.filter((row) => isSelectedDetachment(resolveSpecificArea(row.contract_id, row.detachment)));
  }, [stockInRows, selectedDetachmentKey, contractById, contractByArea]);

  const scopedStockOut = useMemo(() => {
    return stockOutRows.filter((row) => isSelectedDetachment(resolveSpecificArea(row.contract_id, row.specific_area)));
  }, [stockOutRows, selectedDetachmentKey, contractById, contractByArea]);

  const scopedInventoryRows = useMemo(() => {
    return inventoryRows.filter((row) => isSelectedDetachment(row.specificArea));
  }, [inventoryRows, selectedDetachmentKey]);

  const filteredStockIn = useMemo(() => {
    if (!q) return scopedStockIn;
    return scopedStockIn.filter((row) => {
      const clientName = resolveClientName(row.contract_id, row.detachment, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      return [row.timestamp, row.date, row.status, row.item, row.control_number, row.quantity, row.attachment, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [scopedStockIn, q, contractById, contractByArea]);

  const filteredStockOut = useMemo(() => {
    if (!q) return scopedStockOut;
    return scopedStockOut.filter((row) => {
      const clientName = resolveClientName(row.contract_id, row.specific_area, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.specific_area);
      return [row.timestamp, row.date, row.names, row.item, row.control_number, row.quantity, row.price, row.status, row.date_posted, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [scopedStockOut, q, contractById, contractByArea]);

  const filteredSecInventory = useMemo(() => {
    return scopedInventoryRows.filter((row) => {
      const matchesSearch = !q || [row.clientName, row.specificArea, row.item, row.stockBalance, row.stockIn, row.stockOut].join(" ").toLowerCase().includes(q);
      return row.category === "SEC" && matchesSearch;
    });
  }, [scopedInventoryRows, q]);

  const filteredOfficeInventory = useMemo(() => {
    return scopedInventoryRows.filter((row) => {
      const matchesSearch = !q || [row.clientName, row.specificArea, row.item, row.stockBalance, row.stockIn, row.stockOut].join(" ").toLowerCase().includes(q);
      return row.category === "OFFICE" && matchesSearch;
    });
  }, [scopedInventoryRows, q]);

  const detachmentTableGroups = useMemo(() => {
    const candidateDetachments =
      selectedDetachmentKey === "all"
        ? manualDetachmentTables
        : manualDetachmentTables.filter((detachment) => normalizeKey(detachment) === selectedDetachmentKey);

    function stockInMatches(row: StockInRow, detachment: string) {
      if (normalizeKey(resolveSpecificArea(row.contract_id, row.detachment)) !== normalizeKey(detachment)) return false;
      if (!q) return true;
      const clientName = resolveClientName(row.contract_id, row.detachment, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      return [row.timestamp, row.date, row.status, row.item, row.control_number, row.quantity, row.attachment, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }

    function stockOutMatches(row: StockOutRow, detachment: string) {
      if (normalizeKey(resolveSpecificArea(row.contract_id, row.specific_area)) !== normalizeKey(detachment)) return false;
      if (!q) return true;
      const clientName = resolveClientName(row.contract_id, row.specific_area, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.specific_area);
      return [row.timestamp, row.date, row.names, row.item, row.control_number, row.quantity, row.price, row.status, row.date_posted, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }

    function inventoryMatches(row: InventorySummaryRow, detachment: string, category: InventoryKind) {
      if (normalizeKey(row.specificArea) !== normalizeKey(detachment)) return false;
      if (row.category !== category) return false;
      if (!q) return true;
      return [row.clientName, row.specificArea, row.item, row.stockBalance, row.stockIn, row.stockOut].join(" ").toLowerCase().includes(q);
    }

    return candidateDetachments
      .filter((detachment) => safeText(detachment, "") !== "")
      .map((detachment) => {
        const stockIn = stockInRows.filter((row) => stockInMatches(row, detachment));
        const stockOut = stockOutRows.filter((row) => stockOutMatches(row, detachment));
        const secInventory = inventoryRows.filter((row) => inventoryMatches(row, detachment, "SEC"));
        const officeInventory = inventoryRows.filter((row) => inventoryMatches(row, detachment, "OFFICE"));
        const contract = contractByArea.get(normalizeKey(detachment));
        const clientNames = Array.from(
          new Set(
            [
              contract?.client_name,
              ...stockIn.map((row) => resolveClientName(row.contract_id, row.detachment, row.client_name)),
              ...stockOut.map((row) => resolveClientName(row.contract_id, row.specific_area, row.client_name)),
              ...secInventory.map((row) => row.clientName),
              ...officeInventory.map((row) => row.clientName),
            ]
              .map((value) => safeText(value, ""))
              .filter(Boolean)
          )
        );

        return {
          detachment,
          clientNames,
          stockIn,
          stockOut,
          secInventory,
          officeInventory,
          totalStockIn: stockIn.reduce((sum, row) => sum + (row.quantity ?? 0), 0),
          totalStockOut: stockOut.reduce((sum, row) => sum + (row.quantity ?? 0), 0),
          totalBalance: [...secInventory, ...officeInventory].reduce((sum, row) => sum + row.stockBalance, 0),
        };
      });
  }, [
    manualDetachmentTables,
    stockInRows,
    stockOutRows,
    inventoryRows,
    q,
    contractById,
    contractByArea,
    selectedDetachmentKey,
  ]);

  const stockInColumns = useMemo<ColumnDef<StockInRow>[]>(() => {
    const columns: ColumnDef<StockInRow>[] = [
      { key: "stock_in_timestamp", header: "Timestamp", render: (row) => formatDateTime(row.timestamp) },
      { key: "stock_in_date", header: "Date", render: (row) => safeText(row.date) },
      { key: "stock_in_status", header: "STATUS", render: (row) => <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{formatStockInStatus(row.status)}</span> },
      { key: "stock_in_item", header: "Item", render: (row) => safeText(row.item) },
      { key: "stock_in_control_number", header: "CONTROLNUMBER", render: (row) => safeText(row.control_number) },
      { key: "stock_in_quantity", header: "Quantity", render: (row) => formatNumber(row.quantity) },
      {
        key: "stock_in_attachment",
        header: "ATTACHMENT",
        render: (row) => {
          const value = safeText(row.attachment);
          if (value === "-") return value;
          const isUrl = /^https?:\/\//i.test(value);
          return isUrl ? (
            <a href={value} target="_blank" rel="noreferrer" className="font-medium text-[#8B1C1C] underline">
              {makeAttachmentLabel(row.attachment)}
            </a>
          ) : (
            value
          );
        },
      },
    ];
    return columns.filter((column) => canViewPermission(column.key));
  }, [restricted, allowedColumns]);

  const stockOutColumns = useMemo<ColumnDef<StockOutRow>[]>(() => {
    const columns: ColumnDef<StockOutRow>[] = [
      { key: "stock_out_timestamp", header: "Timestamp", render: (row) => formatDateTime(row.timestamp) },
      { key: "stock_out_date", header: "Date", render: (row) => safeText(row.date) },
      { key: "stock_out_names", header: "Names", render: (row) => safeText(row.names) },
      { key: "stock_out_items", header: "ITEMS", render: (row) => safeText(row.item) },
      { key: "stock_out_control_number", header: "CONTROLNUMBER", render: (row) => safeText(row.control_number) },
      { key: "stock_out_qty", header: "QTY", render: (row) => formatNumber(row.quantity) },
      { key: "stock_out_price", header: "PRICE", render: (row) => formatMoney(row.price) },
      { key: "stock_out_status", header: "STATUS", render: (row) => <span className="rounded-full bg-[#fff3b0] px-3 py-1 text-xs font-semibold text-[#6d4b00]">{safeText(row.status)}</span> },
      { key: "stock_out_date_posted", header: "Date Posted", render: (row) => safeText(row.date_posted) },
    ];
    return columns.filter((column) => canViewPermission(column.key));
  }, [restricted, allowedColumns]);

  const inventoryColumns = useMemo<ColumnDef<InventorySummaryRow>[]>(() => {
    const columns: ColumnDef<InventorySummaryRow>[] = [
      { key: "inventory_client_name", header: "Client Name", render: (row) => row.clientName },
      { key: "inventory_items", header: "ITEMS", render: (row) => row.item },
      { key: "inventory_stock_balance", header: "Stock Balance", render: (row) => formatNumber(row.stockBalance) },
      { key: "inventory_stock_in", header: "Stock In", render: (row) => formatNumber(row.stockIn) },
      { key: "inventory_stock_out", header: "Stock Out", render: (row) => formatNumber(row.stockOut) },
    ];
    return columns.filter((column) => canViewPermission(column.key));
  }, [restricted, allowedColumns]);

  function openCreate(kind: EntryKind, targetDetachment?: string, preferredInventoryKind?: InventoryKind) {
    setError("");
    setInfoMessage("");
    setAttachmentFile(null);
    const defaultDetachment =
      targetDetachment ??
      (selectedDetachmentKey && selectedDetachmentKey !== "all" ? selectedDetachment : safeText(contractOptions[0]?.specific_area, ""));
    const defaultClient = contractByArea.get(normalizeKey(defaultDetachment))?.client_name ?? "";
    const preferredItem = preferredInventoryKind
      ? (displayItemOptions.find((item) => item.item_category === preferredInventoryKind)?.item_name ?? "")
      : "";
    setStockInForm({
      ...EMPTY_STOCK_IN_FORM,
      items: [{ ...newStockInLine(), item: preferredItem }],
      detachment: defaultDetachment,
      clientName: safeText(defaultClient, ""),
    });
    setStockOutForm({
      ...EMPTY_STOCK_OUT_FORM,
      items: [newStockOutLine()],
      detachment: defaultDetachment,
      clientName: safeText(defaultClient, ""),
    });
    setEntryModal({ kind, mode: "create" });
  }

  function openEditStockIn(row: StockInRow) {
    const detachment = resolveSpecificArea(row.contract_id, row.detachment);
    setAttachmentFile(null);
    setStockInForm({
      date: safeText(row.date, ""),
      status: formatStockInStatus(row.status),
      items: [{ key: makeLineKey(), item: normalizeItem(row.item), controlNumber: normalizeControlNumber(row.control_number), quantity: row.quantity == null ? "" : String(row.quantity) }],
      attachment: safeText(row.attachment, ""),
      detachment,
      clientName: resolveClientName(row.contract_id, detachment, row.client_name),
    });
    setEntryModal({ kind: "stockIn", mode: "edit", row });
  }

  function openEditStockOut(row: StockOutRow) {
    const detachment = resolveSpecificArea(row.contract_id, row.specific_area);
    setStockOutForm({
      date: safeText(row.date, ""),
      names: safeText(row.names, ""),
      items: [{ key: makeLineKey(), item: normalizeItem(row.item), controlNumber: normalizeControlNumber(row.control_number), quantity: row.quantity == null ? "" : String(row.quantity), price: row.price == null ? "" : String(row.price) }],
      status: safeText(row.status, "FREE").toUpperCase(),
      datePosted: safeText(row.date_posted, ""),
      detachment,
      clientName: resolveClientName(row.contract_id, detachment, row.client_name),
    });
    setEntryModal({ kind: "stockOut", mode: "edit", row });
  }

  async function addDetachmentTable() {
    const next = normalizeDetachmentName(newDetachmentTable || (selectedDetachmentKey !== "all" ? selectedDetachment : ""));
    if (!next) return;
    setError("");
    setInfoMessage("");
    setManualDetachmentTables((prev) => {
      const merged = mergeDetachmentTableNames(prev, readStoredDetachmentTables(), [next]);
      writeStoredDetachmentTables(merged);
      return merged;
    });
    setSelectedDetachment(next);
    setNewDetachmentTable("");

    const { error: saveError } = await supabase.from("paraphernalia_detachment_tables").upsert(
      {
        detachment: next,
        client_name: clientNameForDetachment(next) || null,
        is_active: true,
      },
      { onConflict: "detachment" }
    );

    if (saveError) {
      setSchemaWarning("Run SQL/supabase_paraphernalia_stock_in_out.sql so individual detachment tables persist in Supabase.");
    } else {
      setInfoMessage(`Individual table created for ${next}.`);
    }
  }

  async function removeDetachmentTable(detachment: string) {
    setError("");
    setInfoMessage("");
    setManualDetachmentTables((prev) => {
      const next = mergeDetachmentTableNames(prev).filter((value) => normalizeKey(value) !== normalizeKey(detachment));
      writeStoredDetachmentTables(next);
      return next;
    });
    const { error: updateError } = await supabase
      .from("paraphernalia_detachment_tables")
      .update({ is_active: false })
      .eq("detachment", detachment);

    if (updateError) {
      setSchemaWarning("Run SQL/supabase_paraphernalia_stock_in_out.sql so individual detachment table changes persist in Supabase.");
    } else {
      setInfoMessage(`Individual table removed for ${detachment}.`);
    }
  }

  function updateStockInLine(key: string, patch: Partial<StockInLineForm>) {
    setStockInForm((prev) => ({
      ...prev,
      items: prev.items.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function updateStockOutLine(key: string, patch: Partial<StockOutLineForm>) {
    setStockOutForm((prev) => ({
      ...prev,
      items: prev.items.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function removeStockInLine(key: string) {
    setStockInForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((line) => line.key !== key) : prev.items,
    }));
  }

  function removeStockOutLine(key: string) {
    setStockOutForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((line) => line.key !== key) : prev.items,
    }));
  }

  async function addItemOption() {
    const itemName = normalizeItem(newItemName);
    if (!itemName) {
      setError("Enter an item name before adding it.");
      return;
    }

    setItemBusy(true);
    setError("");
    setInfoMessage("");
    try {
      const { data, error: upsertError } = await supabase
        .from("paraphernalia_items")
        .upsert(
          {
            item_name: itemName,
            item_category: newItemCategory,
            display_order: displayItemOptions.length + 1,
            is_active: true,
          },
          { onConflict: "item_name" }
        )
        .select("item_id, item_name, item_category, display_order")
        .single();

      if (upsertError) throw upsertError;

      const nextItem: ItemOption = {
        item_id: data?.item_id == null ? null : String(data.item_id),
        item_name: normalizeItem(data?.item_name ?? itemName),
        item_category: String(data?.item_category ?? newItemCategory).toUpperCase() === "OFFICE" ? "OFFICE" : "SEC",
        display_order: toNumberOrNull(data?.display_order),
      };

      setItemOptions((prev) => {
        const withoutExisting = prev.filter((item) => normalizeItem(item.item_name) !== normalizeItem(nextItem.item_name));
        return [...withoutExisting, nextItem];
      });
      setNewItemName("");
      setInfoMessage("Item added to the dropdown.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to add item. Run the SQL migration first.");
    } finally {
      setItemBusy(false);
    }
  }

  async function removeItemOption(item: ItemOption) {
    if (!item.item_id) {
      setItemOptions((prev) => prev.filter((row) => normalizeItem(row.item_name) !== normalizeItem(item.item_name)));
      return;
    }

    setItemBusy(true);
    setError("");
    setInfoMessage("");
    try {
      const softDelete = await supabase.from("paraphernalia_items").update({ is_active: false }).eq("item_id", item.item_id);
      if (softDelete.error) {
        const hardDelete = await supabase.from("paraphernalia_items").delete().eq("item_id", item.item_id);
        if (hardDelete.error) throw hardDelete.error;
      }

      setItemOptions((prev) => prev.filter((row) => row.item_id !== item.item_id));
      setInfoMessage("Item removed from the dropdown.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to remove item.");
    } finally {
      setItemBusy(false);
    }
  }

  async function uploadAttachmentFile(file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `paraphernalia/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(PARAPHERNALIA_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(PARAPHERNALIA_BUCKET).getPublicUrl(path);
    return data.publicUrl || path;
  }

  async function ensureItemOption(itemName: string) {
    const normalized = normalizeItem(itemName);
    if (!normalized) return;
    if (displayItemOptions.some((item) => normalizeItem(item.item_name) === normalized)) return;

    const { error: upsertError } = await supabase.from("paraphernalia_items").upsert(
      {
        item_name: normalized,
        item_category: resolveItemCategory(normalized),
        display_order: displayItemOptions.length + 1,
        is_active: true,
      },
      { onConflict: "item_name" }
    );

    if (upsertError) {
      setSchemaWarning("Run SQL/supabase_paraphernalia_stock_in_out.sql so typed items can be saved into the dropdown list.");
      return;
    }

    setItemOptions((prev) => [
      ...prev,
      {
        item_id: null,
        item_name: normalized,
        item_category: resolveItemCategory(normalized),
        display_order: displayItemOptions.length + 1,
      },
    ]);
  }

  async function saveStockIn(mode: EntryMode, row?: StockInRow) {
    const detachment = stockInForm.detachment.trim();
    const selectedContract = contractByArea.get(normalizeKey(detachment)) ?? null;
    const clientName = stockInForm.clientName.trim() || safeText(selectedContract?.client_name, "");
    const lines = stockInForm.items
      .map((line, index) => ({
        item: normalizeItem(line.item),
        control_number: normalizeControlNumber(line.controlNumber) || nextControlNumber(line.item, index),
        quantity: toNumberOrNull(line.quantity),
      }))
      .filter((line) => line.item || line.control_number || line.quantity != null);

    if (!stockInForm.date.trim()) throw new Error("Date is required for Stock In.");
    if (!detachment) throw new Error("Detachment is required. You can select a contract Specific Area or type a new detachment.");
    if (!lines.length) throw new Error("Add at least one Stock In item.");
    if (lines.some((line) => !line.item)) throw new Error("Every Stock In line needs an item.");
    if (lines.some((line) => line.quantity == null || line.quantity <= 0)) throw new Error("Every Stock In quantity must be greater than zero.");

    let attachment = stockInForm.attachment.trim() || null;
    if (attachmentFile) attachment = await uploadAttachmentFile(attachmentFile);

    for (const line of lines) await ensureItemOption(line.item);

    const payloads = lines.map((line) => ({
      date: stockInForm.date.trim(),
      status: stockInForm.status.trim().toUpperCase(),
      item: line.item,
      control_number: line.control_number,
      quanitity: String(line.quantity ?? 0),
      quantity: line.quantity,
      attachment,
      detachment,
      contract_id: selectedContract?.contract_id ?? null,
      client_name: clientName || null,
    }));

    if (mode === "edit" && row) {
      const [first, ...rest] = payloads;
      const updateResult = await supabase.from("restock").update(first).eq("id_restock", row.id);
      if (updateResult.error) throw updateResult.error;

      if (rest.length) {
        const insertResult = await supabase.from("restock").insert(rest.map((payload) => ({ id_restock: crypto.randomUUID(), ...payload })));
        if (insertResult.error) throw insertResult.error;
      }
      return;
    }

    const result = await supabase.from("restock").insert(payloads.map((payload) => ({ id_restock: crypto.randomUUID(), ...payload })));
    if (result.error) throw result.error;
  }

  async function saveStockOut(mode: EntryMode, row?: StockOutRow) {
    const detachment = stockOutForm.detachment.trim();
    const selectedContract = contractByArea.get(normalizeKey(detachment)) ?? null;
    const clientName = stockOutForm.clientName.trim() || safeText(selectedContract?.client_name, "");
    const lines = stockOutForm.items
      .map((line, index) => ({
        item: normalizeItem(line.item),
        control_number: normalizeControlNumber(line.controlNumber) || nextControlNumber(line.item, index),
        quantity: toNumberOrNull(line.quantity),
        price: toNumberOrNull(line.price),
      }))
      .filter((line) => line.item || line.control_number || line.quantity != null || line.price != null);

    if (!stockOutForm.date.trim()) throw new Error("Date is required for Stock Out.");
    if (!stockOutForm.names.trim()) throw new Error("Names is required for Stock Out.");
    if (!detachment) throw new Error("Detachment is required. You can select a contract Specific Area or type a new detachment.");
    if (!lines.length) throw new Error("Add at least one Stock Out item.");
    if (lines.some((line) => !line.item)) throw new Error("Every Stock Out line needs an item.");
    if (lines.some((line) => line.quantity == null || line.quantity <= 0)) throw new Error("Every Stock Out QTY must be greater than zero.");

    for (const line of lines) await ensureItemOption(line.item);

    const payloads = lines.map((line) => ({
      date: stockOutForm.date.trim(),
      names: stockOutForm.names.trim(),
      items: line.item,
      control_number: line.control_number,
      quantity: line.quantity,
      price: line.price,
      status: stockOutForm.status.trim().toUpperCase(),
      date_posted: stockOutForm.datePosted.trim() || null,
      contract_id: selectedContract?.contract_id ?? null,
      client_name: clientName || null,
      specific_area: detachment,
    }));

    if (mode === "edit" && row) {
      const [first, ...rest] = payloads;
      const updateResult = await supabase.from("paraphernalia").update(first).eq("id_paraphernalia", row.id);
      if (updateResult.error) throw updateResult.error;

      if (rest.length) {
        const insertResult = await supabase.from("paraphernalia").insert(rest.map((payload) => ({ id_paraphernalia: crypto.randomUUID(), ...payload })));
        if (insertResult.error) throw insertResult.error;
      }
      return;
    }

    const result = await supabase.from("paraphernalia").insert(payloads.map((payload) => ({ id_paraphernalia: crypto.randomUUID(), ...payload })));
    if (result.error) throw result.error;
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entryModal) return;

    setSaving(true);
    setError("");
    setInfoMessage("");

    try {
      if (entryModal.kind === "stockIn") {
        await saveStockIn(entryModal.mode, entryModal.row);
        setInfoMessage(entryModal.mode === "edit" ? "Stock In record updated." : "Stock In record created.");
      } else {
        await saveStockOut(entryModal.mode, entryModal.row);
        setInfoMessage(entryModal.mode === "edit" ? "Stock Out record updated." : "Stock Out record created.");
      }

      setEntryModal(null);
      setAttachmentFile(null);
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to save paraphernalia record.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteState) return;
    setDeleting(true);
    setError("");
    setInfoMessage("");

    try {
      const result =
        deleteState.kind === "stockIn"
          ? await supabase.from("restock").delete().eq("id_restock", deleteState.id)
          : await supabase.from("paraphernalia").delete().eq("id_paraphernalia", deleteState.id);

      if (result.error) throw result.error;
      setInfoMessage(deleteState.kind === "stockIn" ? "Stock In record deleted." : "Stock Out record deleted.");
      setDeleteState(null);
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to delete record.");
    } finally {
      setDeleting(false);
    }
  }

  function parseParaphernaliaImportRow(row: Record<string, unknown>, idx = 0) {
    const section = normalizeKey(pickByAliases(row, ["section", "type", "record type", "transaction"]));
    const kind: EntryKind =
      section.includes("out") || section.includes("issued") || section.includes("release")
        ? "stockOut"
        : "stockIn";
    const item = normalizeItem(pickByAliases(row, ["item", "items", "equipment"]));
    const detachment = normalizeDetachmentName(pickByAliases(row, ["detachment", "specific area", "area"]));
    const date = pickByAliases(row, ["date", "transaction date"]).trim();
    const quantity = toNumberOrNull(pickByAliases(row, ["quantity", "qty", "quanitity"]));
    const controlNumber = normalizeControlNumber(pickByAliases(row, ["controlnumber", "control number", "control_no", "control no"])) || (item ? nextControlNumber(item, idx) : "");
    const clientName = pickByAliases(row, ["client_name", "client name", "client"]).trim() || clientNameForDetachment(detachment) || null;
    const selectedContract = contractByArea.get(normalizeKey(detachment));

    if (!date || !item || !detachment || quantity == null || quantity <= 0) {
      return {
        payload: null,
        displayName: item || detachment || "Paraphernalia row",
        error: "Missing required Date, Item, Quantity, or Detachment.",
      };
    }

    if (kind === "stockOut") {
      const names = pickByAliases(row, ["names", "name", "employee", "issued to"]).trim();
      if (!names) {
        return { payload: null, displayName: item, error: "Stock Out rows require Names." };
      }

      return {
        displayName: `${names} - ${item}`,
        payload: {
          __kind: "stockOut",
          date,
          names,
          items: item,
          control_number: controlNumber,
          quantity,
          price: toNumberOrNull(pickByAliases(row, ["price", "unit price", "amount"])),
          status: (pickByAliases(row, ["status"]).trim() || "FREE").toUpperCase(),
          date_posted: pickByAliases(row, ["date posted", "date_posted"]).trim() || null,
          specific_area: detachment,
          contract_id: selectedContract?.contract_id ?? null,
          client_name: clientName,
        },
      };
    }

    return {
      displayName: `${detachment} - ${item}`,
      payload: {
        __kind: "stockIn",
        date,
        status: (pickByAliases(row, ["status"]).trim() || "RE-STOCKED").toUpperCase(),
        item,
        control_number: controlNumber,
        quanitity: String(quantity),
        quantity,
        attachment: pickByAliases(row, ["attachment", "attachment url", "file"]).trim() || null,
        detachment,
        contract_id: selectedContract?.contract_id ?? null,
        client_name: clientName,
      },
    };
  }

  async function handleParaphernaliaImport(rawRows: Record<string, unknown>[]) {
    if (!canImport) throw new Error("You do not have permission to import paraphernalia files.");

    const rowErrors: string[] = [];
    let skipped = 0;
    const parsedRows = rawRows
      .map((row, idx) => {
        const parsed = parseParaphernaliaImportRow(row, idx);
        if (!parsed.payload) {
          skipped += 1;
          if (parsed.error) rowErrors.push(`Row ${idx + 2}: ${parsed.error}`);
        }
        return parsed.payload;
      })
      .filter(Boolean) as Record<string, unknown>[];

    if (!parsedRows.length) throw new Error("No valid paraphernalia rows found in file.");

    const tableDetachments = parsedRows
      .map((payload) => normalizeDetachmentName(payload.__kind === "stockIn" ? payload.detachment : payload.specific_area))
      .filter(Boolean);
    if (tableDetachments.length) {
      setManualDetachmentTables((prev) => {
        const next = mergeDetachmentTableNames(prev, readStoredDetachmentTables(), tableDetachments);
        writeStoredDetachmentTables(next);
        return next;
      });
      await supabase.from("paraphernalia_detachment_tables").upsert(
        mergeDetachmentTableNames(tableDetachments).map((detachment) => ({
          detachment,
          client_name: clientNameForDetachment(detachment) || null,
          is_active: true,
        })),
        { onConflict: "detachment" }
      );
    }

    for (const payload of parsedRows) {
      const item = String(payload.__kind === "stockIn" ? payload.item ?? "" : payload.items ?? "");
      await ensureItemOption(item);
    }

    const stockInByKey = new Map<string, string>();
    for (const row of stockInRows) {
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      const controlKey = normalizeControlNumber(row.control_number);
      if (controlKey) stockInByKey.set(`control:${controlKey}`, row.id);
      stockInByKey.set(`row:${normalizeKey(row.date)}|${normalizeKey(area)}|${normalizeItem(row.item)}|${normalizeKey(row.status)}`, row.id);
    }

    const stockOutByKey = new Map<string, string>();
    for (const row of stockOutRows) {
      const area = resolveSpecificArea(row.contract_id, row.specific_area);
      const controlKey = normalizeControlNumber(row.control_number);
      if (controlKey) stockOutByKey.set(`control:${controlKey}`, row.id);
      stockOutByKey.set(`row:${normalizeKey(row.date)}|${normalizeKey(area)}|${normalizeItem(row.item)}|${normalizeKey(row.names)}`, row.id);
    }

    let inserted = 0;
    let updated = 0;
    const deduped = new Map<string, Record<string, unknown>>();
    for (const payload of parsedRows) {
      const kind = String(payload.__kind);
      const controlKey = normalizeControlNumber(payload.control_number);
      const area = kind === "stockIn" ? normalizeKey(payload.detachment) : normalizeKey(payload.specific_area);
      const item = normalizeItem(kind === "stockIn" ? payload.item : payload.items);
      const identity = controlKey || `${normalizeKey(payload.date)}|${area}|${item}|${normalizeKey(kind === "stockIn" ? payload.status : payload.names)}`;
      const key = `${kind}:${identity}`;
      if (deduped.has(key)) skipped += 1;
      deduped.set(key, payload);
    }

    for (const [key, payload] of deduped.entries()) {
      const kind = payload.__kind as EntryKind;
      const { __kind, ...dbPayload } = payload;
      const controlKey = normalizeControlNumber(payload.control_number);
      const rowKey =
        kind === "stockIn"
          ? `row:${normalizeKey(payload.date)}|${normalizeKey(payload.detachment)}|${normalizeItem(payload.item)}|${normalizeKey(payload.status)}`
          : `row:${normalizeKey(payload.date)}|${normalizeKey(payload.specific_area)}|${normalizeItem(payload.items)}|${normalizeKey(payload.names)}`;
      const id = kind === "stockIn"
        ? (controlKey ? stockInByKey.get(`control:${controlKey}`) : undefined) ?? stockInByKey.get(rowKey)
        : (controlKey ? stockOutByKey.get(`control:${controlKey}`) : undefined) ?? stockOutByKey.get(rowKey);

      if (kind === "stockIn") {
        const result = id
          ? await supabase.from("restock").update(dbPayload).eq("id_restock", id)
          : await supabase.from("restock").insert({ id_restock: crypto.randomUUID(), ...dbPayload });
        if (result.error) {
          skipped += 1;
          rowErrors.push(`${id ? "Update" : "Insert"} failed for ${key}: ${result.error.message}`);
          continue;
        }
      } else {
        const result = id
          ? await supabase.from("paraphernalia").update(dbPayload).eq("id_paraphernalia", id)
          : await supabase.from("paraphernalia").insert({ id_paraphernalia: crypto.randomUUID(), ...dbPayload });
        if (result.error) {
          skipped += 1;
          rowErrors.push(`${id ? "Update" : "Insert"} failed for ${key}: ${result.error.message}`);
          continue;
        }
      }

      if (id) updated += 1;
      else inserted += 1;
    }

    setImportSummary({ inserted, updated, skipped, errors: rowErrors });
    setImportSummaryOpen(true);
    setInfoMessage(`Import complete. Inserted: ${inserted}, Updated: ${updated}.`);
    await loadAll();
    return { inserted, updated, skipped, errors: rowErrors };
  }

  function stockInExportRows(rows: StockInRow[]) {
    return rows.map((row) => ({
      Timestamp: formatDateTime(row.timestamp),
      Date: safeText(row.date),
      Status: safeText(row.status),
      Item: safeText(row.item),
      CONTROLNUMBER: safeText(row.control_number),
      Quantity: row.quantity ?? "",
      Attachment: safeText(row.attachment),
      Detachment: resolveSpecificArea(row.contract_id, row.detachment),
      "Client Name": resolveClientName(row.contract_id, row.detachment, row.client_name),
    }));
  }

  function stockOutExportRows(rows: StockOutRow[]) {
    return rows.map((row) => ({
      Timestamp: formatDateTime(row.timestamp),
      Date: safeText(row.date),
      Names: safeText(row.names),
      Items: safeText(row.item),
      CONTROLNUMBER: safeText(row.control_number),
      QTY: row.quantity ?? "",
      Price: row.price ?? "",
      Status: safeText(row.status),
      "Date Posted": safeText(row.date_posted),
      Detachment: resolveSpecificArea(row.contract_id, row.specific_area),
      "Client Name": resolveClientName(row.contract_id, row.specific_area, row.client_name),
    }));
  }

  function inventoryExportRows(rows: InventorySummaryRow[]) {
    return rows.map((row) => ({
      "Client Name": row.clientName,
      Detachment: row.specificArea,
      Items: row.item,
      "Stock Balance": row.stockBalance,
      "Stock In": row.stockIn,
      "Stock Out": row.stockOut,
    }));
  }

  async function exportXlsx() {
    if (!canExport) return;
    const out = await buildBrandedWorkbookBuffer([
      {
        name: "StockIn",
        title: "Paraphernalia Stock In",
        subtitle: "Stock-in records grouped through Client contract Specific Area",
        rows: stockInExportRows(filteredStockIn),
      },
      {
        name: "StockOut",
        title: "Paraphernalia Stock Out",
        subtitle: "Stock-out records grouped through Client contract Specific Area",
        rows: stockOutExportRows(filteredStockOut),
      },
      {
        name: "SecInventory",
        title: "Paraphernalia Sec Inv. s",
        subtitle: "Security inventory balance from Stock In minus Stock Out",
        rows: inventoryExportRows(filteredSecInventory),
      },
      {
        name: "OfficeSupplyInv",
        title: "Paraphernalia Office Supply Inv.",
        subtitle: "Office supply inventory balance from Stock In minus Stock Out",
        rows: inventoryExportRows(filteredOfficeInventory),
      },
    ]);
    downloadBlob(`paraphernalia_stock_${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  function exportCsv() {
    if (!canExport) return;
    const rows = [
      ...stockInExportRows(filteredStockIn).map((row) => ({ Section: "Stock In", ...row })),
      ...stockOutExportRows(filteredStockOut).map((row) => ({ Section: "Stock Out", ...row })),
      ...inventoryExportRows(filteredSecInventory).map((row) => ({ Section: "Sec Inventory", ...row })),
      ...inventoryExportRows(filteredOfficeInventory).map((row) => ({ Section: "Office Supply Inventory", ...row })),
    ];
    const ws = XLSX.utils.aoa_to_sheet(buildBrandedAoa(rows, "Paraphernalia Stock Export", "Combined stock-in, stock-out, and inventory summary"));
    downloadBlob(`paraphernalia_stock_${new Date().toISOString().slice(0, 10)}.csv`, new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8;" }));
  }

  async function exportPdf() {
    if (!canExport) return;
    const doc = new jsPDF({ orientation: "landscape" });
    let y = await addBrandedPdfHeader(doc, "Paraphernalia Stock Export", "Combined stock-in, stock-out, and inventory summary");

    function addTable(title: string, rows: Record<string, unknown>[]) {
      doc.setFontSize(12);
      doc.text(title, 14, y);
      y += 4;
      const headers = Object.keys(rows[0] ?? { Message: "No rows" });
      const body = rows.length ? rows.map((row) => headers.map((header) => String(row[header] ?? ""))) : [["No rows"]];
      autoTable(doc, {
        startY: y,
        head: [headers],
        body,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [139, 28, 28] },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 10;
      if (y > 180) {
        doc.addPage();
        y = 20;
      }
    }

    addTable("Paraphernalia Stock In", stockInExportRows(filteredStockIn));
    addTable("Paraphernalia Stock Out", stockOutExportRows(filteredStockOut));
    addTable("Paraphernalia Sec Inv. s", inventoryExportRows(filteredSecInventory));
    addTable("Paraphernalia Office Supply Inv.", inventoryExportRows(filteredOfficeInventory));
    doc.save(`paraphernalia_stock_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function renderActions(row: StockInRow | StockOutRow, kind: EntryKind) {
    if (!isAdmin) return null;
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => (kind === "stockIn" ? openEditStockIn(row as StockInRow) : openEditStockOut(row as StockOutRow))}
          className="rounded-xl border bg-white p-2 text-black hover:bg-[#fff8da]"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            setDeleteState({
              kind,
              id: row.id,
              label: kind === "stockIn" ? safeText((row as StockInRow).item) : safeText((row as StockOutRow).item),
            })
          }
          className="rounded-xl border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function groupedByClient<T>(rows: T[], getClientName: (row: T) => string) {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
      const clientName = safeText(getClientName(row), "Unassigned Client");
      groups.set(clientName, [...(groups.get(clientName) ?? []), row]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }

  function renderViewAllModal() {
    if (!viewAllState) return null;

    const viewAllKind = viewAllState.kind;
    const detachment = viewAllState.detachment;

    const title =
      viewAllKind === "stockIn"
        ? "View All Paraphernalia Stock In"
        : viewAllKind === "stockOut"
          ? "View All Paraphernalia Stock Out"
          : viewAllKind === "secInventory"
            ? "View All Paraphernalia Sec Inv. s"
            : "View All Paraphernalia Office Supply Inv.";

    const allRows =
      viewAllKind === "stockIn"
        ? filteredStockIn
        : viewAllKind === "stockOut"
          ? filteredStockOut
          : viewAllKind === "secInventory"
            ? filteredSecInventory
            : filteredOfficeInventory;
    const rows = detachment
      ? allRows.filter((row) => {
          if (viewAllKind === "stockIn") return normalizeKey(resolveSpecificArea((row as StockInRow).contract_id, (row as StockInRow).detachment)) === normalizeKey(detachment);
          if (viewAllKind === "stockOut") return normalizeKey(resolveSpecificArea((row as StockOutRow).contract_id, (row as StockOutRow).specific_area)) === normalizeKey(detachment);
          return normalizeKey((row as InventorySummaryRow).specificArea) === normalizeKey(detachment);
        })
      : allRows;

    return (
      <ModalShell
        open={Boolean(viewAllKind)}
        title={detachment ? `${title}: ${detachment}` : title}
        subtitle="Rows are segregated by the Client Name from the Client page contracts."
        onClose={() => setViewAllState(null)}
      >
        {viewAllKind === "stockIn"
          ? groupedByClient(rows as StockInRow[], (row) => resolveClientName(row.contract_id, row.detachment, row.client_name)).map(([clientName, clientRows]) => (
              <div key={clientName} className="mb-8">
                <div className="mb-3 rounded-2xl bg-[#fff3b0] px-4 py-3 text-sm font-semibold text-black">{clientName}</div>
                <DataTable
                  storageKey={`paraphernalia-view-stock-in-${normalizeKey(clientName)}`}
                  columns={stockInColumns}
                  rows={clientRows}
                  rowKey={(row) => row.id}
                  loading={false}
                  emptyLabel="No Stock In records for this client."
                />
              </div>
            ))
          : null}

        {viewAllKind === "stockOut"
          ? groupedByClient(rows as StockOutRow[], (row) => resolveClientName(row.contract_id, row.specific_area, row.client_name)).map(([clientName, clientRows]) => (
              <div key={clientName} className="mb-8">
                <div className="mb-3 rounded-2xl bg-[#fff3b0] px-4 py-3 text-sm font-semibold text-black">{clientName}</div>
                <DataTable
                  storageKey={`paraphernalia-view-stock-out-${normalizeKey(clientName)}`}
                  columns={stockOutColumns}
                  rows={clientRows}
                  rowKey={(row) => row.id}
                  loading={false}
                  emptyLabel="No Stock Out records for this client."
                />
              </div>
            ))
          : null}

        {viewAllKind === "secInventory" || viewAllKind === "officeInventory"
          ? groupedByClient(rows as InventorySummaryRow[], (row) => row.clientName).map(([clientName, clientRows]) => (
              <div key={clientName} className="mb-8">
                <div className="mb-3 rounded-2xl bg-[#fff3b0] px-4 py-3 text-sm font-semibold text-black">{clientName}</div>
                <DataTable
                  storageKey={`paraphernalia-view-inventory-${normalizeKey(clientName)}-${viewAllKind}`}
                  columns={inventoryColumns}
                  rows={clientRows}
                  rowKey={(row) => row.id}
                  loading={false}
                  emptyLabel="No inventory activity for this client."
                />
              </div>
            ))
          : null}
      </ModalShell>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f3e8] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[2rem] border border-[#e5dcc7] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8B1C1C]">Logistics</div>
              <h1 className="mt-2 text-3xl font-bold text-black">Paraphernalia</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                Manage Stock In, Stock Out, and inventory balances connected to Client page contract Specific Areas.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadAll()}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => setItemManagerOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Manage Items
                  </button>
                  {canImport ? (
                    <button
                      type="button"
                      onClick={() => setImportModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                    >
                      <Upload className="h-4 w-4" />
                      Import Excel/CSV
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openCreate("stockIn")}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B1C1C] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    <Plus className="h-4 w-4" />
                    Create Stock In
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreate("stockOut")}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                  >
                    <Plus className="h-4 w-4" />
                    Create Stock Out
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {infoMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{infoMessage}</div> : null}
        {schemaWarning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{schemaWarning}</div> : null}

        <datalist id="paraphernalia-item-options">
          {displayItemOptions.map((item) => (
            <option key={`${item.item_id ?? item.item_name}-${item.item_name}`} value={item.item_name} />
          ))}
        </datalist>

        <datalist id="paraphernalia-detachment-options">
          {detachmentOptions.map((detachment) => (
            <option key={detachment} value={detachment} />
          ))}
        </datalist>

        <div className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
              <label>
                <span className={labelClass}>Available Detachment</span>
                <select
                  value={selectedDetachment}
                  onChange={(event) => setSelectedDetachment(event.target.value)}
                  className={inputClass}
                >
                  <option value="ALL">All Detachments</option>
                  {detachmentOptions.map((detachment) => (
                    <option key={detachment} value={detachment}>
                      {detachment}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Create Individual Detachment Table</span>
                <div className="flex gap-2">
                  <input
                    list="paraphernalia-detachment-options"
                    value={newDetachmentTable}
                    onChange={(event) => setNewDetachmentTable(event.target.value)}
                    className={inputClass}
                    placeholder="Type detachment or choose above"
                  />
                  <button
                    type="button"
                    onClick={() => void addDetachmentTable()}
                    className="shrink-0 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                  >
                    Create
                  </button>
                </div>
              </label>
            </div>
            <div className="rounded-2xl bg-[#fff9e6] px-4 py-3 text-sm text-gray-700">
              Individual table sets: <span className="font-semibold text-black">{manualDetachmentTables.length}</span>
            </div>
          </div>

            {manualDetachmentTables.length ? (
              <div className="flex flex-wrap gap-2">
                {manualDetachmentTables.map((detachment) => (
                  <div key={detachment} className="inline-flex items-center gap-2 rounded-full border bg-[#fff9e6] px-3 py-2 text-sm text-black">
                    <span>{detachment}</span>
                    <button
                      type="button"
                      onClick={() => void removeDetachmentTable(detachment)}
                      className="rounded-full px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      title="Remove individual table"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-gray-50 px-4 py-3 text-sm text-gray-600">
                No individual detachment tables yet. Select or type a detachment, then click Create.
              </div>
            )}
            </div>
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full md:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search stock, item, client, detachment, or status..."
              className="w-full rounded-2xl border px-10 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#FFDA03]"
            />
          </label>

          {canExport ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void exportXlsx()} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50">
                <Download className="h-4 w-4" />
                XLSX
              </button>
              <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50">
                <Download className="h-4 w-4" />
                CSV
              </button>
              <button type="button" onClick={() => void exportPdf()} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50">
                <FileText className="h-4 w-4" />
                PDF
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-8">
          {detachmentTableGroups.length ? (
            detachmentTableGroups.map((group) => (
              <section key={normalizeKey(group.detachment)} className="space-y-5 rounded-[2rem] border border-[#e5dcc7] bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B1C1C]">Detachment Table</div>
                    <h2 className="mt-1 text-2xl font-bold text-black">{group.detachment}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {group.clientNames.length ? group.clientNames.join(", ") : "Custom detachment"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
                      <div className="font-semibold">Stock In</div>
                      <div className="text-base font-bold">{formatNumber(group.totalStockIn)}</div>
                    </div>
                    <div className="rounded-2xl bg-red-50 px-3 py-2 text-red-700">
                      <div className="font-semibold">Stock Out</div>
                      <div className="text-base font-bold">{formatNumber(group.totalStockOut)}</div>
                    </div>
                    <div className="rounded-2xl bg-[#fff3b0] px-3 py-2 text-[#6d4b00]">
                      <div className="font-semibold">Balance</div>
                      <div className="text-base font-bold">{formatNumber(group.totalBalance)}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <div className="space-y-3 rounded-3xl border bg-[#fffdf5] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-black">Paraphernalia Sec Inv. s</h3>
                          <p className="text-sm text-gray-500">Security items for {group.detachment}.</p>
                        </div>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => openCreate("stockIn", group.detachment, "SEC")}
                            className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                          >
                            Add Sec Items
                          </button>
                        ) : null}
                      </div>
                      <DataTable
                        storageKey={`paraphernalia-sec-inventory-${normalizeKey(group.detachment)}`}
                        columns={inventoryColumns}
                        rows={group.secInventory}
                        rowKey={(row) => row.id}
                        loading={loading}
                        emptyLabel={`No Sec Inv. activity for ${group.detachment}.`}
                        previewLimit={4}
                        onViewAll={() => setViewAllState({ kind: "secInventory", detachment: group.detachment })}
                      />
                    </div>

                    <div className="space-y-3 rounded-3xl border bg-[#fffdf5] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-black">Paraphernalia Office Supply Inv.</h3>
                          <p className="text-sm text-gray-500">Office supply items for {group.detachment}.</p>
                        </div>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => openCreate("stockIn", group.detachment, "OFFICE")}
                            className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                          >
                            Add Office Items
                          </button>
                        ) : null}
                      </div>
                      <DataTable
                        storageKey={`paraphernalia-office-inventory-${normalizeKey(group.detachment)}`}
                        columns={inventoryColumns}
                        rows={group.officeInventory}
                        rowKey={(row) => row.id}
                        loading={loading}
                        emptyLabel={`No Office Supply Inv. activity for ${group.detachment}.`}
                        previewLimit={4}
                        onViewAll={() => setViewAllState({ kind: "officeInventory", detachment: group.detachment })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-3xl border bg-[#fffdf5] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-black">Paraphernalia Stock In</h3>
                        <p className="text-sm text-gray-500">Only Stock In records for {group.detachment}.</p>
                      </div>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => openCreate("stockIn", group.detachment)}
                          className="rounded-xl bg-[#8B1C1C] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                        >
                          Add Stock In
                        </button>
                      ) : null}
                    </div>
                    <DataTable
                      storageKey={`paraphernalia-stock-in-${normalizeKey(group.detachment)}`}
                      columns={stockInColumns}
                      rows={group.stockIn}
                      rowKey={(row) => row.id}
                      loading={loading}
                      emptyLabel={`No Stock In records for ${group.detachment}.`}
                      actions={isAdmin ? (row) => renderActions(row, "stockIn") : undefined}
                      previewLimit={4}
                      onViewAll={() => setViewAllState({ kind: "stockIn", detachment: group.detachment })}
                    />
                  </div>

                  <div className="space-y-3 rounded-3xl border bg-[#fffdf5] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-black">Paraphernalia Stock Out</h3>
                        <p className="text-sm text-gray-500">Only Stock Out records for {group.detachment}.</p>
                      </div>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => openCreate("stockOut", group.detachment)}
                          className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                        >
                          Add Stock Out
                        </button>
                      ) : null}
                    </div>
                    <DataTable
                      storageKey={`paraphernalia-stock-out-${normalizeKey(group.detachment)}`}
                      columns={stockOutColumns}
                      rows={group.stockOut}
                      rowKey={(row) => row.id}
                      loading={loading}
                      emptyLabel={`No Stock Out records for ${group.detachment}.`}
                      actions={isAdmin ? (row) => renderActions(row, "stockOut") : undefined}
                      previewLimit={4}
                      onViewAll={() => setViewAllState({ kind: "stockOut", detachment: group.detachment })}
                    />
                  </div>

                </div>
              </section>
            ))
          ) : (
            <div className="rounded-[2rem] border bg-white p-8 text-center text-gray-500">
              No individual detachment tables found yet. Select or type a detachment above, then click Create.
            </div>
          )}
        </div>
      </div>

      <ModalShell
        open={Boolean(entryModal)}
        title={entryModal?.kind === "stockIn" ? `${entryModal.mode === "edit" ? "Edit" : "Create"} Paraphernalia Stock In` : `${entryModal?.mode === "edit" ? "Edit" : "Create"} Paraphernalia Stock Out`}
        subtitle="Detachment options come from the Client page contracts Specific Area column."
        onClose={() => {
          if (!saving) setEntryModal(null);
        }}
        maxWidth="max-w-3xl"
      >
        {entryModal ? (
          <form onSubmit={submitEntry} className="space-y-5">
            {entryModal.kind === "stockIn" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label>
                  <span className={labelClass}>Date</span>
                  <input type="date" value={stockInForm.date} onChange={(event) => setStockInForm((prev) => ({ ...prev, date: event.target.value }))} className={inputClass} required />
                </label>
                <label>
                  <span className={labelClass}>STATUS</span>
                  <select value={stockInForm.status} onChange={(event) => setStockInForm((prev) => ({ ...prev, status: event.target.value }))} className={inputClass}>
                    {STOCK_IN_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="md:col-span-2 space-y-3 rounded-2xl border bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-black">Stock In Items</div>
                      <div className="text-xs text-gray-500">Type to search/select an item, or type a new item name.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStockInForm((prev) => ({ ...prev, items: [...prev.items, newStockInLine()] }))}
                      className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-gray-50"
                    >
                      Add Item
                    </button>
                  </div>
                  {stockInForm.items.map((line, index) => (
                    <div key={line.key} className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 md:grid-cols-[1fr_180px_140px_auto]">
                      <label>
                        <span className={labelClass}>Item {index + 1}</span>
                        <input
                          list="paraphernalia-item-options"
                          value={line.item}
                          onChange={(event) => updateStockInLine(line.key, { item: event.target.value })}
                          className={inputClass}
                          required
                        />
                      </label>
                      <label>
                        <span className={labelClass}>CONTROLNUMBER</span>
                        <input
                          value={line.controlNumber}
                          onChange={(event) => updateStockInLine(line.key, { controlNumber: event.target.value })}
                          className={inputClass}
                          placeholder={line.item ? nextControlNumber(line.item, index) : "Auto generated"}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Quantity</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={line.quantity}
                          onChange={(event) => updateStockInLine(line.key, { quantity: event.target.value })}
                          className={inputClass}
                          required
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeStockInLine(line.key)}
                          disabled={stockInForm.items.length <= 1}
                          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="md:col-span-2">
                  <span className={labelClass}>ATTACHMENT Text or URL</span>
                  <input value={stockInForm.attachment} onChange={(event) => setStockInForm((prev) => ({ ...prev, attachment: event.target.value }))} className={inputClass} placeholder="Type attachment notes or paste an existing file URL" />
                </label>
                <label className="md:col-span-2">
                  <span className={labelClass}>Upload Image/File Attachment</span>
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-3">
                    <Upload className="h-5 w-5 text-gray-500" />
                    <input type="file" onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} className="text-sm text-black" />
                    {attachmentFile ? <span className="text-xs text-gray-600">{attachmentFile.name}</span> : null}
                  </div>
                </label>
                <label>
                  <span className={labelClass}>DETACHMENT</span>
                  <input
                    list="paraphernalia-detachment-options"
                    value={stockInForm.detachment}
                    onChange={(event) => {
                      const detachment = event.target.value;
                      const matchedClient = clientNameForDetachment(detachment);
                      setStockInForm((prev) => ({ ...prev, detachment, clientName: matchedClient || prev.clientName }));
                    }}
                    className={inputClass}
                    placeholder="Select or type detachment"
                    required
                  />
                </label>
                <label>
                  <span className={labelClass}>Client Name for Custom Detachment</span>
                  <input
                    value={stockInForm.clientName}
                    onChange={(event) => setStockInForm((prev) => ({ ...prev, clientName: event.target.value }))}
                    className={inputClass}
                    placeholder="Optional"
                  />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label>
                  <span className={labelClass}>Date</span>
                  <input type="date" value={stockOutForm.date} onChange={(event) => setStockOutForm((prev) => ({ ...prev, date: event.target.value }))} className={inputClass} required />
                </label>
                <label>
                  <span className={labelClass}>Names</span>
                  <input value={stockOutForm.names} onChange={(event) => setStockOutForm((prev) => ({ ...prev, names: event.target.value }))} className={inputClass} required />
                </label>
                <div className="md:col-span-2 space-y-3 rounded-2xl border bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-black">Stock Out Items</div>
                      <div className="text-xs text-gray-500">Add multiple items and each line will affect the inventory balance.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStockOutForm((prev) => ({ ...prev, items: [...prev.items, newStockOutLine()] }))}
                      className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-gray-50"
                    >
                      Add Item
                    </button>
                  </div>
                  {stockOutForm.items.map((line, index) => (
                    <div key={line.key} className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 md:grid-cols-[1fr_180px_120px_140px_auto]">
                      <label>
                        <span className={labelClass}>ITEMS {index + 1}</span>
                        <input
                          list="paraphernalia-item-options"
                          value={line.item}
                          onChange={(event) => updateStockOutLine(line.key, { item: event.target.value })}
                          className={inputClass}
                          required
                        />
                      </label>
                      <label>
                        <span className={labelClass}>CONTROLNUMBER</span>
                        <input
                          value={line.controlNumber}
                          onChange={(event) => updateStockOutLine(line.key, { controlNumber: event.target.value })}
                          className={inputClass}
                          placeholder={line.item ? nextControlNumber(line.item, index) : "Auto generated"}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>QTY</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={line.quantity}
                          onChange={(event) => updateStockOutLine(line.key, { quantity: event.target.value })}
                          className={inputClass}
                          required
                        />
                      </label>
                      <label>
                        <span className={labelClass}>PRICE</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.price}
                          onChange={(event) => updateStockOutLine(line.key, { price: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeStockOutLine(line.key)}
                          disabled={stockOutForm.items.length <= 1}
                          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label>
                  <span className={labelClass}>STATUS</span>
                  <select value={stockOutForm.status} onChange={(event) => setStockOutForm((prev) => ({ ...prev, status: event.target.value }))} className={inputClass}>
                    {STOCK_OUT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Date Posted</span>
                  <input type="date" value={stockOutForm.datePosted} onChange={(event) => setStockOutForm((prev) => ({ ...prev, datePosted: event.target.value }))} className={inputClass} />
                </label>
                <label>
                  <span className={labelClass}>DETACHMENT / Specific Area</span>
                  <input
                    list="paraphernalia-detachment-options"
                    value={stockOutForm.detachment}
                    onChange={(event) => {
                      const detachment = event.target.value;
                      const matchedClient = clientNameForDetachment(detachment);
                      setStockOutForm((prev) => ({ ...prev, detachment, clientName: matchedClient || prev.clientName }));
                    }}
                    className={inputClass}
                    placeholder="Select or type detachment"
                    required
                  />
                </label>
                <label>
                  <span className={labelClass}>Client Name for Custom Detachment</span>
                  <input
                    value={stockOutForm.clientName}
                    onChange={(event) => setStockOutForm((prev) => ({ ...prev, clientName: event.target.value }))}
                    className={inputClass}
                    placeholder="Optional"
                  />
                </label>
              </div>
            )}

            {saving ? <LoadingCircle label={attachmentFile ? "Uploading and saving..." : "Saving..."} sizeClassName="h-6 w-6" className="py-2" /> : null}

            <div className="flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setEntryModal(null)} className="rounded-xl border bg-white px-4 py-2 text-sm text-black hover:bg-gray-50 disabled:opacity-60">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:opacity-60">
                {saving ? "Saving..." : entryModal.mode === "edit" ? "Save Changes" : "Create Record"}
              </button>
            </div>
          </form>
        ) : null}
      </ModalShell>

      <ModalShell
        open={itemManagerOpen}
        title="Manage Paraphernalia Items"
        subtitle="These items appear in the typed ITEMS dropdown. Removing an item hides it from future selections but does not remove old stock records."
        onClose={() => {
          if (!itemBusy) setItemManagerOpen(false);
        }}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border bg-gray-50 p-4 md:grid-cols-[1fr_180px_auto]">
            <label>
              <span className={labelClass}>New Item Name</span>
              <input
                value={newItemName}
                onChange={(event) => setNewItemName(event.target.value)}
                className={inputClass}
                placeholder="Type item name"
              />
            </label>
            <label>
              <span className={labelClass}>Inventory Type</span>
              <select value={newItemCategory} onChange={(event) => setNewItemCategory(event.target.value as InventoryKind)} className={inputClass}>
                <option value="SEC">Sec Inv.</option>
                <option value="OFFICE">Office Supply Inv.</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void addItemOption()}
                disabled={itemBusy}
                className="w-full rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95 disabled:opacity-60"
              >
                {itemBusy ? "Saving..." : "Add Item"}
              </button>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-2xl border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#FFDA03] text-black">
                <tr>
                  <th className="px-4 py-3">ITEMS</th>
                  <th className="px-4 py-3">Inventory Type</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {displayItemOptions.map((item) => (
                  <tr key={`${item.item_id ?? item.item_name}-manager`}>
                    <td className="px-4 py-3 font-medium text-black">{item.item_name}</td>
                    <td className="px-4 py-3 text-gray-700">{item.item_category === "OFFICE" ? "Office Supply Inv." : "Sec Inv."}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void removeItemOption(item)}
                        disabled={itemBusy}
                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(deleteState)}
        title="Confirm Delete"
        subtitle={deleteState ? `Delete ${deleteState.label}? This will update the computed inventory balance immediately.` : undefined}
        onClose={() => {
          if (!deleting) setDeleteState(null);
        }}
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <button type="button" disabled={deleting} onClick={() => setDeleteState(null)} className="rounded-xl border bg-white px-4 py-2 text-sm text-black hover:bg-gray-50 disabled:opacity-60">
            Cancel
          </button>
          <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </ModalShell>

      <SpreadsheetImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Paraphernalia Stock"
        description="Upload the template as Excel or CSV. Section accepts Stock In or Stock Out."
        allowTemplateDownloads={canDownloadTemplate}
        templateFileName="paraphernalia_stock_import_template"
        templateSampleData={{
          section: "Stock In",
          date: "2026-05-30",
          status: "RE-STOCKED",
          item: "CIGNUS",
          controlnumber: "CIG-2026-0001",
          quantity: 1,
          attachment: "Optional text or URL",
          detachment: "Sample Detachment",
          client_name: "Sample Client",
          names: "Required for Stock Out only",
          price: 0,
          date_posted: "2026-05-30",
        }}
        previewColumns={["Paraphernalia Row"]}
        parseRow={parseParaphernaliaImportRow}
        onImport={handleParaphernaliaImport}
      />

      <ImportSummaryModal
        open={importSummaryOpen}
        summary={importSummary}
        title="Paraphernalia Import Summary"
        onClose={() => setImportSummaryOpen(false)}
      />

      {renderViewAllModal()}
    </div>
  );
}
