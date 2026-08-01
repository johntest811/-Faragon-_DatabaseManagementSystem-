"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, Maximize2, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess, useMyModuleAccess, useMyParaphernaliaDetachmentAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import SpreadsheetImportModal from "@/app/Components/SpreadsheetImportModal";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import { addBrandedPdfHeader, buildBrandedAoa, buildBrandedWorkbookBuffer } from "../Components/exportBranding";
import {
  EQUIPMENT_GROUPS,
  EquipmentGroup,
  equipmentGroupForName,
  paraphernaliaKindForGroup,
} from "../Components/equipmentCatalog";
import * as XLSX from "xlsx";

type InventoryKind = "SEC" | "OFFICE";
type EntryKind = "stockIn" | "stockOut";
type EntryMode = "create" | "edit";
type ViewAllKind =
  | EntryKind
  | "secInventory"
  | "officeInventory"
  | "mainSecurityInventory"
  | "mainOfficeInventory"
  | "mainStockIn"
  | "mainTransfer";
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
  item_group: EquipmentGroup;
  display_order: number | null;
  unit_price: number;
};

type EmployeeOption = {
  applicant_id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  extn_name: string | null;
  detachment: string | null;
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

type MainInventoryRow = {
  id: string;
  item: string;
  category: InventoryKind;
  group: EquipmentGroup;
  unitPrice: number;
  stockIn: number;
  stockOut: number;
  stockBalance: number;
  inventoryValue: number;
};

type StockInLineForm = {
  key: string;
  item: string;
  quantity: string;
};

type StockOutLineForm = {
  key: string;
  item: string;
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
  | { kind: "stockIn"; mode: EntryMode; row?: StockInRow; transfer?: boolean }
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
  return { key: makeLineKey(), item: "", quantity: "" };
}

function newStockOutLine(): StockOutLineForm {
  return { key: makeLineKey(), item: "", quantity: "", price: "" };
}

const STOCK_IN_STATUSES = ["RE-STOCKED", "PENDING", "CANCELLED"] as const;
const STOCK_OUT_STATUSES = ["POSTED", "UNPOSTED", "NEW GUARD", "RETURN", "FREE", "VERIFY", "PAID"] as const;

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
  status: "",
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
  { no: 63, group: "Office Equipment", item: "SYSTEM UNIT", category: "OFFICE" },
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
const FARAGON_MAIN_LOGISTICS = "FARAGON MAIN LOGISTICS";

function safeText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    const message = String(value.message ?? "").trim();
    const code = String(value.code ?? "").trim();
    const details = String(value.details ?? "").trim();
    const hint = String(value.hint ?? "").trim();
    if (message) {
      return [code ? `[${code}] ${message}` : message, details, hint].filter(Boolean).join(" ");
    }
  }
  return fallback;
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isFaragonDetachment(value: unknown) {
  const key = normalizeKey(value);
  return key === "faragon" || key === normalizeKey(FARAGON_MAIN_LOGISTICS);
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

function formatEmployeeName(employee: EmployeeOption) {
  const lastName = safeText(employee.last_name, "");
  const givenNames = [employee.first_name, employee.middle_name, employee.extn_name]
    .map((value) => safeText(value, ""))
    .filter(Boolean)
    .join(" ");
  return [lastName, givenNames].filter(Boolean).join(", ").toUpperCase();
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
  fullScreen = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  fullScreen?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-2 md:p-4" onClick={onClose}>
      <div
        className={`flex w-full flex-col overflow-hidden border border-[#e8dfc8] bg-white shadow-2xl ${
          fullScreen
            ? "h-[calc(100vh-1rem)] max-w-none rounded-2xl md:h-[calc(100vh-2rem)]"
            : `${maxWidth} max-h-[90vh] rounded-3xl`
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-[#eadcae] bg-[#fff9e6] px-5 py-4 md:px-7">
          <div>
            <div className="text-xl font-bold text-black md:text-2xl">{title}</div>
            {subtitle ? <div className="mt-1 text-base leading-6 text-gray-700">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border-2 border-slate-300 bg-white px-5 py-2.5 text-base font-semibold text-black hover:bg-gray-50">
            Close
          </button>
        </div>
        <div className={`overflow-auto p-4 md:p-6 ${fullScreen ? "min-h-0 flex-1" : "max-h-[78vh]"}`}>{children}</div>
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
    <TableZoomWrapper storageKey={`paraphernalia-80:${storageKey}`} defaultZoom={0.8}>
      <div className={`overflow-auto rounded-2xl border-2 border-slate-200 bg-white shadow-sm ${previewLimit ? "max-h-[360px]" : ""}`}>
        <table className="min-w-full text-left text-base">
          <thead className="sticky top-0 z-10 bg-[#FFDA03] text-black shadow-sm">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-5 py-4 text-sm font-extrabold uppercase tracking-wide ${column.className ?? ""}`}>
                  {column.header}
                </th>
              ))}
              {actions ? <th className="whitespace-nowrap px-5 py-4 text-right text-sm font-extrabold uppercase tracking-wide">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8">
                  <LoadingCircle label="Loading paraphernalia records..." />
                </td>
              </tr>
            ) : displayRows.length ? (
              displayRows.map((row, rowIndex) => (
                <tr key={rowKey(row)} className={`${rowIndex % 2 ? "bg-slate-50/80" : "bg-white"} transition-colors hover:bg-[#fff8da]`}>
                  {columns.map((column) => (
                    <td key={column.key} className={`px-5 py-4 align-top font-medium leading-6 text-slate-800 ${column.className ?? ""}`}>
                      {column.render(row)}
                    </td>
                  ))}
                  {actions ? <td className="px-5 py-4 text-right align-top">{actions(row)}</td> : null}
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
      {onViewAll && rows.length > 0 ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-5 py-3 text-base font-bold text-black shadow-sm hover:bg-slate-50"
          >
            <Maximize2 className="h-5 w-5" />
            View full table ({rows.length})
          </button>
        </div>
      ) : null}
    </TableZoomWrapper>
  );
}

function SearchDropdownInput({
  value,
  onChange,
  options,
  className,
  placeholder,
  required,
  emptyLabel = "No matching options found.",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className: string;
  placeholder?: string;
  required?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const updateCoords = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener("resize", updateCoords);
      window.addEventListener("scroll", updateCoords, true);
      return () => {
        window.removeEventListener("resize", updateCoords);
        window.removeEventListener("scroll", updateCoords, true);
      };
    }
  }, [open, updateCoords]);

  const query = value.trim().toLowerCase();
  const filteredOptions = options
    .filter((option) => !query || option.toLowerCase().includes(query))
    .slice(0, 60);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateCoords();
          setOpen(true);
        }}
        onFocus={() => {
          updateCoords();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={listboxId}
              role="listbox"
              style={{
                position: "absolute",
                top: `${coords.top + 4}px`,
                left: `${coords.left}px`,
                width: `${coords.width}px`,
                zIndex: 999999,
              }}
              className="max-h-56 overflow-y-auto rounded-xl border-2 border-slate-200 bg-white p-1 shadow-2xl"
            >
              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={option === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-black hover:bg-[#fff3b0]"
                  >
                    {option}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500">{emptyLabel}</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default function ParaphernaliaPage() {
  const { role } = useAuthRole();
  const { canAccess: canAccessParaphernalia } = useMyModuleAccess("paraphernalia");
  const { allowedColumns, restricted } = useMyColumnAccess("paraphernalia");
  const detachmentAccess = useMyParaphernaliaDetachmentAccess();
  const isAdmin = role === "admin" || role === "superadmin";
  const canManageInventory = !detachmentAccess.restricted && (isAdmin || detachmentAccess.faragonAccess);
  const canViewPermission = useCallback(
    (columnKey: string) => detachmentAccess.faragonAccess || !restricted || allowedColumns.has(columnKey),
    [allowedColumns, detachmentAccess.faragonAccess, restricted]
  );
  const canExport = canManageInventory && canViewPermission("export_file");
  const canImport = canManageInventory && canViewPermission("import_file");
  const canDownloadTemplate = canManageInventory && canViewPermission("export_template");
  const canCreateStockIn =
    canManageInventory && (canViewPermission("add_stock_in") || canViewPermission("stock_in_item"));
  const canCreateStockOut =
    (canManageInventory || detachmentAccess.restricted) &&
    detachmentAccess.canStockOut &&
    (canViewPermission("add_stock_out") || canViewPermission("stock_out_items"));
  const canViewStockInHistory = [
    "stock_in_timestamp",
    "stock_in_date",
    "stock_in_status",
    "stock_in_item",
    "stock_in_quantity",
    "stock_in_attachment",
  ].some(canViewPermission);
  const canViewInventorySections = [
    "inventory_client_name",
    "inventory_items",
    "inventory_stock_balance",
    "inventory_stock_in",
    "inventory_stock_out",
  ].some(canViewPermission);
  const canViewStockOutHistory = [
    "stock_out_timestamp",
    "stock_out_date",
    "stock_out_names",
    "stock_out_items",
    "stock_out_qty",
    "stock_out_price",
    "stock_out_status",
    "stock_out_date_posted",
  ].some(canViewPermission);

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
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [selectedDetachment, setSelectedDetachment] = useState("ALL");
  const [manualDetachmentTables, setManualDetachmentTables] = useState<string[]>([]);
  const [newDetachmentTable, setNewDetachmentTable] = useState("");
  const [itemManagerOpen, setItemManagerOpen] = useState(false);
  const [itemBusy, setItemBusy] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemGroup, setNewItemGroup] = useState<EquipmentGroup>("Security / Safety");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [itemPriceDrafts, setItemPriceDrafts] = useState<Record<string, string>>({});
  const [itemManagerSearch, setItemManagerSearch] = useState("");
  const [itemManagerError, setItemManagerError] = useState("");
  const [itemManagerMessage, setItemManagerMessage] = useState("");

  const [entryModal, setEntryModal] = useState<EntryModalState>(null);
  const [stockInForm, setStockInForm] = useState<StockInForm>(EMPTY_STOCK_IN_FORM);
  const [stockOutForm, setStockOutForm] = useState<StockOutForm>(EMPTY_STOCK_OUT_FORM);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [viewAllState, setViewAllState] = useState<ViewAllState>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>(null);
  const [detachmentTableToRemove, setDetachmentTableToRemove] = useState<string | null>(null);
  const [removingDetachmentTable, setRemovingDetachmentTable] = useState(false);
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

  const [removedItemNames, setRemovedItemNames] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("removed_paraphernalia_items");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const displayItemOptions = useMemo<ItemOption[]>(() => {
    const fromDb = itemOptions.filter((item) => safeText(item.item_name, "") !== "");
    let baseItems: ItemOption[] = [];
    if (fromDb.length) {
      baseItems = fromDb.slice().sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.item_name.localeCompare(b.item_name));
    } else {
      baseItems = ITEM_CATALOG.map((item) => ({
        item_id: null,
        item_name: item.item,
        item_category: item.category,
        item_group: equipmentGroupForName(item.item),
        display_order: item.no,
        unit_price: 0,
      }));
    }

    return baseItems.filter((item) => !removedItemNames.has(normalizeItem(item.item_name)));
  }, [itemOptions, removedItemNames]);

  const itemCategoryByName = useMemo(() => {
    const map = new Map<string, InventoryKind>();
    for (const item of displayItemOptions) {
      map.set(normalizeItem(item.item_name), item.item_category);
    }
    return map;
  }, [displayItemOptions]);

  const itemGroupByName = useMemo(() => {
    const map = new Map<string, EquipmentGroup>();
    for (const item of displayItemOptions) {
      map.set(normalizeItem(item.item_name), item.item_group);
    }
    return map;
  }, [displayItemOptions]);

  const itemPriceByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of displayItemOptions) map.set(normalizeItem(item.item_name), item.unit_price);
    return map;
  }, [displayItemOptions]);

  useEffect(() => {
    setItemPriceDrafts(
      Object.fromEntries(displayItemOptions.map((item) => [item.item_id ?? item.item_name, String(item.unit_price)]))
    );
  }, [displayItemOptions]);

  const managedItemOptions = useMemo(() => {
    const query = itemManagerSearch.trim().toLowerCase();
    if (!query) return displayItemOptions;
    return displayItemOptions.filter((item) =>
      [item.item_name, item.item_group, item.item_category, item.unit_price].join(" ").toLowerCase().includes(query)
    );
  }, [displayItemOptions, itemManagerSearch]);

  const resolveItemCategory = useCallback((itemName: unknown): InventoryKind => {
    return itemCategoryByName.get(normalizeItem(itemName)) ?? defaultItemCategory(itemName);
  }, [itemCategoryByName]);

  const resolveClientName = useCallback((contractId: string | null | undefined, area: string | null | undefined, fallback: string | null | undefined) => {
    const fromId = contractId ? contractById.get(contractId) : null;
    const fromArea = area ? contractByArea.get(normalizeKey(area)) : null;
    return safeText(fallback, "") || safeText(fromId?.client_name, "") || safeText(fromArea?.client_name, "") || "Unassigned Client";
  }, [contractByArea, contractById]);

  const resolveSpecificArea = useCallback((contractId: string | null | undefined, area: string | null | undefined) => {
    const fromId = contractId ? contractById.get(contractId) : null;
    const fromArea = area ? contractByArea.get(normalizeKey(area)) : null;
    return safeText(area, "") || safeText(fromId?.specific_area, "") || safeText(fromArea?.specific_area, "") || "Unassigned Detachment";
  }, [contractByArea, contractById]);

  const detachmentOptions = useMemo(() => {
    const map = new Map<string, string>();

    function add(value: unknown) {
      const text = safeText(value, "");
      const key = normalizeKey(text);
      if (key && !map.has(key)) map.set(key, text);
    }

    for (const contract of contractOptions) add(contract.specific_area);

    const values = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    if (!detachmentAccess.restricted) return values;
    const allowedKeys = new Set(Array.from(detachmentAccess.allowedDetachments, normalizeKey));
    return values.filter((value) => allowedKeys.has(normalizeKey(value)));
  }, [
    contractOptions,
    detachmentAccess.allowedDetachments,
    detachmentAccess.restricted,
  ]);

  const creatableDetachmentOptions = useMemo(() => {
    const existingKeys = new Set(manualDetachmentTables.map(normalizeKey));
    return detachmentOptions.filter((detachment) => !existingKeys.has(normalizeKey(detachment)));
  }, [detachmentOptions, manualDetachmentTables]);
  const canCreateSelectedDetachment = creatableDetachmentOptions.some(
    (detachment) => normalizeKey(detachment) === normalizeKey(newDetachmentTable)
  );

  const stockOutEmployeeOptions = useMemo(() => {
    return employeeOptions
      .slice()
      .sort((a, b) => formatEmployeeName(a).localeCompare(formatEmployeeName(b)));
  }, [employeeOptions]);

  const itemDropdownOptions = useMemo(
    () => displayItemOptions.map((item) => item.item_name),
    [displayItemOptions]
  );
  const stockOutEmployeeNames = useMemo(
    () => stockOutEmployeeOptions.map((employee) => formatEmployeeName(employee)),
    [stockOutEmployeeOptions]
  );

  useEffect(() => {
    if (!detachmentAccess.restricted || detachmentAccess.loading) return;
    const currentIsAllowed = detachmentOptions.some((value) => normalizeKey(value) === normalizeKey(selectedDetachment));
    if (!currentIsAllowed) setSelectedDetachment(detachmentOptions[0] ?? "ALL");
  }, [detachmentAccess.loading, detachmentAccess.restricted, detachmentOptions, selectedDetachment]);

  useEffect(() => {
    writeStoredDetachmentTables(manualDetachmentTables);
  }, [manualDetachmentTables]);

  function clientNameForDetachment(detachment: string) {
    return safeText(contractByArea.get(normalizeKey(detachment))?.client_name, "");
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

      const employeesRes = await supabase
        .from("applicants")
        .select("applicant_id, first_name, middle_name, last_name, extn_name, detachment, status, is_archived, is_trashed")
        .eq("is_archived", false)
        .eq("is_trashed", false)
        .limit(5000);
      if (employeesRes.error) throw employeesRes.error;
      setEmployeeOptions(
        ((employeesRes.data ?? []) as Array<Record<string, unknown>>)
          .filter((row) => normalizeKey(row.status) === "active")
          .map((row) => ({
            applicant_id: String(row.applicant_id ?? ""),
            first_name: row.first_name == null ? null : String(row.first_name),
            middle_name: row.middle_name == null ? null : String(row.middle_name),
            last_name: row.last_name == null ? null : String(row.last_name),
            extn_name: row.extn_name == null ? null : String(row.extn_name),
            detachment: row.detachment == null ? null : String(row.detachment),
          }))
          .filter((row) => row.applicant_id && formatEmployeeName(row))
      );

      const itemsWide = await supabase
        .from("paraphernalia_items")
        .select("item_id, item_name, item_category, item_group, display_order, unit_price, is_active")
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
                item_group: equipmentGroupForName(row.item_name),
                display_order: null,
                unit_price: 0,
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
              item_group: EQUIPMENT_GROUPS.includes(String(row.item_group ?? "").trim() as EquipmentGroup)
                ? String(row.item_group).trim() as EquipmentGroup
                : equipmentGroupForName(row.item_name),
              display_order: toNumberOrNull(row.display_order),
              unit_price: toNumberOrNull(row.unit_price) ?? 0,
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
        const validAreaKeys = new Set(
          nextContracts
            .map((contract) => normalizeKey(contract.specific_area))
            .filter(Boolean)
        );
        const staleDbTables = dbDetachmentTables.filter((detachment) => !validAreaKeys.has(normalizeKey(detachment)));
        const validDbTables = dbDetachmentTables.filter((detachment) => validAreaKeys.has(normalizeKey(detachment)));
        const validStoredTables = readStoredDetachmentTables().filter((detachment) => validAreaKeys.has(normalizeKey(detachment)));
        const nextTables = mergeDetachmentTableNames(validStoredTables, validDbTables);

        writeStoredDetachmentTables(nextTables);
        setManualDetachmentTables(nextTables);

        if (staleDbTables.length) {
          const cleanupResult = await supabase
            .from("paraphernalia_detachment_tables")
            .delete()
            .in("detachment", staleDbTables);
          if (cleanupResult.error) {
            setSchemaWarning("Run SQL/supabase_paraphernalia_detachment_contract_areas.sql so obsolete detachment tables can be removed.");
          }
        }
      }

      const stockOutWide = await supabase
        .from("paraphernalia")
        .select("id_paraphernalia, names, items, quantity, price, date, timestamp, created_at, status, date_posted, contract_id, client_name, specific_area")
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
        .select("id_restock, timestamptz, date, status, item, quanitity, attachment, detachment, contract_id, client_name")
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
            quantity: toNumberOrNull(row.quanitity),
            attachment: row.attachment == null ? null : String(row.attachment),
            detachment: row.detachment == null ? null : String(row.detachment),
            contract_id: row.contract_id == null ? null : String(row.contract_id),
            client_name: row.client_name == null ? null : String(row.client_name),
          }))
          .filter((row) => row.id)
      );
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load paraphernalia data."));
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
      .on("postgres_changes", { event: "*", schema: "public", table: "applicants" }, () => void loadAll())
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
  }, [stockInRows, stockOutRows, resolveClientName, resolveItemCategory, resolveSpecificArea]);

  const mainInventoryRows = useMemo<MainInventoryRow[]>(() => {
    const rows = new Map<string, MainInventoryRow>();

    function ensureRow(itemName: unknown) {
      const item = normalizeItem(itemName);
      if (!item) return null;
      const existing = rows.get(item);
      if (existing) return existing;
      const unitPrice = itemPriceByName.get(item) ?? 0;
      const next: MainInventoryRow = {
        id: item,
        item,
        category: resolveItemCategory(item),
        group: itemGroupByName.get(item) ?? equipmentGroupForName(item),
        unitPrice,
        stockIn: 0,
        stockOut: 0,
        stockBalance: 0,
        inventoryValue: 0,
      };
      rows.set(item, next);
      return next;
    }

    for (const item of displayItemOptions) ensureRow(item.item_name);
    for (const row of stockInRows) {
      const target = ensureRow(row.item);
      if (!target) continue;
      const detachment = resolveSpecificArea(row.contract_id, row.detachment);
      const isUnassignedLegacyReceipt = !normalizeKey(row.detachment) && !row.contract_id;
      if (isUnassignedLegacyReceipt || isFaragonDetachment(detachment)) target.stockIn += row.quantity ?? 0;
      else target.stockOut += row.quantity ?? 0;
    }
    for (const row of stockOutRows) {
      const detachment = resolveSpecificArea(row.contract_id, row.specific_area);
      const isUnassignedLegacyIssue = !normalizeKey(row.specific_area) && !row.contract_id;
      if (!isUnassignedLegacyIssue && !isFaragonDetachment(detachment)) continue;
      const target = ensureRow(row.item);
      if (target) target.stockOut += row.quantity ?? 0;
    }

    return Array.from(rows.values())
      .map((row) => {
        const stockBalance = row.stockIn - row.stockOut;
        return { ...row, stockBalance, inventoryValue: stockBalance * row.unitPrice };
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));
  }, [displayItemOptions, itemGroupByName, itemPriceByName, resolveItemCategory, resolveSpecificArea, stockInRows, stockOutRows]);

  const q = search.trim().toLowerCase();
  const selectedDetachmentKey = normalizeKey(selectedDetachment);

  const isSelectedDetachment = useCallback((area: string) => {
    if (detachmentAccess.restricted) {
      const allowedKeys = new Set(Array.from(detachmentAccess.allowedDetachments, normalizeKey));
      if (!allowedKeys.has(normalizeKey(area))) return false;
    }
    if (!selectedDetachmentKey || selectedDetachmentKey === "all") return true;
    return normalizeKey(area) === selectedDetachmentKey;
  }, [detachmentAccess.allowedDetachments, detachmentAccess.restricted, selectedDetachmentKey]);

  const filteredMainInventory = useMemo(() => {
    if (!q) return mainInventoryRows;
    return mainInventoryRows.filter((row) =>
      [row.item, row.category, row.unitPrice, row.stockIn, row.stockOut, row.stockBalance]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [mainInventoryRows, q]);

  const filteredMainSecurityInventory = useMemo(
    () => filteredMainInventory.filter((row) => row.category === "SEC"),
    [filteredMainInventory]
  );

  const filteredMainOfficeInventory = useMemo(
    () => filteredMainInventory.filter((row) => row.category === "OFFICE"),
    [filteredMainInventory]
  );

  const mainInventoryTotals = useMemo(
    () => ({
      stockIn: mainInventoryRows.reduce((sum, row) => sum + row.stockIn, 0),
      stockOut: mainInventoryRows.reduce((sum, row) => sum + row.stockOut, 0),
      stockBalance: mainInventoryRows.reduce((sum, row) => sum + row.stockBalance, 0),
    }),
    [mainInventoryRows]
  );

  const filteredMainStockIn = useMemo(() => {
    return stockInRows.filter((row) => {
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      const isLegacyMainReceipt = !normalizeKey(row.detachment) && !row.contract_id;
      if (!isFaragonDetachment(area) && !isLegacyMainReceipt) return false;
      if (!q) return true;
      const clientName = resolveClientName(row.contract_id, row.detachment, row.client_name);
      return [row.timestamp, row.date, row.status, row.item, row.quantity, row.attachment, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [q, resolveClientName, resolveSpecificArea, stockInRows]);

  const filteredMainTransfers = useMemo(() => {
    return stockInRows.filter((row) => {
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      const isLegacyMainReceipt = !normalizeKey(row.detachment) && !row.contract_id;
      if (isFaragonDetachment(area) || isLegacyMainReceipt) return false;
      if (!q) return true;
      const clientName = resolveClientName(row.contract_id, row.detachment, row.client_name);
      return [row.timestamp, row.date, row.status, row.item, row.quantity, row.attachment, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [q, resolveClientName, resolveSpecificArea, stockInRows]);

  const scopedStockIn = useMemo(() => {
    return stockInRows.filter((row) => isSelectedDetachment(resolveSpecificArea(row.contract_id, row.detachment)));
  }, [stockInRows, isSelectedDetachment, resolveSpecificArea]);

  const scopedStockOut = useMemo(() => {
    return stockOutRows.filter((row) => isSelectedDetachment(resolveSpecificArea(row.contract_id, row.specific_area)));
  }, [stockOutRows, isSelectedDetachment, resolveSpecificArea]);

  const scopedInventoryRows = useMemo(() => {
    return inventoryRows.filter((row) => isSelectedDetachment(row.specificArea));
  }, [inventoryRows, isSelectedDetachment]);

  const filteredStockIn = useMemo(() => {
    if (!q) return scopedStockIn;
    return scopedStockIn.filter((row) => {
      const clientName = resolveClientName(row.contract_id, row.detachment, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      return [row.timestamp, row.date, row.status, row.item, row.quantity, row.attachment, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [scopedStockIn, q, resolveClientName, resolveSpecificArea]);

  const filteredStockOut = useMemo(() => {
    if (!q) return scopedStockOut;
    return scopedStockOut.filter((row) => {
      const clientName = resolveClientName(row.contract_id, row.specific_area, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.specific_area);
      return [row.timestamp, row.date, row.names, row.item, row.quantity, row.price, row.status, row.date_posted, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [scopedStockOut, q, resolveClientName, resolveSpecificArea]);

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

  const detachmentTableNavigation = useMemo(() => {
    const allowedKeys = new Set(Array.from(detachmentAccess.allowedDetachments, normalizeKey));
    const clientAreaKeys = new Set(contractOptions.map((contract) => normalizeKey(contract.specific_area)));
    const knownDetachmentTables = mergeDetachmentTableNames(manualDetachmentTables).filter(
      (detachment) => clientAreaKeys.has(normalizeKey(detachment))
    );
    const accessibleTables = detachmentAccess.restricted
      ? mergeDetachmentTableNames(
          knownDetachmentTables.filter((detachment) => allowedKeys.has(normalizeKey(detachment))),
          Array.from(detachmentAccess.allowedDetachments).filter((detachment) => clientAreaKeys.has(normalizeKey(detachment)))
        )
      : knownDetachmentTables;

    return accessibleTables.filter(
      (detachment) => safeText(detachment, "") !== "" && !isFaragonDetachment(detachment)
    );
  }, [contractOptions, detachmentAccess.allowedDetachments, detachmentAccess.restricted, manualDetachmentTables]);

  const paraphernaliaTableNavigation = useMemo(
    () => mergeDetachmentTableNames(
      !detachmentAccess.restricted ? [FARAGON_MAIN_LOGISTICS] : [],
      detachmentTableNavigation
    ),
    [detachmentAccess.restricted, detachmentTableNavigation]
  );

  const detachmentTableGroups = useMemo(() => {
    const candidateDetachments = (
      selectedDetachmentKey === "all"
        ? detachmentTableNavigation
        : detachmentTableNavigation.filter((detachment) => normalizeKey(detachment) === selectedDetachmentKey)
    );

    function stockInMatches(row: StockInRow, detachment: string) {
      if (normalizeKey(resolveSpecificArea(row.contract_id, row.detachment)) !== normalizeKey(detachment)) return false;
      if (!q) return true;
      const clientName = resolveClientName(row.contract_id, row.detachment, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.detachment);
      return [row.timestamp, row.date, row.status, row.item, row.quantity, row.attachment, area, clientName]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }

    function stockOutMatches(row: StockOutRow, detachment: string) {
      if (normalizeKey(resolveSpecificArea(row.contract_id, row.specific_area)) !== normalizeKey(detachment)) return false;
      if (!q) return true;
      const clientName = resolveClientName(row.contract_id, row.specific_area, row.client_name);
      const area = resolveSpecificArea(row.contract_id, row.specific_area);
      return [row.timestamp, row.date, row.names, row.item, row.quantity, row.price, row.status, row.date_posted, area, clientName]
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
    detachmentTableNavigation,
    stockInRows,
    stockOutRows,
    inventoryRows,
    q,
    contractByArea,
    selectedDetachmentKey,
    resolveClientName,
    resolveSpecificArea,
  ]);

  const stockInColumns = useMemo<ColumnDef<StockInRow>[]>(() => {
    const columns: ColumnDef<StockInRow>[] = [
      { key: "stock_in_timestamp", header: "Timestamp", render: (row) => formatDateTime(row.timestamp) },
      { key: "stock_in_date", header: "Date", render: (row) => safeText(row.date) },
      { key: "stock_in_status", header: "STATUS", render: (row) => <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{formatStockInStatus(row.status)}</span> },
      { key: "stock_in_item", header: "Item", render: (row) => safeText(row.item) },
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
  }, [canViewPermission]);

  const mainTransferColumns = useMemo<ColumnDef<StockInRow>[]>(() => [
    { key: "transfer_timestamp", header: "Timestamp", render: (row) => formatDateTime(row.timestamp) },
    { key: "transfer_date", header: "Date", render: (row) => safeText(row.date) },
    {
      key: "transfer_status",
      header: "STATUS",
      render: (row) => (
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {formatStockInStatus(row.status)}
        </span>
      ),
    },
    { key: "transfer_item", header: "Item", render: (row) => safeText(row.item) },
    { key: "transfer_quantity", header: "Quantity", render: (row) => formatNumber(row.quantity) },
    {
      key: "transfer_detachment",
      header: "Destination Detachment",
      render: (row) => resolveSpecificArea(row.contract_id, row.detachment),
    },
    {
      key: "transfer_client",
      header: "Client Name",
      render: (row) => resolveClientName(row.contract_id, row.detachment, row.client_name),
    },
    {
      key: "transfer_attachment",
      header: "ATTACHMENT",
      render: (row) => {
        const value = safeText(row.attachment);
        if (value === "-") return value;
        return /^https?:\/\//i.test(value) ? (
          <a href={value} target="_blank" rel="noreferrer" className="font-medium text-[#8B1C1C] underline">
            {makeAttachmentLabel(row.attachment)}
          </a>
        ) : value;
      },
    },
  ], [resolveClientName, resolveSpecificArea]);

  const stockOutColumns = useMemo<ColumnDef<StockOutRow>[]>(() => {
    const columns: ColumnDef<StockOutRow>[] = [
      { key: "stock_out_timestamp", header: "Timestamp", render: (row) => formatDateTime(row.timestamp) },
      { key: "stock_out_date", header: "Date", render: (row) => safeText(row.date) },
      { key: "stock_out_names", header: "Issued To (Last Name First)", render: (row) => safeText(row.names) },
      { key: "stock_out_items", header: "ITEMS", render: (row) => safeText(row.item) },
      { key: "stock_out_qty", header: "QTY", render: (row) => formatNumber(row.quantity) },
      { key: "stock_out_price", header: "PRICE", render: (row) => formatMoney(row.price) },
      { key: "stock_out_status", header: "STATUS", render: (row) => <span className="rounded-full bg-[#fff3b0] px-3 py-1 text-xs font-semibold text-[#6d4b00]">{safeText(row.status)}</span> },
      { key: "stock_out_date_posted", header: "Date Posted", render: (row) => safeText(row.date_posted) },
    ];
    return columns.filter((column) => canViewPermission(column.key));
  }, [canViewPermission]);

  const inventoryColumns = useMemo<ColumnDef<InventorySummaryRow>[]>(() => {
    const columns: ColumnDef<InventorySummaryRow>[] = [
      { key: "inventory_client_name", header: "Client Name", render: (row) => row.clientName },
      { key: "inventory_items", header: "ITEMS", render: (row) => row.item },
      { key: "inventory_stock_balance", header: "Stock Balance", render: (row) => formatNumber(row.stockBalance) },
      { key: "inventory_stock_in", header: "Stock In", render: (row) => formatNumber(row.stockIn) },
      { key: "inventory_stock_out", header: "Stock Out", render: (row) => formatNumber(row.stockOut) },
    ];
    return columns.filter((column) => canViewPermission(column.key));
  }, [canViewPermission]);

  const mainInventoryColumns = useMemo<ColumnDef<MainInventoryRow>[]>(() => {
    const columns: ColumnDef<MainInventoryRow>[] = [
      { key: "main_inventory_item", header: "ITEMS", render: (row) => row.item },
      { key: "main_inventory_category", header: "Equipment Category", render: (row) => row.group },
      { key: "main_inventory_unit_price", header: "Unit Price", render: (row) => formatMoney(row.unitPrice) },
      { key: "main_inventory_stock_in", header: "Total Stock In", render: (row) => formatNumber(row.stockIn) },
      { key: "main_inventory_stock_out", header: "Allocated / Issued", render: (row) => formatNumber(row.stockOut) },
      { key: "main_inventory_balance", header: "Available Stock", render: (row) => formatNumber(row.stockBalance) },
      { key: "main_inventory_value", header: "Inventory Value", render: (row) => formatMoney(row.inventoryValue) },
    ];
    return columns.filter((column) => canViewPermission(column.key));
  }, [canViewPermission]);

  function openCreate(
    kind: EntryKind,
    targetDetachment?: string,
    preferredInventoryKind?: InventoryKind,
    transfer = false
  ) {
    if (kind === "stockIn" && !canCreateStockIn) return;
    if (kind === "stockOut" && !canCreateStockOut) return;
    setError("");
    setInfoMessage("");
    setAttachmentFile(null);
    const defaultDetachment =
      targetDetachment ??
      (kind === "stockIn"
        ? FARAGON_MAIN_LOGISTICS
        : selectedDetachmentKey && selectedDetachmentKey !== "all"
          ? selectedDetachment
          : safeText(detachmentOptions[0], ""));
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
    setEntryModal(kind === "stockIn" ? { kind, mode: "create", transfer } : { kind, mode: "create" });
  }

  function openEditStockIn(row: StockInRow, transfer = false) {
    const detachment = resolveSpecificArea(row.contract_id, row.detachment);
    setAttachmentFile(null);
    setStockInForm({
      date: safeText(row.date, ""),
      status: formatStockInStatus(row.status),
      items: [{ key: makeLineKey(), item: normalizeItem(row.item), quantity: row.quantity == null ? "" : String(row.quantity) }],
      attachment: safeText(row.attachment, ""),
      detachment,
      clientName: resolveClientName(row.contract_id, detachment, row.client_name),
    });
    setEntryModal({ kind: "stockIn", mode: "edit", row, transfer });
  }

  function openEditStockOut(row: StockOutRow) {
    const detachment = resolveSpecificArea(row.contract_id, row.specific_area);
    setStockOutForm({
      date: safeText(row.date, ""),
      names: safeText(row.names, ""),
      items: [{ key: makeLineKey(), item: normalizeItem(row.item), quantity: row.quantity == null ? "" : String(row.quantity), price: row.price == null ? "" : String(row.price) }],
      status: safeText(row.status, "FREE").toUpperCase(),
      datePosted: safeText(row.date_posted, ""),
      detachment,
      clientName: resolveClientName(row.contract_id, detachment, row.client_name),
    });
    setEntryModal({ kind: "stockOut", mode: "edit", row });
  }

  async function addDetachmentTable() {
    const requested = normalizeDetachmentName(newDetachmentTable);
    setError("");
    setInfoMessage("");
    const contract = contractByArea.get(normalizeKey(requested));
    const next = normalizeDetachmentName(contract?.specific_area);

    if (!next) {
      setError("Select an existing Specific Area from the Client contracts list.");
      return;
    }
    if (manualDetachmentTables.some((detachment) => normalizeKey(detachment) === normalizeKey(next))) {
      setError(`${next} already has an individual table.`);
      return;
    }

    const { error: saveError } = await supabase.from("paraphernalia_detachment_tables").upsert(
      {
        detachment: next,
        client_name: clientNameForDetachment(next) || null,
        is_active: true,
      },
      { onConflict: "detachment" }
    );

    if (saveError) {
      setError(getErrorMessage(saveError, "Unable to create the detachment table."));
      setSchemaWarning("Run SQL/supabase_paraphernalia_detachment_contract_areas.sql to enforce Client Specific Area tables.");
    } else {
      setManualDetachmentTables((prev) => {
        const merged = mergeDetachmentTableNames(prev, [next]);
        writeStoredDetachmentTables(merged);
        return merged;
      });
      setSelectedDetachment(next);
      setNewDetachmentTable("");
      setInfoMessage(`Individual table created for ${next}.`);
    }
  }

  async function removeDetachmentTable(detachment: string) {
    if (removingDetachmentTable) return;
    setRemovingDetachmentTable(true);
    setError("");
    setInfoMessage("");
    try {
      const { error: deleteError } = await supabase
        .from("paraphernalia_detachment_tables")
        .delete()
        .eq("detachment", detachment);

      if (deleteError) {
        setError(getErrorMessage(deleteError, "Unable to remove the detachment table."));
        setSchemaWarning("Run SQL/supabase_paraphernalia_detachment_contract_areas.sql so detachment table deletion is allowed.");
        setDetachmentTableToRemove(null);
        return;
      }

      setManualDetachmentTables((prev) => {
        const next = mergeDetachmentTableNames(prev).filter((value) => normalizeKey(value) !== normalizeKey(detachment));
        writeStoredDetachmentTables(next);
        return next;
      });
      if (normalizeKey(selectedDetachment) === normalizeKey(detachment)) {
        setSelectedDetachment("ALL");
      }
      setInfoMessage(`Individual table removed for ${detachment}.`);
      setDetachmentTableToRemove(null);
    } finally {
      setRemovingDetachmentTable(false);
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
    const unitPrice = toNumberOrNull(newItemPrice) ?? 0;
    if (!itemName) {
      setItemManagerError("Enter an item name before adding it.");
      return;
    }
    if (unitPrice < 0) {
      setItemManagerError("Enter a valid item price of zero or greater.");
      return;
    }

    setItemBusy(true);
    setItemManagerError("");
    setItemManagerMessage("");
    try {
      const { data, error: upsertError } = await supabase
        .from("paraphernalia_items")
        .upsert(
          {
            item_name: itemName,
            item_category: paraphernaliaKindForGroup(newItemGroup),
            item_group: newItemGroup,
            unit_price: unitPrice,
            display_order: displayItemOptions.length + 1,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "item_name" }
        )
        .select("item_id, item_name, item_category, item_group, display_order, unit_price")
        .single();

      if (upsertError) throw upsertError;

      const nextItem: ItemOption = {
        item_id: data?.item_id == null ? null : String(data.item_id),
        item_name: normalizeItem(data?.item_name ?? itemName),
        item_category: String(data?.item_category ?? paraphernaliaKindForGroup(newItemGroup)).toUpperCase() === "OFFICE" ? "OFFICE" : "SEC",
        item_group: EQUIPMENT_GROUPS.includes(String(data?.item_group ?? "").trim() as EquipmentGroup)
          ? String(data?.item_group).trim() as EquipmentGroup
          : newItemGroup,
        display_order: toNumberOrNull(data?.display_order),
        unit_price: toNumberOrNull(data?.unit_price) ?? unitPrice,
      };

      setItemOptions((prev) => {
        const withoutExisting = prev.filter((item) => normalizeItem(item.item_name) !== normalizeItem(nextItem.item_name));
        return [...withoutExisting, nextItem];
      });
      setNewItemName("");
      setNewItemPrice("");
      setNewItemGroup("Security / Safety");
      setItemManagerSearch("");
      setItemManagerMessage(`${nextItem.item_name} is now available in the item dropdown.`);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Unable to add item.");
      setItemManagerError(
        message.includes("42501") || message.toLowerCase().includes("row-level security")
          ? `${message} Run the latest Paraphernalia main inventory SQL migration to add the required RLS policy.`
          : message
      );
    } finally {
      setItemBusy(false);
    }
  }

  async function saveItemPrice(item: ItemOption) {
    if (!item.item_id) {
      setItemManagerError("Run the Paraphernalia SQL migration before saving catalog prices.");
      return;
    }
    const unitPrice = toNumberOrNull(itemPriceDrafts[item.item_id]);
    if (unitPrice == null || unitPrice < 0) {
      setItemManagerError(`Enter a valid price for ${item.item_name}.`);
      return;
    }

    setItemBusy(true);
    setItemManagerError("");
    setItemManagerMessage("");
    try {
      const { error: updateError } = await supabase
        .from("paraphernalia_items")
        .update({ unit_price: unitPrice, updated_at: new Date().toISOString() })
        .eq("item_id", item.item_id);
      if (updateError) throw updateError;
      setItemOptions((prev) => prev.map((row) => row.item_id === item.item_id ? { ...row, unit_price: unitPrice } : row));
      setItemManagerMessage(`${item.item_name} price updated.`);
    } catch (e: unknown) {
      setItemManagerError(getErrorMessage(e, "Unable to update item price."));
    } finally {
      setItemBusy(false);
    }
  }

  async function removeItemOption(item: ItemOption) {
    setItemBusy(true);
    setItemManagerError("");
    setItemManagerMessage("");
    try {
      const normalizedName = normalizeItem(item.item_name);

      if (item.item_id) {
        const softDelete = await supabase.from("paraphernalia_items").update({ is_active: false }).eq("item_id", item.item_id);
        if (softDelete.error) {
          await supabase.from("paraphernalia_items").delete().eq("item_id", item.item_id);
        }
      }
      await supabase.from("paraphernalia_items").update({ is_active: false }).eq("item_name", normalizedName);
      await supabase.from("paraphernalia_items").delete().eq("item_name", normalizedName);

      setItemOptions((prev) => prev.filter((row) => normalizeItem(row.item_name) !== normalizedName && row.item_id !== item.item_id));

      setRemovedItemNames((prev) => {
        const next = new Set(prev);
        next.add(normalizedName);
        try {
          localStorage.setItem("removed_paraphernalia_items", JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
        return next;
      });

      setItemManagerMessage(`${item.item_name} was removed from future selections.`);
    } catch (e: unknown) {
      setItemManagerError(getErrorMessage(e, "Unable to remove item."));
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
    const itemGroup = equipmentGroupForName(normalized);

    const { error: upsertError } = await supabase.from("paraphernalia_items").upsert(
      {
        item_name: normalized,
        item_category: paraphernaliaKindForGroup(itemGroup),
        item_group: itemGroup,
        unit_price: 0,
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
        item_category: paraphernaliaKindForGroup(itemGroup),
        item_group: itemGroup,
        display_order: displayItemOptions.length + 1,
        unit_price: 0,
      },
    ]);
  }

  async function saveStockIn(mode: EntryMode, row?: StockInRow) {
    if (!canCreateStockIn) throw new Error("You do not have permission to add Stock In records.");
    const detachment = stockInForm.detachment.trim();
    const selectedContract = contractByArea.get(normalizeKey(detachment)) ?? null;
    const clientName = stockInForm.clientName.trim() || safeText(selectedContract?.client_name, "");
    const lines = stockInForm.items
      .map((line) => ({
        item: normalizeItem(line.item),
        quantity: toNumberOrNull(line.quantity),
      }))
      .filter((line) => line.item || line.quantity != null);

    if (!stockInForm.date.trim()) throw new Error("Date is required for Stock In.");
    if (!detachment) throw new Error("Detachment is required. You can select a contract Specific Area or type a new detachment.");
    if (!lines.length) throw new Error("Add at least one Stock In item.");
    if (lines.some((line) => !line.item)) throw new Error("Every Stock In line needs an item.");
    if (lines.some((line) => line.quantity == null || line.quantity <= 0)) throw new Error("Every Stock In quantity must be greater than zero.");

    if (!isFaragonDetachment(detachment)) {
      const requestedByItem = new Map<string, number>();
      for (const line of lines) requestedByItem.set(line.item, (requestedByItem.get(line.item) ?? 0) + (line.quantity ?? 0));
      for (const [item, requested] of requestedByItem) {
        let available = mainInventoryRows.find((inventoryRow) => inventoryRow.item === item)?.stockBalance ?? 0;
        const previousDetachment = row ? resolveSpecificArea(row.contract_id, row.detachment) : "";
        if (mode === "edit" && row && normalizeItem(row.item) === item) {
          const previousQuantity = row.quantity ?? 0;
          const previousWasMain = isFaragonDetachment(previousDetachment) || (!normalizeKey(row.detachment) && !row.contract_id);
          available += previousWasMain ? -previousQuantity : previousQuantity;
        }
        if (requested > available) {
          throw new Error(
            `${item} only has ${formatNumber(Math.max(available, 0))} available for allocation from FARAGON Main Inventory.`
          );
        }
      }
    }

    let attachment = stockInForm.attachment.trim() || null;
    if (attachmentFile) attachment = await uploadAttachmentFile(attachmentFile);

    for (const line of lines) await ensureItemOption(line.item);

    const payloads = lines.map((line) => ({
      date: stockInForm.date.trim(),
      status: stockInForm.status.trim().toUpperCase(),
      item: line.item,
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
    if (!canCreateStockOut && mode === "create") throw new Error("You do not have permission to add Stock Out records.");
    const detachment = stockOutForm.detachment.trim();
    if (detachmentAccess.restricted) {
      const allowedKeys = new Set(Array.from(detachmentAccess.allowedDetachments, normalizeKey));
      if (!allowedKeys.has(normalizeKey(detachment))) {
        throw new Error("You can only create Stock Out records for your assigned detachment.");
      }
    }
    const selectedContract = contractByArea.get(normalizeKey(detachment)) ?? null;
    const clientName = stockOutForm.clientName.trim() || safeText(selectedContract?.client_name, "");
    const lines = stockOutForm.items
      .map((line) => ({
        item: normalizeItem(line.item),
        quantity: toNumberOrNull(line.quantity),
        price: toNumberOrNull(line.price) ?? itemPriceByName.get(normalizeItem(line.item)) ?? 0,
      }))
      .filter((line) => line.item || line.quantity != null || line.price != null);

    if (!stockOutForm.date.trim()) throw new Error("Date is required for Stock Out.");
    if (!stockOutForm.names.trim()) throw new Error("Names is required for Stock Out.");
    if (!detachment) throw new Error("Detachment is required. You can select a contract Specific Area or type a new detachment.");
    if (!lines.length) throw new Error("Add at least one Stock Out item.");
    if (lines.some((line) => !line.item)) throw new Error("Every Stock Out line needs an item.");
    if (lines.some((line) => line.quantity == null || line.quantity <= 0)) throw new Error("Every Stock Out QTY must be greater than zero.");

    const requestedByItem = new Map<string, number>();
    for (const line of lines) requestedByItem.set(line.item, (requestedByItem.get(line.item) ?? 0) + (line.quantity ?? 0));
    const targetIsFaragon = isFaragonDetachment(detachment);
    for (const [item, requested] of requestedByItem) {
      const available = targetIsFaragon
        ? mainInventoryRows.find((inventoryRow) => inventoryRow.item === item)?.stockBalance ?? 0
        : inventoryRows.find(
            (inventoryRow) =>
              normalizeKey(inventoryRow.specificArea) === normalizeKey(detachment) && inventoryRow.item === item
          )?.stockBalance ?? 0;
      const previousDetachment = row ? resolveSpecificArea(row.contract_id, row.specific_area) : "";
      const editingAllowance =
        mode === "edit" &&
        row &&
        normalizeKey(previousDetachment) === normalizeKey(detachment) &&
        normalizeItem(row.item) === item
          ? row.quantity ?? 0
          : 0;
      if (requested > available + editingAllowance) {
        const inventoryName = targetIsFaragon ? "FARAGON Main Inventory" : `${detachment} inventory`;
        throw new Error(`${item} only has ${formatNumber(available + editingAllowance)} available in ${inventoryName}.`);
      }
    }

    for (const line of lines) await ensureItemOption(line.item);

    const payloads = lines.map((line) => ({
      date: stockOutForm.date.trim(),
      names: stockOutForm.names.trim(),
      items: line.item,
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
        if (entryModal.transfer) {
          const destination = normalizeDetachmentName(stockInForm.detachment);
          if (!destination || isFaragonDetachment(destination)) {
            throw new Error("Select a destination detachment other than FARAGON.");
          }
          const { error: destinationError } = await supabase.from("paraphernalia_detachment_tables").upsert(
            {
              detachment: destination,
              client_name: stockInForm.clientName.trim() || clientNameForDetachment(destination) || null,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "detachment" }
          );
          if (destinationError) throw destinationError;
          setManualDetachmentTables((prev) => mergeDetachmentTableNames(prev, [destination]));
        }
        await saveStockIn(entryModal.mode, entryModal.row);
        setInfoMessage(
          entryModal.transfer
            ? entryModal.mode === "edit"
              ? "Stock Out transfer updated. The destination inventory was updated automatically."
              : "Stock Out transfer created. The destination inventory was updated automatically."
            : entryModal.mode === "edit"
              ? "Stock In record updated."
              : "Stock In record created."
        );
      } else {
        await saveStockOut(entryModal.mode, entryModal.row);
        setInfoMessage(entryModal.mode === "edit" ? "Stock Out record updated." : "Stock Out record created.");
      }

      setEntryModal(null);
      setAttachmentFile(null);
      await loadAll();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Unable to save paraphernalia record."));
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
      setError(getErrorMessage(e, "Unable to delete record."));
    } finally {
      setDeleting(false);
    }
  }

  function parseParaphernaliaImportRow(row: Record<string, unknown>) {
    const section = normalizeKey(pickByAliases(row, ["section", "type", "record type", "transaction"]));
    const kind: EntryKind =
      section.includes("out") || section.includes("issued") || section.includes("release")
        ? "stockOut"
        : "stockIn";
    const item = normalizeItem(pickByAliases(row, ["item", "items", "equipment"]));
    const detachment = normalizeDetachmentName(pickByAliases(row, ["detachment", "specific area", "area"]));
    const date = pickByAliases(row, ["date", "transaction date"]).trim();
    const quantity = toNumberOrNull(pickByAliases(row, ["quantity", "qty", "quanitity"]));
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
          quantity,
          price: toNumberOrNull(pickByAliases(row, ["price", "unit price", "amount"])) ?? itemPriceByName.get(item) ?? 0,
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
        const parsed = parseParaphernaliaImportRow(row);
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
      stockInByKey.set(`row:${normalizeKey(row.date)}|${normalizeKey(area)}|${normalizeItem(row.item)}|${normalizeKey(row.status)}`, row.id);
    }

    const stockOutByKey = new Map<string, string>();
    for (const row of stockOutRows) {
      const area = resolveSpecificArea(row.contract_id, row.specific_area);
      stockOutByKey.set(`row:${normalizeKey(row.date)}|${normalizeKey(area)}|${normalizeItem(row.item)}|${normalizeKey(row.names)}`, row.id);
    }

    let inserted = 0;
    let updated = 0;
    const deduped = new Map<string, Record<string, unknown>>();
    for (const payload of parsedRows) {
      const kind = String(payload.__kind);
      const area = kind === "stockIn" ? normalizeKey(payload.detachment) : normalizeKey(payload.specific_area);
      const item = normalizeItem(kind === "stockIn" ? payload.item : payload.items);
      const identity = `${normalizeKey(payload.date)}|${area}|${item}|${normalizeKey(kind === "stockIn" ? payload.status : payload.names)}`;
      const key = `${kind}:${identity}`;
      if (deduped.has(key)) skipped += 1;
      deduped.set(key, payload);
    }

    for (const [key, payload] of deduped.entries()) {
      const kind = payload.__kind as EntryKind;
      const dbPayload = { ...payload };
      delete dbPayload.__kind;
      const rowKey =
        kind === "stockIn"
          ? `row:${normalizeKey(payload.date)}|${normalizeKey(payload.detachment)}|${normalizeItem(payload.item)}|${normalizeKey(payload.status)}`
          : `row:${normalizeKey(payload.date)}|${normalizeKey(payload.specific_area)}|${normalizeItem(payload.items)}|${normalizeKey(payload.names)}`;
      const id = kind === "stockIn"
        ? stockInByKey.get(rowKey)
        : stockOutByKey.get(rowKey);

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

  function mainInventoryExportRows(rows: MainInventoryRow[]) {
    return rows.map((row) => ({
      Items: row.item,
      "Equipment Category": row.group,
      "Unit Price": row.unitPrice,
      "Total Stock In": row.stockIn,
      "Total Stock Out": row.stockOut,
      "Available Stock": row.stockBalance,
      "Inventory Value": row.inventoryValue,
    }));
  }

  async function exportXlsx() {
    if (!canExport) return;
    const out = await buildBrandedWorkbookBuffer([
      {
        name: "MainInventory",
        title: "FARAGON Main Inventory",
        subtitle: "Central stock availability and catalog prices",
        rows: mainInventoryExportRows(filteredMainInventory),
      },
      {
        name: "StockIn",
        title: "FARAGON Paraphernalia Stock In",
        subtitle: "Restocks received by FARAGON Main Inventory",
        rows: stockInExportRows(filteredMainStockIn),
      },
      {
        name: "MainTransfers",
        title: "Paraphernalia Stock Out to Detachments",
        subtitle: "FARAGON allocations that become Stock In at each destination detachment",
        rows: stockInExportRows(filteredMainTransfers),
      },
      {
        name: "StockOut",
        title: "Paraphernalia Stock Out",
        subtitle: "Stock-out records grouped through Client contract Specific Area",
        rows: stockOutExportRows(filteredStockOut),
      },
      {
        name: "SecInventory",
        title: "Security Inventory",
        subtitle: "Security inventory balance from Stock In minus Stock Out",
        rows: inventoryExportRows(filteredSecInventory),
      },
      {
        name: "OfficeSupplyInv",
        title: "Office Supply Inventory",
        subtitle: "Office supply inventory balance from Stock In minus Stock Out",
        rows: inventoryExportRows(filteredOfficeInventory),
      },
    ]);
    downloadBlob(`paraphernalia_stock_${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  function exportCsv() {
    if (!canExport) return;
    const rows = [
      ...mainInventoryExportRows(filteredMainInventory).map((row) => ({ Section: "FARAGON Main Inventory", ...row })),
      ...stockInExportRows(filteredMainStockIn).map((row) => ({ Section: "FARAGON Stock In", ...row })),
      ...stockInExportRows(filteredMainTransfers).map((row) => ({ Section: "Stock Out to Detachments", ...row })),
      ...stockOutExportRows(filteredStockOut).map((row) => ({ Section: "Stock Out", ...row })),
      ...inventoryExportRows(filteredSecInventory).map((row) => ({ Section: "Security Inventory", ...row })),
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

    addTable("FARAGON Main Inventory", mainInventoryExportRows(filteredMainInventory));
    addTable("FARAGON Paraphernalia Stock In", stockInExportRows(filteredMainStockIn));
    addTable("Paraphernalia Stock Out to Detachments", stockInExportRows(filteredMainTransfers));
    addTable("Paraphernalia Stock Out", stockOutExportRows(filteredStockOut));
    addTable("Security Inventory", inventoryExportRows(filteredSecInventory));
    addTable("Office Supply Inventory", inventoryExportRows(filteredOfficeInventory));
    doc.save(`paraphernalia_stock_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function renderActions(row: StockInRow | StockOutRow, kind: EntryKind, transfer = false) {
    if (!canManageInventory) return null;
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => (kind === "stockIn" ? openEditStockIn(row as StockInRow, transfer) : openEditStockOut(row as StockOutRow))}
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

    if (viewAllKind === "mainStockIn" || viewAllKind === "mainTransfer") {
      const isTransfer = viewAllKind === "mainTransfer";
      const rows = isTransfer ? filteredMainTransfers : filteredMainStockIn;
      return (
        <ModalShell
          open
          title={isTransfer ? "View All Paraphernalia Stock Out to Detachments" : "View All FARAGON Paraphernalia Stock In"}
          subtitle={
            isTransfer
              ? "Each transfer deducts FARAGON and increases the selected destination detachment."
              : "These records increase the FARAGON Main Inventory balance."
          }
          onClose={() => setViewAllState(null)}
        >
          <DataTable
            storageKey={isTransfer ? "paraphernalia-view-main-transfers" : "paraphernalia-view-main-stock-in"}
            columns={isTransfer ? mainTransferColumns : stockInColumns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={false}
            emptyLabel={isTransfer ? "No Stock Out transfers found." : "No FARAGON Stock In records found."}
            actions={canManageInventory ? (row) => renderActions(row, "stockIn", isTransfer) : undefined}
          />
        </ModalShell>
      );
    }

    if (viewAllKind === "mainSecurityInventory" || viewAllKind === "mainOfficeInventory") {
      const isOffice = viewAllKind === "mainOfficeInventory";
      const rows = isOffice ? filteredMainOfficeInventory : filteredMainSecurityInventory;
      return (
        <ModalShell
          open
          fullScreen
          title={`FARAGON ${isOffice ? "Office Supply" : "Security"} Inventory`}
          subtitle="Full inventory view. Use the table zoom controls or horizontal scroll when you need to inspect every column."
          onClose={() => setViewAllState(null)}
        >
          <DataTable
            storageKey={`paraphernalia-view-main-${isOffice ? "office" : "security"}-inventory`}
            columns={mainInventoryColumns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={false}
            emptyLabel={`No FARAGON ${isOffice ? "office supply" : "security"} inventory items found.`}
          />
        </ModalShell>
      );
    }

    const title =
      viewAllKind === "stockIn"
        ? "View All Paraphernalia Stock In"
        : viewAllKind === "stockOut"
          ? "View All Paraphernalia Stock Out"
          : viewAllKind === "secInventory"
            ? "View All Security Inventory"
            : "View All Office Supply Inventory";

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
        fullScreen={viewAllKind === "secInventory" || viewAllKind === "officeInventory"}
        title={detachment ? `${title}: ${detachment}` : title}
        subtitle={
          viewAllKind === "secInventory" || viewAllKind === "officeInventory"
            ? "Full inventory view. Records are grouped by Client Name for easier reading."
            : "Rows are segregated by the Client Name from the Client page contracts."
        }
        onClose={() => setViewAllState(null)}
      >
        {viewAllKind === "stockIn"
          ? groupedByClient(rows as StockInRow[], (row) => resolveClientName(row.contract_id, row.detachment, row.client_name)).map(([clientName, clientRows]) => (
              <div key={clientName} className="mb-8">
                <div className="mb-3 rounded-2xl border border-amber-200 bg-[#fff3b0] px-5 py-4 text-lg font-bold text-black">{clientName}</div>
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

  if (!canAccessParaphernalia) {
    return (
      <section className="glass-panel animate-fade-in rounded-3xl p-6 space-y-3">
        <div className="text-lg font-semibold text-black">Paraphernalia</div>
        <div className="text-sm text-gray-600">You do not have access to view this page.</div>
        <div className="pt-2">
          <button
            onClick={() => window.location.href = "/Main_Modules/Requests/?module=paraphernalia"}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:bg-[#EFCB00]"
          >
            Request Access
          </button>
        </div>
      </section>
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

          </div>
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {infoMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{infoMessage}</div> : null}
        {schemaWarning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{schemaWarning}</div> : null}
        {detachmentAccess.error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{detachmentAccess.error}</div> : null}

        <datalist id="paraphernalia-detachment-options">
          {detachmentOptions.map((detachment) => (
            <option key={detachment} value={detachment} />
          ))}
        </datalist>

        <section className="overflow-visible rounded-[2rem] border border-[#e5dcc7] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B1C1C]">Table Navigation</div>
              <h2 className="mt-1 text-xl font-bold text-black">Choose a detachment inventory</h2>
              <p className="mt-1 text-sm text-gray-600">Select one table to focus the page, or view every active table together.</p>
            </div>
            <div className="rounded-xl bg-[#fff9e6] px-3 py-2 text-sm font-semibold text-[#6d4b00]">
              {detachmentTableNavigation.length} detachment table{detachmentTableNavigation.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className={`mt-5 grid grid-cols-1 gap-4 ${canManageInventory ? "lg:grid-cols-2" : ""}`}>
            <label>
              <span className={labelClass}>Currently Viewing</span>
              <select
                value={selectedDetachment}
                onChange={(event) => setSelectedDetachment(event.target.value)}
                className={`${inputClass} min-h-11 bg-white`}
              >
                <option value="ALL">View All Tables</option>
                {paraphernaliaTableNavigation.map((detachment) => (
                  <option key={detachment} value={detachment}>
                    {isFaragonDetachment(detachment) ? "FARAGON Main Inventory" : detachment}
                  </option>
                ))}
              </select>
            </label>

            {canManageInventory ? (
              <div className="relative z-20">
                <span className={labelClass}>Create Individual Detachment Table</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <SearchDropdownInput
                      value={newDetachmentTable}
                      onChange={setNewDetachmentTable}
                      options={creatableDetachmentOptions}
                      className={`${inputClass} min-h-11`}
                      placeholder={creatableDetachmentOptions.length ? "Search Client Specific Area" : "All Client areas already have tables"}
                      emptyLabel="No available Client Specific Area matches your search."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void addDetachmentTable()}
                    disabled={!canCreateSelectedDetachment}
                    className="min-h-11 shrink-0 rounded-xl bg-[#FFDA03] px-5 py-2 text-sm font-bold text-black hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Create Table
                  </button>
                </div>
                <div className="mt-1.5 text-xs text-gray-500">Only Specific Areas saved on the Client page can be selected.</div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-amber-100 bg-[#fffdf5] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="text-sm font-bold text-black">Available Tables</div>
              <div className="text-xs text-gray-500">
                {selectedDetachmentKey === "all"
                  ? "All tables are visible below"
                  : `Filtered to ${isFaragonDetachment(selectedDetachment) ? "FARAGON Main Inventory" : selectedDetachment}`}
              </div>
            </div>

            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              <button
                type="button"
                onClick={() => setSelectedDetachment("ALL")}
                className={`flex min-h-14 items-center rounded-xl border-2 px-4 text-left text-sm font-bold transition ${
                  selectedDetachmentKey === "all"
                    ? "border-[#8B1C1C] bg-[#8B1C1C] text-white shadow-md"
                    : "border-amber-200 bg-white text-black hover:border-[#FFDA03] hover:bg-[#fff9e6]"
                }`}
              >
                View All Tables
              </button>

              {paraphernaliaTableNavigation.map((detachment) => {
                const isSelected = normalizeKey(detachment) === selectedDetachmentKey;
                const isFaragon = isFaragonDetachment(detachment);
                const label = isFaragon ? "FARAGON Main Inventory" : detachment;
                return (
                  <div
                    key={detachment}
                    className={`flex min-h-14 min-w-0 items-center rounded-xl border-2 transition ${
                      isSelected
                        ? "border-[#8B1C1C] bg-[#fff3b0] shadow-md"
                        : "border-amber-200 bg-white hover:border-[#FFDA03] hover:bg-[#fff9e6]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDetachment(detachment)}
                      className="min-w-0 flex-1 px-4 py-3 text-left text-sm font-bold text-black"
                      title={`View only ${label}`}
                    >
                      <span className="block truncate">{label}</span>
                    </button>
                    {canManageInventory && !isFaragon ? (
                      <button
                        type="button"
                        onClick={() => setDetachmentTableToRemove(detachment)}
                        className="mr-2 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-red-700 hover:bg-red-50"
                        title={`Remove ${detachment} table`}
                        aria-label={`Remove ${detachment} table`}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden 2xl:inline">Remove</span>
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {!paraphernaliaTableNavigation.length ? (
              <div className="mt-3 rounded-xl border border-dashed bg-white px-4 py-4 text-sm text-gray-600">
                No detachment table is available for this account. Create one from a Client Specific Area first.
              </div>
            ) : null}
          </div>
        </section>

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

        {!detachmentAccess.restricted && mainInventoryColumns.length && (selectedDetachmentKey === "all" || isFaragonDetachment(selectedDetachment)) ? (
          <section className="space-y-4 rounded-[2rem] border border-[#e5dcc7] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B1C1C]">Detachment Table</div>
                <h2 className="mt-1 text-2xl font-bold text-black">FARAGON Main Inventory</h2>
                <p className="mt-1 text-sm text-gray-500">Main Logistics stock supplies every detachment inventory.</p>
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
                {canViewPermission("manage_items") ? (
                  <button
                    type="button"
                    onClick={() => {
                      setItemManagerError("");
                      setItemManagerMessage("");
                      setItemManagerOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Manage Items
                  </button>
                ) : null}
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
                {canCreateStockIn ? (
                  <button
                    type="button"
                    onClick={() => openCreate("stockIn", FARAGON_MAIN_LOGISTICS)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B1C1C] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    <Plus className="h-4 w-4" />
                    Add FARAGON Stock In
                  </button>
                ) : null}
                {canCreateStockIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      const targetDetachment = detachmentOptions.find((detachment) => !isFaragonDetachment(detachment)) ?? "";
                      openCreate("stockIn", targetDetachment, undefined, true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                  >
                    <Plus className="h-4 w-4" />
                    Stock Out to Detachment
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs md:max-w-xl">
              <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
                <div className="font-semibold">FARAGON Stock In</div>
                <div className="text-base font-bold">{formatNumber(mainInventoryTotals.stockIn)}</div>
              </div>
              <div className="rounded-2xl bg-red-50 px-3 py-2 text-red-700">
                <div className="font-semibold">Allocated / Issued</div>
                <div className="text-base font-bold">{formatNumber(mainInventoryTotals.stockOut)}</div>
              </div>
              <div className="rounded-2xl bg-[#fff3b0] px-3 py-2 text-[#6d4b00]">
                <div className="font-semibold">Available</div>
                <div className="text-base font-bold">{formatNumber(mainInventoryTotals.stockBalance)}</div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">1</span>
                    <div>
                      <h3 className="text-xl font-bold text-black">Security Inventory</h3>
                      <p className="mt-1 text-base leading-6 text-gray-600">Security stock available for allocation to detachments.</p>
                    </div>
                  </div>
                </div>
                <DataTable
                  storageKey="paraphernalia-main-security-inventory"
                  columns={mainInventoryColumns}
                  rows={filteredMainSecurityInventory}
                  rowKey={(row) => row.id}
                  loading={loading}
                  emptyLabel="No FARAGON security inventory items found."
                  previewLimit={4}
                  onViewAll={() => setViewAllState({ kind: "mainSecurityInventory" })}
                />
              </div>
              <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">2</span>
                  <div>
                    <h3 className="text-xl font-bold text-black">Office Supply Inventory</h3>
                    <p className="mt-1 text-base leading-6 text-gray-600">Office supply stock available for allocation to detachments.</p>
                  </div>
                </div>
                <DataTable
                  storageKey="paraphernalia-main-office-inventory"
                  columns={mainInventoryColumns}
                  rows={filteredMainOfficeInventory}
                  rowKey={(row) => row.id}
                  loading={loading}
                  emptyLabel="No FARAGON office supply inventory items found."
                  previewLimit={4}
                  onViewAll={() => setViewAllState({ kind: "mainOfficeInventory" })}
                />
              </div>
            </div>
            <div className="space-y-6">
              <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">3</span>
                    <div>
                      <h3 className="text-xl font-bold text-black">Paraphernalia Stock In</h3>
                      <p className="mt-1 text-base leading-6 text-gray-600">Restocks received by FARAGON Main Inventory.</p>
                    </div>
                  </div>
                  {canCreateStockIn ? (
                    <button
                      type="button"
                      onClick={() => openCreate("stockIn", FARAGON_MAIN_LOGISTICS)}
                      className="rounded-xl bg-[#8B1C1C] px-5 py-3 text-base font-bold text-white hover:brightness-110"
                    >
                      Add Stock In
                    </button>
                  ) : null}
                </div>
                <DataTable
                  storageKey="paraphernalia-main-stock-in"
                  columns={stockInColumns}
                  rows={filteredMainStockIn}
                  rowKey={(row) => row.id}
                  loading={loading}
                  emptyLabel="No FARAGON Stock In records found."
                  actions={canManageInventory ? (row) => renderActions(row, "stockIn") : undefined}
                  previewLimit={4}
                  onViewAll={() => setViewAllState({ kind: "mainStockIn" })}
                />
              </div>

              <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">4</span>
                    <div>
                      <h3 className="text-xl font-bold text-black">Paraphernalia Stock Out</h3>
                      <p className="mt-1 text-base leading-6 text-gray-600">FARAGON stock transferred to other detachment tables.</p>
                    </div>
                  </div>
                  {canCreateStockIn ? (
                    <button
                      type="button"
                      onClick={() => {
                        const targetDetachment = detachmentOptions.find((detachment) => !isFaragonDetachment(detachment)) ?? "";
                        openCreate("stockIn", targetDetachment, undefined, true);
                      }}
                      className="rounded-xl bg-[#FFDA03] px-5 py-3 text-base font-bold text-black hover:brightness-95"
                    >
                      Add Stock Out
                    </button>
                  ) : null}
                </div>
                <DataTable
                  storageKey="paraphernalia-main-stock-out-transfers"
                  columns={mainTransferColumns}
                  rows={filteredMainTransfers}
                  rowKey={(row) => row.id}
                  loading={loading}
                  emptyLabel="No Stock Out transfers to detachments found."
                  actions={canManageInventory ? (row) => renderActions(row, "stockIn", true) : undefined}
                  previewLimit={4}
                  onViewAll={() => setViewAllState({ kind: "mainTransfer" })}
                />
              </div>
            </div>
          </section>
        ) : null}

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
                  <div className={`grid gap-2 text-center text-xs ${canViewStockOutHistory ? "grid-cols-3" : "grid-cols-2"}`}>
                    <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
                      <div className="font-semibold">Stock In</div>
                      <div className="text-base font-bold">{formatNumber(group.totalStockIn)}</div>
                    </div>
                    {canViewStockOutHistory ? <div className="rounded-2xl bg-red-50 px-3 py-2 text-red-700">
                      <div className="font-semibold">Stock Out</div>
                      <div className="text-base font-bold">{formatNumber(group.totalStockOut)}</div>
                    </div> : null}
                    <div className="rounded-2xl bg-[#fff3b0] px-3 py-2 text-[#6d4b00]">
                      <div className="font-semibold">Balance</div>
                      <div className="text-base font-bold">{formatNumber(group.totalBalance)}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {canViewInventorySections ? <div className="space-y-6">
                    <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">1</span>
                          <div>
                            <h3 className="text-xl font-bold text-black">Security Inventory</h3>
                            <p className="mt-1 text-base leading-6 text-gray-600">Security items for {group.detachment}.</p>
                          </div>
                        </div>
                      </div>
                      <DataTable
                        storageKey={`paraphernalia-sec-inventory-${normalizeKey(group.detachment)}`}
                        columns={inventoryColumns}
                        rows={group.secInventory}
                        rowKey={(row) => row.id}
                        loading={loading}
                        emptyLabel={`No Security Inventory activity for ${group.detachment}.`}
                        previewLimit={4}
                        onViewAll={() => setViewAllState({ kind: "secInventory", detachment: group.detachment })}
                      />
                    </div>

                    <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">2</span>
                          <div>
                            <h3 className="text-xl font-bold text-black">Office Supply Inventory</h3>
                            <p className="mt-1 text-base leading-6 text-gray-600">Office supply items for {group.detachment}.</p>
                          </div>
                        </div>
                      </div>
                      <DataTable
                        storageKey={`paraphernalia-office-inventory-${normalizeKey(group.detachment)}`}
                        columns={inventoryColumns}
                        rows={group.officeInventory}
                        rowKey={(row) => row.id}
                        loading={loading}
                        emptyLabel={`No Office Supply Inventory activity for ${group.detachment}.`}
                        previewLimit={4}
                        onViewAll={() => setViewAllState({ kind: "officeInventory", detachment: group.detachment })}
                      />
                    </div>
                  </div> : null}

                  {canViewStockInHistory ? <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">3</span>
                        <div>
                          <h3 className="text-xl font-bold text-black">Paraphernalia Stock In</h3>
                          <p className="mt-1 text-base leading-6 text-gray-600">Only Stock In records for {group.detachment}.</p>
                        </div>
                      </div>
                      {canCreateStockIn ? (
                        <button
                          type="button"
                          onClick={() => openCreate("stockIn", group.detachment)}
                          className="rounded-xl bg-[#8B1C1C] px-5 py-3 text-base font-bold text-white hover:brightness-110"
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
                      actions={canManageInventory ? (row) => renderActions(row, "stockIn") : undefined}
                      previewLimit={4}
                      onViewAll={() => setViewAllState({ kind: "stockIn", detachment: group.detachment })}
                    />
                  </div> : null}

                  {canViewStockOutHistory ? <div className="space-y-4 rounded-3xl border-2 border-slate-200 bg-[#fffdf5] p-5 md:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B1C1C] text-base font-bold text-white">4</span>
                        <div>
                          <h3 className="text-xl font-bold text-black">Paraphernalia Stock Out</h3>
                          <p className="mt-1 text-base leading-6 text-gray-600">Only Stock Out records for {group.detachment}.</p>
                        </div>
                      </div>
                      {canCreateStockOut ? (
                        <button
                          type="button"
                          onClick={() => openCreate("stockOut", group.detachment)}
                          className="rounded-xl bg-[#FFDA03] px-5 py-3 text-base font-bold text-black hover:brightness-95"
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
                      actions={canManageInventory ? (row) => renderActions(row, "stockOut") : undefined}
                      previewLimit={4}
                      onViewAll={() => setViewAllState({ kind: "stockOut", detachment: group.detachment })}
                    />
                  </div> : canCreateStockOut ? (
                    <div className="flex flex-col gap-4 rounded-3xl border-2 border-amber-200 bg-[#fffdf5] p-5 md:flex-row md:items-center md:justify-between md:p-6">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B1C1C]">Allowed Action</div>
                        <h3 className="mt-1 text-xl font-bold text-black">Add Stock Out</h3>
                        <p className="mt-1 text-sm text-gray-600">Create a Stock Out record for {group.detachment}. Existing Stock Out history is not available to this account.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openCreate("stockOut", group.detachment)}
                        className="shrink-0 rounded-xl bg-[#FFDA03] px-5 py-3 text-base font-bold text-black hover:brightness-95"
                      >
                        Add Stock Out
                      </button>
                    </div>
                  ) : null}

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
        title={
          entryModal?.kind === "stockIn"
            ? entryModal.transfer
              ? `${entryModal.mode === "edit" ? "Edit" : "Create"} Paraphernalia Stock Out to Detachment`
              : `${entryModal.mode === "edit" ? "Edit" : "Create"} Paraphernalia Stock In`
            : `${entryModal?.mode === "edit" ? "Edit" : "Create"} Paraphernalia Stock Out`
        }
        subtitle={
          entryModal?.kind === "stockIn" && entryModal.transfer
            ? "This deducts FARAGON Main Inventory and adds the same stock to the destination detachment."
            : "Detachment options come from the Client page contracts Specific Area column."
        }
        onClose={() => {
          if (!saving) setEntryModal(null);
        }}
        maxWidth="max-w-3xl"
      >
        {entryModal ? (
          <form onSubmit={submitEntry} className="space-y-5" noValidate>
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
                      <div className="text-sm font-semibold text-black">
                        {entryModal.transfer ? "Stock Out Transfer Items" : "Stock In Items"}
                      </div>
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
                    <div key={line.key} className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 md:grid-cols-[1fr_140px_auto]">
                      <label>
                        <span className={labelClass}>Item {index + 1}</span>
                        <SearchDropdownInput
                          value={line.item}
                          onChange={(item) => updateStockInLine(line.key, { item })}
                          options={itemDropdownOptions}
                          className={inputClass}
                          required
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
                  <span className={labelClass}>{entryModal.transfer ? "DESTINATION DETACHMENT" : "DETACHMENT"}</span>
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
                  <span className={labelClass}>Issued To (Last Name First)</span>
                  <SearchDropdownInput
                    value={stockOutForm.names}
                    onChange={(name) => setStockOutForm((prev) => ({ ...prev, names: name.toUpperCase() }))}
                    options={stockOutEmployeeNames}
                    className={inputClass}
                    placeholder="Type the employee's last name"
                    emptyLabel="No active employee in this detachment matches that name."
                    required
                  />
                  <span className="mt-1 block text-xs text-gray-500">Active employees assigned to the selected detachment appear automatically.</span>
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
                    <div key={line.key} className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 md:grid-cols-[1fr_120px_140px_auto]">
                      <label>
                        <span className={labelClass}>ITEMS {index + 1}</span>
                        <SearchDropdownInput
                          value={line.item}
                          onChange={(item) => {
                            const catalogPrice = itemPriceByName.get(normalizeItem(item));
                            updateStockOutLine(line.key, { item, ...(catalogPrice == null ? {} : { price: String(catalogPrice) }) });
                          }}
                          options={itemDropdownOptions}
                          className={inputClass}
                          required
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
                {entryModal.mode === "edit" ? (
                  <>
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
                          setStockOutForm((prev) => ({ ...prev, detachment, clientName: matchedClient || prev.clientName, names: "" }));
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
                  </>
                ) : null}
              </div>
            )}

            {error ? (
              <div role="alert" aria-live="assertive" className="rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
                {error}
              </div>
            ) : null}

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
          {itemManagerError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{itemManagerError}</div>
          ) : null}
          {itemManagerMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{itemManagerMessage}</div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border bg-gray-50 p-4 md:grid-cols-[1fr_220px_160px_auto]">
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
              <span className={labelClass}>Equipment Category</span>
              <select value={newItemGroup} onChange={(event) => setNewItemGroup(event.target.value as EquipmentGroup)} className={inputClass}>
                {EQUIPMENT_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </label>
            <label>
              <span className={labelClass}>Unit Price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newItemPrice}
                onChange={(event) => setNewItemPrice(event.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
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

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={itemManagerSearch}
              onChange={(event) => setItemManagerSearch(event.target.value)}
              className={`${inputClass} pl-10`}
              placeholder="Search item name, category, inventory type, or price..."
            />
          </label>

          <TableZoomWrapper storageKey="paraphernalia-80:manage-items" defaultZoom={0.8}>
            <div className="max-h-[50vh] overflow-auto rounded-2xl border">
              <table className="min-w-full text-left text-sm">
              <thead className="bg-[#FFDA03] text-black">
                <tr>
                  <th className="px-4 py-3">ITEMS</th>
                  <th className="px-4 py-3">Equipment Category</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {managedItemOptions.map((item) => (
                  <tr key={`${item.item_id ?? item.item_name}-manager`}>
                    <td className="px-4 py-3 font-medium text-black">{item.item_name}</td>
                    <td className="px-4 py-3 text-gray-700">{item.item_group}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemPriceDrafts[item.item_id ?? item.item_name] ?? String(item.unit_price)}
                        onChange={(event) => setItemPriceDrafts((prev) => ({ ...prev, [item.item_id ?? item.item_name]: event.target.value }))}
                        className="w-32 rounded-xl border px-3 py-2 text-right text-sm text-black"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveItemPrice(item)}
                          disabled={itemBusy || !item.item_id}
                          className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-gray-50 disabled:opacity-60"
                        >
                          Save Price
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeItemOption(item)}
                          disabled={itemBusy}
                          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {managedItemOptions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No items match your search.</td>
                  </tr>
                ) : null}
              </tbody>
              </table>
            </div>
          </TableZoomWrapper>
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(detachmentTableToRemove)}
        title="Remove Detachment Table?"
        subtitle={
          detachmentTableToRemove
            ? `Delete the saved table definition for ${detachmentTableToRemove}? Existing Stock In and Stock Out history will be preserved.`
            : undefined
        }
        onClose={() => {
          if (!removingDetachmentTable) setDetachmentTableToRemove(null);
        }}
        maxWidth="max-w-md"
      >
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          This deletes the navigation table from Supabase. It does not delete historical inventory records.
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={removingDetachmentTable} onClick={() => setDetachmentTableToRemove(null)} className="rounded-xl border bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (detachmentTableToRemove) void removeDetachmentTable(detachmentTableToRemove);
            }}
            disabled={removingDetachmentTable}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {removingDetachmentTable ? "Deleting..." : "Delete Table"}
          </button>
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
          quantity: 1,
          attachment: "Optional text or URL",
          detachment: "Sample Detachment",
          client_name: "Sample Client",
          names: "DELA CRUZ, JUAN (required for Stock Out only)",
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
