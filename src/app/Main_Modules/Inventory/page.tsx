"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Boxes, Download, FileDown, FileText, Pencil, Search, Upload, X } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import SpreadsheetImportModal from "@/app/Components/SpreadsheetImportModal";
import { readSpreadsheetRows } from "@/app/Components/spreadsheetImportUtils";
import { addBrandedPdfHeader, buildBrandedAoa, buildBrandedWorkbookBuffer } from "../Components/exportBranding";
import SearchDropdownInput from "@/app/Components/SearchDropdownInput";
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_GROUPS,
  EQUIPMENT_NAMES,
  EquipmentGroup,
  equipmentGroupForName,
  equipmentNamesForGroup,
  normalizeEquipmentCatalogName,
} from "../Components/equipmentCatalog";

type CategoryConfig = {
  key: "firearms" | "communications" | "furniture" | "office" | "sec" | "vehicle";
  label: string;
  group: EquipmentGroup;
  nameField: keyof InventoryForm;
  qtyField: keyof InventoryForm;
  priceField: keyof InventoryForm;
  nameRowField: keyof InventoryRow;
  qtyRowField: keyof InventoryRow;
  priceRowField: keyof InventoryRow;
};

type InventoryRow = {
  id: string;
  equipment: string | null;
  control_number: string | null;
  serial_plate_number: string | null;
  maker: string | null;
  model_number: string | null;
  detachment: string | null;
  date: string | null;
  particular: string | null;
  quanitity: number | null;
  amount: number | null;
  last_updated_at: string | null;
  remarks: string | null;
  unit_cost: number | null;
  date_purchased: string | null;
  expiration: string | null;
  last_maintenance: string | null;
  user_text: string | null;
  user_attachment: string | null;
  firearms_name: string | null;
  firearms_qty: number | null;
  firearms_price: number | null;
  communications_name: string | null;
  communications_qty: number | null;
  communications_price: number | null;
  furniture_name: string | null;
  furniture_qty: number | null;
  furniture_price: number | null;
  office_name: string | null;
  office_qty: number | null;
  office_price: number | null;
  sec_name: string | null;
  sec_qty: number | null;
  sec_price: number | null;
  vehicle_name: string | null;
  vehicle_qty: number | null;
  vehicle_price: number | null;
  firearms_ammunitions: string | null;
  communications_equipment: string | null;
  furniture_and_fixtures: string | null;
  office_equipments_sec_equipments: string | null;
  sec_equipments: string | null;
  vehicle_and_motorcycle: string | null;
  total_amount: number | null;
  grand_total: number | null;
};

type InventoryForm = {
  equipment: string;
  control_number: string;
  serial_plate_number: string;
  maker: string;
  model_number: string;
  detachment: string;
  date: string;
  particular: string;
  quanitity: string;
  firearms_name: string;
  firearms_qty: string;
  firearms_price: string;
  communications_name: string;
  communications_qty: string;
  communications_price: string;
  furniture_name: string;
  furniture_qty: string;
  furniture_price: string;
  office_name: string;
  office_qty: string;
  office_price: string;
  sec_name: string;
  sec_qty: string;
  sec_price: string;
  vehicle_name: string;
  vehicle_qty: string;
  vehicle_price: string;
  remarks: string;
  unit_cost: string;
  date_purchased: string;
  expiration: string;
  last_maintenance: string;
  user_text: string;
  user_attachment: string;
};

type InventoryEquipmentOption = {
  name: string;
  group: EquipmentGroup;
  unitPrice: number;
};

type DetachmentItemSummary = {
  key: string;
  item: string;
  group: EquipmentGroup;
  quantity: number;
  unitValue: number;
  totalValue: number;
};

type ParaphernaliaBalanceRow = {
  specific_area: string | null;
  item: string | null;
  stock_balance: number | null;
};

const EMPTY_FORM: InventoryForm = {
  equipment: "",
  control_number: "",
  serial_plate_number: "",
  maker: "",
  model_number: "",
  detachment: "",
  date: "",
  particular: "",
  quanitity: "",
  firearms_name: "",
  firearms_qty: "",
  firearms_price: "",
  communications_name: "",
  communications_qty: "",
  communications_price: "",
  furniture_name: "",
  furniture_qty: "",
  furniture_price: "",
  office_name: "",
  office_qty: "",
  office_price: "",
  sec_name: "",
  sec_qty: "",
  sec_price: "",
  vehicle_name: "",
  vehicle_qty: "",
  vehicle_price: "",
  remarks: "",
  unit_cost: "",
  date_purchased: "",
  expiration: "",
  last_maintenance: "",
  user_text: "",
  user_attachment: "",
};

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    key: "firearms",
    label: "Communication",
    group: "Communication",
    nameField: "firearms_name",
    qtyField: "firearms_qty",
    priceField: "firearms_price",
    nameRowField: "firearms_name",
    qtyRowField: "firearms_qty",
    priceRowField: "firearms_price",
  },
  {
    key: "communications",
    label: "Security / Safety",
    group: "Security / Safety",
    nameField: "communications_name",
    qtyField: "communications_qty",
    priceField: "communications_price",
    nameRowField: "communications_name",
    qtyRowField: "communications_qty",
    priceRowField: "communications_price",
  },
  {
    key: "furniture",
    label: "Tactical",
    group: "Tactical",
    nameField: "furniture_name",
    qtyField: "furniture_qty",
    priceField: "furniture_price",
    nameRowField: "furniture_name",
    qtyRowField: "furniture_qty",
    priceRowField: "furniture_price",
  },
  {
    key: "office",
    label: "Transportation / Mobility",
    group: "Transportation / Mobility",
    nameField: "office_name",
    qtyField: "office_qty",
    priceField: "office_price",
    nameRowField: "office_name",
    qtyRowField: "office_qty",
    priceRowField: "office_price",
  },
  {
    key: "sec",
    label: "Emergency / Medical",
    group: "Emergency / Medical",
    nameField: "sec_name",
    qtyField: "sec_qty",
    priceField: "sec_price",
    nameRowField: "sec_name",
    qtyRowField: "sec_qty",
    priceRowField: "sec_price",
  },
  {
    key: "vehicle",
    label: "Office Equipment",
    group: "Office Equipment",
    nameField: "vehicle_name",
    qtyField: "vehicle_qty",
    priceField: "vehicle_price",
    nameRowField: "vehicle_name",
    qtyRowField: "vehicle_qty",
    priceRowField: "vehicle_price",
  },
];

const INVENTORY_COLUMN_TO_DB_FIELDS: Record<string, string[]> = {
  equipment: ["equipment"],
  control_number: ["control_number"],
  serial_plate_number: ["serial_plate_number"],
  maker: ["maker"],
  model_number: ["model_number"],
  detachment: ["detachment"],
  date: ["date"],
  particular: ["particular"],
  quanitity: ["quanitity"],
  amount: ["amount"],
  remarks: ["remarks"],
  unit_cost: ["unit_cost"],
  date_purchased: ["date_purchased"],
  expiration: ["expiration"],
  last_maintenance: ["last_maintenance"],
  user: ["user_text", "user_attachment"],
  firearms_name: ["firearms_name", "firearms_qty", "firearms_price", "firearms_ammunitions"],
  communications_name: ["communications_name", "communications_qty", "communications_price", "communications_equipment"],
  furniture_name: ["furniture_name", "furniture_qty", "furniture_price", "furniture_and_fixtures"],
  office_name: ["office_name", "office_qty", "office_price", "office_equipments_sec_equipments"],
  sec_name: ["sec_name", "sec_qty", "sec_price", "sec_equipments"],
  vehicle_name: ["vehicle_name", "vehicle_qty", "vehicle_price", "vehicle_and_motorcycle"],
  total_amount: ["total_amount"],
  grand_total: ["grand_total"],
};

const INVENTORY_BUCKET = "inventory";

const INVENTORY_CONTROL_PREFIXES: Record<string, string> = {
  AIRCON: "AC",
  BIKE: "BK",
  BODYCAMERA: "BC",
  "BODY SCANNER": "BS",
  "BP APPRATUS": "BP",
  CIGNUS: "CIG",
  KENWOOD: "KEN",
  MOTOROLA: "M",
  VERSA: "VER",
  IQONIC: "IQ",
  PHONE: "CP",
  "SATELLITE PHONE": "SP",
  MEGAPHONE: "MP",
  BINOCULAR: "BI",
  "BULLET PROOF VEST": "BPV",
  DRONE: "DR",
  "FIRE EXTINGUISHER": "FX",
  "GUARD TOUR SYSTEM": "GTS",
  "METAL DETECTOR": "MD",
  "NIGHT STICK": "NS",
  "SEARCH LIGHT": "LS",
  "TRAFFIC CONE": "TC",
  PISTOL: "PIS",
  SHOTGUN: "SG",
  "TASER GUN": "TG",
  STUNGUN: "SG",
  MOTORCYCLE: "MC",
  MOBILE: "MV",
  SEABOURNE: "SB",
  "FIRST AID KIT": "FK",
  "FIRST AID CABINET": "FAC",
  "OXYGEN TANK": "OX",
  STRETCHER: "ST",
  "WHEEL CHAIR": "WC",
  AIRCONDITIONER: "AC",
  BIOMETRIC: "BIO",
  BUNDYCLOCK: "BDC",
  ELECTRICFAN: "EF",
  MONITOR: "MON",
  "OFFICE TABLE": "OT",
  "OFFICE CHAIR": "OC",
  PRINTER: "PRN",
  PROJECTOR: "PJT",
  "STEEL CABINET": "SC",
  "STEEL LOCKER": "SL",
  "SYSTEM UNIT": "SU",
  "SYTEM UNIT": "SU",
  LAPTOP: "LT",
  "CIGNUS CHARGER": "CCH",
  "VERSA CHARGER": "VCH",
  "SPARE BATTERY": "BAT",
  "DOUBLE DECK": "DD",
  "XEROX MACHINE": "XM",
};

function toNumber(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeImportKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeEquipmentName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeControlNumber(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function controlPrefixForEquipment(value: unknown) {
  const equipment = normalizeEquipmentName(value);
  if (INVENTORY_CONTROL_PREFIXES[equipment]) return INVENTORY_CONTROL_PREFIXES[equipment];
  const words = equipment.match(/[A-Z0-9]+/g) ?? [];
  return words.length > 1 ? words.map((word) => word[0]).join("") : equipment.slice(0, 3) || "EQ";
}

function formatInventoryControlNumber(equipment: unknown, sequence: number, year = new Date().getFullYear()) {
  return `${controlPrefixForEquipment(equipment)}-${year}-${String(Math.max(1, sequence)).padStart(4, "0")}`;
}

function parseControlSequence(value: unknown) {
  const match = normalizeControlNumber(value).match(/-(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function formatDateCell(value: string | null) {
  return value && value.trim() ? value : "—";
}

function toMoney(value: number) {
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function numberValue(value: unknown) {
  return Number(value ?? 0) || 0;
}

function lineTotal(quantity: unknown, price: unknown) {
  return numberValue(quantity) * numberValue(price);
}

function categoryQuantityFromForm(formData: InventoryForm) {
  return CATEGORY_CONFIGS.reduce((sum, cfg) => sum + numberValue(formData[cfg.qtyField]), 0);
}

function categoryQuantityFromRow(row: InventoryRow) {
  return CATEGORY_CONFIGS.reduce((sum, cfg) => sum + numberValue(row[cfg.qtyRowField]), 0);
}

function totalQuantityFromForm(formData: InventoryForm) {
  return numberValue(formData.quanitity) || categoryQuantityFromForm(formData);
}

function totalQuantityFromRow(row: InventoryRow) {
  return categoryQuantityFromRow(row) || numberValue(row.quanitity);
}

function totalFromPrices(formData: InventoryForm) {
  const categoryTotal = CATEGORY_CONFIGS.reduce(
    (sum, cfg) => sum + lineTotal(formData[cfg.qtyField], formData[cfg.priceField]),
    0
  );

  return categoryTotal || lineTotal(totalQuantityFromForm(formData), formData.unit_cost);
}

function totalFromRowPrices(row: InventoryRow) {
  const categoryTotal = CATEGORY_CONFIGS.reduce(
    (sum, cfg) => sum + lineTotal(row[cfg.qtyRowField], row[cfg.priceRowField]),
    0
  );

  return categoryTotal || lineTotal(totalQuantityFromRow(row), row.unit_cost) || numberValue(row.total_amount ?? row.amount);
}

function inventoryItemLinesFromRow(row: InventoryRow): DetachmentItemSummary[] {
  const categoryLines = CATEGORY_CONFIGS.flatMap((cfg) => {
    const item = normalizeEquipmentName(row[cfg.nameRowField]);
    const quantity = numberValue(row[cfg.qtyRowField]);
    const unitValue = numberValue(row[cfg.priceRowField]);
    if (!item && quantity <= 0) return [];
    const resolvedItem = item || normalizeEquipmentName(row.equipment || row.particular) || cfg.label.toUpperCase();
    return [{
      key: `${cfg.group}:${resolvedItem}:${unitValue}`,
      item: resolvedItem,
      group: cfg.group,
      quantity,
      unitValue,
      totalValue: lineTotal(quantity, unitValue),
    }];
  });

  if (categoryLines.length) return categoryLines;

  const item = normalizeEquipmentName(row.equipment || row.particular) || "UNSPECIFIED EQUIPMENT";
  const quantity = totalQuantityFromRow(row);
  const unitValue = numberValue(row.unit_cost);
  return [{
    key: `${equipmentGroupForName(item)}:${item}:${unitValue}`,
    item,
    group: equipmentGroupForName(item),
    quantity,
    unitValue,
    totalValue: totalFromRowPrices(row),
  }];
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

export default function LogisticsInventoryPage() {
  const { role } = useAuthRole();
  const {
    allowedColumns: allowedInventoryColumns,
    restricted: inventoryColumnsRestricted,
    loading: loadingInventoryColumns,
    error: inventoryColumnsError,
  } = useMyColumnAccess("inventory");
  const isAdmin = role === "admin" || role === "superadmin";
  const canMutateInventory = isAdmin && !inventoryColumnsRestricted;

  const canViewInventoryColumn = (columnKey: string) =>
    !inventoryColumnsRestricted || allowedInventoryColumns.has(columnKey);

  const canImportInventory = canMutateInventory && canViewInventoryColumn("import_file");
  const canDownloadInventoryTemplate = isAdmin && canViewInventoryColumn("export_template");
  const canExportInventory = isAdmin && canViewInventoryColumn("export_file");

  const showEquipmentColumn = canViewInventoryColumn("equipment");
  const showControlNumberColumn = canViewInventoryColumn("control_number");
  const showSerialPlateColumn = canViewInventoryColumn("serial_plate_number");
  const showMakerColumn = canViewInventoryColumn("maker");
  const showModelColumn = canViewInventoryColumn("model_number");
  const showDetachmentColumn = canViewInventoryColumn("detachment");
  const showDateColumn = canViewInventoryColumn("date");
  const showParticularColumn = canViewInventoryColumn("particular");
  const showRemarksColumn = canViewInventoryColumn("remarks");
  const showUnitCostColumn = canViewInventoryColumn("unit_cost");
  const showDatePurchasedColumn = canViewInventoryColumn("date_purchased");
  const showExpirationColumn = canViewInventoryColumn("expiration");
  const showLastMaintenanceColumn = canViewInventoryColumn("last_maintenance");
  const showUserColumn = canViewInventoryColumn("user");
  const showRowTotalColumn = canViewInventoryColumn("amount") || canViewInventoryColumn("total_amount");
  const showGrandTotalColumn = canViewInventoryColumn("grand_total");

  const visibleCategoryConfigs = CATEGORY_CONFIGS.filter((cfg) =>
    canViewInventoryColumn(String(cfg.nameRowField))
  );

  const inventoryColumnsSignature = useMemo(
    () => Array.from(allowedInventoryColumns).sort().join("|"),
    [allowedInventoryColumns]
  );

  const inventoryTableColumnCount = useMemo(() => {
    return (
      (showDateColumn ? 1 : 0) +
      (showEquipmentColumn ? 1 : 0) +
      (showControlNumberColumn ? 1 : 0) +
      (showSerialPlateColumn ? 1 : 0) +
      (showMakerColumn ? 1 : 0) +
      (showModelColumn ? 1 : 0) +
      (showDetachmentColumn ? 1 : 0) +
      (showParticularColumn ? 1 : 0) +
      visibleCategoryConfigs.length +
      (showRowTotalColumn ? 1 : 0) +
      1 +
      (showRemarksColumn ? 1 : 0) +
      (showUnitCostColumn ? 1 : 0) +
      (showDatePurchasedColumn ? 1 : 0) +
      (showExpirationColumn ? 1 : 0) +
      (showLastMaintenanceColumn ? 1 : 0) +
      (showUserColumn ? 1 : 0) +
      (canMutateInventory ? 1 : 0)
    );
  }, [
    showDateColumn,
    showEquipmentColumn,
    showControlNumberColumn,
    showSerialPlateColumn,
    showMakerColumn,
    showModelColumn,
    showDetachmentColumn,
    showParticularColumn,
    visibleCategoryConfigs.length,
    showRowTotalColumn,
    showRemarksColumn,
    showUnitCostColumn,
    showDatePurchasedColumn,
    showExpirationColumn,
    showLastMaintenanceColumn,
    showUserColumn,
    canMutateInventory,
  ]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [paraphernaliaBalances, setParaphernaliaBalances] = useState<ParaphernaliaBalanceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [selectedDetailRowId, setSelectedDetailRowId] = useState<string | null>(null);
  const [selectedDetachmentView, setSelectedDetachmentView] = useState<string | null>(null);
  const [inventoryViewMode, setInventoryViewMode] = useState<"grid" | "matrix">("grid");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
  const [importSummaryOpen, setImportSummaryOpen] = useState(false);
  const [showTemplatePopup, setShowTemplatePopup] = useState(false);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [itemManagerOpen, setItemManagerOpen] = useState(false);
  const [itemBusy, setItemBusy] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemGroup, setNewItemGroup] = useState<EquipmentGroup>("Security / Safety");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [itemPriceDrafts, setItemPriceDrafts] = useState<Record<string, string>>({});
  const [itemManagerSearch, setItemManagerSearch] = useState("");
  const [itemManagerError, setItemManagerError] = useState("");
  const [itemManagerMessage, setItemManagerMessage] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formData, setFormData] = useState<InventoryForm>(EMPTY_FORM);
  const [userAttachmentFile, setUserAttachmentFile] = useState<File | null>(null);
  const [clientNameOptions, setClientNameOptions] = useState<string[]>([]);
  const [inventoryEquipmentOptions, setInventoryEquipmentOptions] = useState<InventoryEquipmentOption[]>(
    EQUIPMENT_CATALOG.map((item) => ({ name: item.name, group: item.group, unitPrice: 0 }))
  );

  const managedItemOptions = useMemo(() => {
    const query = itemManagerSearch.trim().toLowerCase();
    return inventoryEquipmentOptions.filter((item) => {
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.group.toLowerCase().includes(query) ||
        String(item.unitPrice).includes(query)
      );
    });
  }, [inventoryEquipmentOptions, itemManagerSearch]);

  const equipmentDropdownNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const name of EQUIPMENT_NAMES) names.set(normalizeEquipmentCatalogName(name), name);
    for (const option of inventoryEquipmentOptions) names.set(normalizeEquipmentCatalogName(option.name), option.name);
    return Array.from(names.values());
  }, [inventoryEquipmentOptions]);

  const equipmentPriceByName = useMemo(() => {
    const prices = new Map<string, number>();
    for (const option of inventoryEquipmentOptions) {
      prices.set(normalizeEquipmentCatalogName(option.name), option.unitPrice);
    }
    return prices;
  }, [inventoryEquipmentOptions]);

  const detachmentOptions = useMemo(() => {
    const currentValue = formData.detachment.trim();
    if (!currentValue || clientNameOptions.some((name) => name.toLowerCase() === currentValue.toLowerCase())) {
      return clientNameOptions;
    }
    return [currentValue, ...clientNameOptions];
  }, [clientNameOptions, formData.detachment]);

  const nextInventoryControlNumber = useCallback((equipment: string, offset = 0) => {
    const year = new Date().getFullYear();
    const prefix = controlPrefixForEquipment(equipment);
    const prefixKey = `${prefix}-${year}-`;
    const maxSequence = rows
      .map((row) => normalizeControlNumber(row.control_number))
      .filter((value) => value.startsWith(prefixKey))
      .reduce((max, value) => Math.max(max, parseControlSequence(value)), 0);
    return formatInventoryControlNumber(equipment, maxSequence + offset + 1, year);
  }, [rows]);

  const loadClientNameOptions = useCallback(async () => {
    const [contractsRes, detachmentTablesRes, paraphernaliaSummaryRes, inventoryFixedRes] = await Promise.all([
      supabase.from("contracts").select("client_name, specific_area").limit(5000),
      supabase.from("paraphernalia_detachment_tables").select("detachment").eq("is_active", true).limit(5000),
      supabase.from("vw_paraphernalia_inventory_summary").select("specific_area").limit(5000),
      supabase.from("inventory_fixed_asset").select("detachment").limit(5000),
    ]);

    const names = new Set<string>();

    if (!contractsRes.error) {
      for (const row of (contractsRes.data ?? []) as Array<{ client_name: string | null; specific_area: string | null }>) {
        if (row.specific_area?.trim()) names.add(row.specific_area.trim());
        if (row.client_name?.trim()) names.add(row.client_name.trim());
      }
    }
    if (!detachmentTablesRes.error) {
      for (const row of (detachmentTablesRes.data ?? []) as Array<{ detachment: string | null }>) {
        if (row.detachment?.trim()) names.add(row.detachment.trim());
      }
    }
    if (!paraphernaliaSummaryRes.error) {
      for (const row of (paraphernaliaSummaryRes.data ?? []) as Array<{ specific_area: string | null }>) {
        if (row.specific_area?.trim()) names.add(row.specific_area.trim());
      }
    }
    if (!inventoryFixedRes.error) {
      for (const row of (inventoryFixedRes.data ?? []) as Array<{ detachment: string | null }>) {
        if (row.detachment?.trim()) names.add(row.detachment.trim());
      }
    }

    const nextOptions = Array.from(names).sort((a, b) => a.localeCompare(b));
    setClientNameOptions(nextOptions);
  }, []);

  const loadInventoryEquipmentOptions = useCallback(async () => {
    const wide = await supabase
      .from("paraphernalia_items")
      .select("item_name, item_group, unit_price, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("item_name", { ascending: true });

    let sourceRows: Array<Record<string, unknown>> = [];
    if (!wide.error) {
      sourceRows = (wide.data ?? []) as Array<Record<string, unknown>>;
    } else {
      const fallback = await supabase
        .from("paraphernalia_items")
        .select("item_name, unit_price, is_active")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("item_name", { ascending: true });
      if (!fallback.error) sourceRows = (fallback.data ?? []) as Array<Record<string, unknown>>;
    }

    const merged = new Map<string, InventoryEquipmentOption>();
    for (const item of EQUIPMENT_CATALOG) {
      merged.set(item.name, { name: item.name, group: item.group, unitPrice: 0 });
    }
    for (const row of sourceRows) {
      const name = normalizeEquipmentCatalogName(row.item_name);
      if (!name) continue;
      const rawGroup = String(row.item_group ?? "").trim() as EquipmentGroup;
      const group = EQUIPMENT_GROUPS.includes(rawGroup) ? rawGroup : equipmentGroupForName(name);
      merged.set(name, { name, group, unitPrice: numberValue(row.unit_price) });
    }
    setInventoryEquipmentOptions(Array.from(merged.values()));
  }, []);

  async function addItemOption() {
    const name = newItemName.trim().toUpperCase();
    if (!name) {
      setItemManagerError("Item name is required.");
      return;
    }
    setItemBusy(true);
    setItemManagerError("");
    setItemManagerMessage("");

    const price = Number(newItemPrice) || 0;
    const category = newItemGroup === "Office Equipment" ? "OFFICE" : "SEC";

    const res = await supabase.from("paraphernalia_items").insert({
      item_name: name,
      item_group: newItemGroup,
      item_category: category,
      unit_price: price,
      is_active: true,
    });

    setItemBusy(false);
    if (res.error) {
      setItemManagerError(res.error.message || "Failed to add item option.");
      return;
    }

    setItemManagerMessage(`Item "${name}" added successfully.`);
    setNewItemName("");
    setNewItemPrice("");
    await loadInventoryEquipmentOptions();
  }

  async function saveItemPrice(item: InventoryEquipmentOption) {
    const draft = itemPriceDrafts[item.name];
    const price = Number(draft ?? item.unitPrice) || 0;

    setItemBusy(true);
    setItemManagerError("");
    setItemManagerMessage("");

    const res = await supabase
      .from("paraphernalia_items")
      .update({ unit_price: price })
      .eq("item_name", item.name);

    setItemBusy(false);
    if (res.error) {
      setItemManagerError(res.error.message || "Failed to update unit price.");
      return;
    }

    setItemManagerMessage(`Unit price for "${item.name}" updated to PHP ${toMoney(price)}.`);
    await loadInventoryEquipmentOptions();
  }

  async function removeItemOption(item: InventoryEquipmentOption) {
    const ok = globalThis.confirm ? globalThis.confirm(`Remove ${item.name}? It will be hidden from future selections.`) : true;
    if (!ok) return;

    setItemBusy(true);
    setItemManagerError("");
    setItemManagerMessage("");

    const res = await supabase
      .from("paraphernalia_items")
      .update({ is_active: false })
      .eq("item_name", item.name);

    setItemBusy(false);
    if (res.error) {
      setItemManagerError(res.error.message || "Failed to remove item.");
      return;
    }

    setItemManagerMessage(`Item "${item.name}" removed.`);
    await loadInventoryEquipmentOptions();
  }

  const loadParaphernaliaBalances = useCallback(async () => {
    const result = await supabase
      .from("vw_paraphernalia_inventory_summary")
      .select("specific_area, item, stock_balance")
      .limit(10000);
    if (result.error) {
      setParaphernaliaBalances([]);
      return;
    }
    setParaphernaliaBalances((result.data as ParaphernaliaBalanceRow[] | null) ?? []);
  }, []);

  const loadData = useCallback(async () => {
    if (loadingInventoryColumns) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(inventoryColumnsError || "");

    const selectFields = new Set<string>(["id", "last_updated_at"]);
    for (const [columnKey, dbFields] of Object.entries(INVENTORY_COLUMN_TO_DB_FIELDS)) {
      const canViewColumn = !inventoryColumnsRestricted || allowedInventoryColumns.has(columnKey);
      if (!canViewColumn) continue;
      for (const field of dbFields) {
        selectFields.add(field);
      }
    }

    const res = await supabase
      .from("inventory_fixed_asset")
      .select(Array.from(selectFields).join(", "))
      .order("date", { ascending: false })
      .limit(1000);

    if (res.error) {
      setError(res.error.message || "Failed to load inventory");
      setRows([]);
    } else {
      setRows((res.data as unknown as InventoryRow[]) || []);
    }

    setLoading(false);
  }, [loadingInventoryColumns, inventoryColumnsError, inventoryColumnsRestricted, allowedInventoryColumns]);

  async function downloadTemplate(format: "xlsx" | "csv") {

    
    const sample = {
      equipment: "CIGNUS",
      control_number: "CIG-2026-0001",
      serial_plate_number: "SN-001",
      maker: "Sample Maker",
      model_number: "Model A",
      detachment: "Sample Client",
      date: "2026-03-01",
      particular: "Sample Particular",
      quanitity: 5,
      unit_cost: 1000,
      amount: 5000,
      total_amount: 5000,
      grand_total: 5000,
      date_purchased: "2026-03-01",
      expiration: "2027-03-01",
      last_maintenance: "2026-05-01",
      user_text: "Assigned user or notes",
      user_attachment: "Optional URL",
      communication_name: "CIGNUS",
      communication_qty: 1,
      communication_price: 1000,
      security_safety_name: "BODYCAMERA",
      security_safety_qty: 1,
      security_safety_price: 800,
      tactical_name: "PISTOL",
      tactical_qty: 1,
      tactical_price: 500,
      transportation_mobility_name: "MOTORCYCLE",
      transportation_mobility_qty: 1,
      transportation_mobility_price: 400,
      emergency_medical_name: "FIRST AID KIT",
      emergency_medical_qty: 1,
      emergency_medical_price: 300,
      office_equipment_name: "PRINTER",
      office_equipment_qty: 1,
      office_equipment_price: 2000,
      remarks: "Optional remarks",
    };

    if (format === "xlsx") {
      const out = await buildBrandedWorkbookBuffer([
        {
          name: "InventoryTemplate",
          title: "Inventory Import Template",
          subtitle: "Sample inventory data for import",
          rows: [sample],
        },
      ]);
      downloadBlob("inventory_import_template.xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(buildBrandedAoa([sample], "Inventory Import Template", "Sample inventory data for import"));
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob("inventory_import_template.csv", new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  function downloadInventoryTemplateCsv() {
  downloadTemplate("csv");
}

function downloadInventoryTemplateXlsx() {
  downloadTemplate("xlsx");
}

  

  async function importSpreadsheet(file: File) {
    if (!canImportInventory) {
      setError("You do not have permission to import inventory files.");
      return;
    }

    setImporting(true);
    setError("");
    setSuccess("");
    setImportSummary(null);

    try {
      await handleInventoryImport(await readSpreadsheetRows(file));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const parseInventoryImportRow = useCallback((row: Record<string, unknown>) => {
    const totalQuantityValue = toNumber(pickByAliases(row, ["quanitity", "quantity", "total quantity"]));
    const unitCostValue = toNumber(pickByAliases(row, ["unit cost", "unit_cost", "cost"]));
    const firearmsQty = toNumber(pickByAliases(row, ["communication_qty", "communication quantity", "firearms_qty", "firearms quantity"]));
    const firearmsPrice = toNumber(pickByAliases(row, ["communication_price", "communication price", "firearms_price", "firearms price", "firearms amount"]));
    const communicationsQty = toNumber(pickByAliases(row, ["security_safety_qty", "security safety quantity", "communications_qty", "communications quantity"]));
    const communicationsPrice = toNumber(pickByAliases(row, ["security_safety_price", "security safety price", "communications_price", "communications price", "communications amount"]));
    const furnitureQty = toNumber(pickByAliases(row, ["tactical_qty", "tactical quantity", "furniture_qty", "furniture quantity"]));
    const furniturePrice = toNumber(pickByAliases(row, ["tactical_price", "tactical price", "furniture_price", "furniture price", "furniture amount"]));
    const officeQty = toNumber(pickByAliases(row, ["transportation_mobility_qty", "transportation mobility quantity", "office_qty", "office quantity"]));
    const officePrice = toNumber(pickByAliases(row, ["transportation_mobility_price", "transportation mobility price", "office_price", "office price", "office amount"]));
    const secQty = toNumber(pickByAliases(row, ["emergency_medical_qty", "emergency medical quantity", "sec_qty", "security quantity"]));
    const secPrice = toNumber(pickByAliases(row, ["emergency_medical_price", "emergency medical price", "sec_price", "sec price", "security price"]));
    const vehicleQty = toNumber(pickByAliases(row, ["office_equipment_qty", "office equipment quantity", "vehicle_qty", "vehicle quantity"]));
    const vehiclePrice = toNumber(pickByAliases(row, ["office_equipment_price", "office equipment price", "vehicle_price", "vehicle price", "vehicle amount"]));
    const categoryQuantityValue = firearmsQty + communicationsQty + furnitureQty + officeQty + secQty + vehicleQty;
    const effectiveTotalQuantity = totalQuantityValue || categoryQuantityValue;
    const categoryComputedAmount =
      lineTotal(firearmsQty, firearmsPrice) +
      lineTotal(communicationsQty, communicationsPrice) +
      lineTotal(furnitureQty, furniturePrice) +
      lineTotal(officeQty, officePrice) +
      lineTotal(secQty, secPrice) +
      lineTotal(vehicleQty, vehiclePrice);
    const computedAmount = categoryComputedAmount || lineTotal(effectiveTotalQuantity, unitCostValue);
    const equipment = pickByAliases(row, ["equipment", "item", "items"]).trim();
    const controlNumber = normalizeControlNumber(pickByAliases(row, ["controlnumber", "control number", "control_number", "control no"])) || (equipment ? nextInventoryControlNumber(equipment) : "");
    const importedAmount = toNumber(pickByAliases(row, ["amount", "row total", "total_amount"])) || computedAmount;

    const payload = {
      equipment: equipment || null,
      control_number: controlNumber || null,
      serial_plate_number: pickByAliases(row, ["serial # / plate #", "serial plate number", "serial", "plate", "plate number"]).trim() || null,
      maker: pickByAliases(row, ["maker", "manufacturer"]).trim() || null,
      model_number: pickByAliases(row, ["model #", "model number", "model"]).trim() || null,
      detachment: pickByAliases(row, ["detachment", "specific area", "area"]).trim() || null,
      date: pickByAliases(row, ["date"]).trim() || null,
      particular: pickByAliases(row, ["particular", "description", "item"]).trim() || null,
      quanitity: effectiveTotalQuantity,
      amount: importedAmount,
      remarks: pickByAliases(row, ["remarks", "note", "notes"]).trim() || null,
      unit_cost: unitCostValue,
      date_purchased: pickByAliases(row, ["date of purchased", "date purchased", "date_purchased", "purchase date"]).trim() || null,
      expiration: pickByAliases(row, ["expiration", "expiry", "expiry date"]).trim() || null,
      last_maintenance: pickByAliases(row, ["last maintenance", "last_maintenance", "maintenance"]).trim() || null,
      user_text: pickByAliases(row, ["user", "user text", "assigned user", "user_text"]).trim() || null,
      user_attachment: pickByAliases(row, ["user attachment", "attachment", "file", "user_attachment"]).trim() || null,
      firearms_name: pickByAliases(row, ["communication_name", "communication", "firearms_name", "firearms", "firearms ammunitions"]).trim() || null,
      firearms_qty: firearmsQty,
      firearms_price: firearmsPrice,
      communications_name: pickByAliases(row, ["security_safety_name", "security safety", "communications_name", "communications", "communications equipment"]).trim() || null,
      communications_qty: communicationsQty,
      communications_price: communicationsPrice,
      furniture_name: pickByAliases(row, ["tactical_name", "tactical", "furniture_name", "furniture", "furniture fixtures"]).trim() || null,
      furniture_qty: furnitureQty,
      furniture_price: furniturePrice,
      office_name: pickByAliases(row, ["transportation_mobility_name", "transportation mobility", "office_name", "office"]).trim() || null,
      office_qty: officeQty,
      office_price: officePrice,
      sec_name: pickByAliases(row, ["emergency_medical_name", "emergency medical", "sec_name", "security_name", "sec equipment"]).trim() || null,
      sec_qty: secQty,
      sec_price: secPrice,
      vehicle_name: pickByAliases(row, ["office_equipment_name", "office equipment", "vehicle_name", "vehicle", "motorcycle"]).trim() || null,
      vehicle_qty: vehicleQty,
      vehicle_price: vehiclePrice,
      firearms_ammunitions: pickByAliases(row, ["firearms_ammunitions", "firearms_name"]).trim() || null,
      communications_equipment: pickByAliases(row, ["communications_equipment", "communications_name"]).trim() || null,
      furniture_and_fixtures: pickByAliases(row, ["furniture_and_fixtures", "furniture_name"]).trim() || null,
      office_equipments_sec_equipments: pickByAliases(row, ["office_equipments_sec_equipments", "office_name"]).trim() || null,
      sec_equipments: pickByAliases(row, ["sec_equipments", "sec_name"]).trim() || null,
      vehicle_and_motorcycle: pickByAliases(row, ["vehicle_and_motorcycle", "vehicle_name"]).trim() || null,
      total_amount: toNumber(pickByAliases(row, ["total_amount", "amount"])) || importedAmount,
      grand_total: toNumber(pickByAliases(row, ["grand_total"])) || null,
    };

    const hasIdentity = Boolean((payload.control_number ?? "").trim() || (payload.equipment ?? "").trim() || (payload.particular ?? "").trim() || (payload.date ?? "").trim());
    const displayName = payload.control_number || payload.equipment || payload.particular || payload.date || "Inventory row";

    if (!hasIdentity) {
      return { payload: null, displayName, error: "Missing identity fields (control number/equipment/particular/date)" };
    }

    return { payload, displayName };
  }, [nextInventoryControlNumber]);

  const handleInventoryImport = useCallback(async (rawRows: Record<string, unknown>[]) => {
    if (!canImportInventory) {
      throw new Error("You do not have permission to import inventory files.");
    }

    const rowErrors: string[] = [];
    let skipped = 0;

    const importedRows = rawRows
      .map((row, idx) => {
        const { payload, error } = parseInventoryImportRow(row);
        if (!payload) {
          skipped += 1;
          if (error) rowErrors.push(`Row ${idx + 2}: ${error}`);
        }
        return payload;
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v));

    if (!importedRows.length) throw new Error("No valid inventory rows found in file.");

    const { data: existingRows, error: existingErr } = await supabase
      .from("inventory_fixed_asset")
      .select("id, date, particular, equipment, control_number")
      .limit(10000);
    if (existingErr) throw existingErr;

    const byComposite = new Map<string, string>();
    const byControlNumber = new Map<string, string>();
    const byParticularUnique = new Map<string, string>();
    const byEquipmentUnique = new Map<string, string>();
    const particularCounts = new Map<string, number>();
    const equipmentCounts = new Map<string, number>();
    for (const row of ((existingRows ?? []) as Array<Record<string, unknown>>)) {
      const id = String(row.id ?? "");
      if (!id) continue;
      const controlKey = normalizeControlNumber(row.control_number);
      const equipmentKey = normalizeImportKey(row.equipment);
      const particularKey = normalizeImportKey(row.particular);
      const dateKey = normalizeImportKey(row.date);
      const key = `${particularKey}|${dateKey}`;
      if (key !== "|") byComposite.set(key, id);
      if (controlKey) byControlNumber.set(controlKey, id);

      if (equipmentKey) {
        equipmentCounts.set(equipmentKey, (equipmentCounts.get(equipmentKey) ?? 0) + 1);
        if (!byEquipmentUnique.has(equipmentKey)) byEquipmentUnique.set(equipmentKey, id);
      }

      if (particularKey) {
        particularCounts.set(particularKey, (particularCounts.get(particularKey) ?? 0) + 1);
        if (!byParticularUnique.has(particularKey)) byParticularUnique.set(particularKey, id);
      }
    }

    for (const [particularKey, count] of particularCounts.entries()) {
      if (count > 1) byParticularUnique.delete(particularKey);
    }
    for (const [equipmentKey, count] of equipmentCounts.entries()) {
      if (count > 1) byEquipmentUnique.delete(equipmentKey);
    }

    const deduped = new Map<string, Record<string, unknown>>();
    for (const payload of importedRows) {
      const controlKey = normalizeControlNumber(payload.control_number);
      const equipmentKey = normalizeImportKey(payload.equipment);
      const particularKey = normalizeImportKey(payload.particular);
      const dateKey = normalizeImportKey(payload.date);
      const key = controlKey || (dateKey ? `${particularKey}|${dateKey}` : equipmentKey ? `e:${equipmentKey}` : `p:${particularKey}`);
      if (deduped.has(key)) skipped += 1;
      deduped.set(key, payload);
    }

    let inserted = 0;
    let updated = 0;
    for (const [key, payload] of deduped.entries()) {
      const controlKey = normalizeControlNumber(payload.control_number);
      const equipmentKey = normalizeImportKey(payload.equipment);
      const particularKey = normalizeImportKey(payload.particular);
      const dateKey = normalizeImportKey(payload.date);
      const compositeKey = `${particularKey}|${dateKey}`;
      const id = (controlKey ? byControlNumber.get(controlKey) : undefined)
        ?? byComposite.get(compositeKey)
        ?? (equipmentKey ? byEquipmentUnique.get(equipmentKey) : undefined)
        ?? (particularKey ? byParticularUnique.get(particularKey) : undefined);
      if (id) {
        const upd = await supabase.from("inventory_fixed_asset").update(payload).eq("id", id);
        if (upd.error) {
          skipped += 1;
          rowErrors.push(`Update failed for key ${key}: ${upd.error.message}`);
          continue;
        }
        updated += 1;
      } else {
        const ins = await supabase.from("inventory_fixed_asset").insert(payload);
        if (ins.error) {
          skipped += 1;
          rowErrors.push(`Insert failed for key ${key}: ${ins.error.message}`);
          continue;
        }
        inserted += 1;
      }
    }

    setImportSummary({ inserted, updated, skipped, errors: rowErrors });
    setImportSummaryOpen(true);
    setSuccess(`Import complete. Inserted: ${inserted}, Updated (overwritten): ${updated}.`);
    await loadData();

    return { inserted, updated, skipped, errors: rowErrors };
  }, [canImportInventory, parseInventoryImportRow, loadData]);

  useEffect(() => {
    void Promise.all([loadClientNameOptions(), loadInventoryEquipmentOptions(), loadParaphernaliaBalances()]);
    const channel = supabase
      .channel("realtime:inventory-reference-options")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => {
        void loadClientNameOptions();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia_items" }, () => {
        void Promise.all([loadInventoryEquipmentOptions(), loadParaphernaliaBalances()]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "restock" }, () => {
        void loadParaphernaliaBalances();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia" }, () => {
        void loadParaphernaliaBalances();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadClientNameOptions, loadInventoryEquipmentOptions, loadParaphernaliaBalances]);

  useEffect(() => {
    if (loadingInventoryColumns) return;

    void loadData();
    const channel = supabase
      .channel("realtime:inventory-fixed-asset-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_fixed_asset" }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadingInventoryColumns, inventoryColumnsSignature, loadData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + totalFromRowPrices(r), 0), [rows]);

  const totalQuantity = useMemo(
    () =>
      rows.reduce(
        (sum, r) => sum + totalQuantityFromRow(r),
        0
      ),
    [rows]
  );

  const totalsByCategory = useMemo(
    () =>
      CATEGORY_CONFIGS.map((cfg) => {
        const quantity = rows.reduce((sum, row) => {
          const categoryQuantity = numberValue(row[cfg.qtyRowField]);
          if (categoryQuantity > 0) return sum + categoryQuantity;
          const usesSimpleEquipmentRow = categoryQuantityFromRow(row) <= 0;
          return usesSimpleEquipmentRow && equipmentGroupForName(row.equipment || row.particular) === cfg.group
            ? sum + totalQuantityFromRow(row)
            : sum;
        }, 0);
        const value = rows.reduce(
          (sum, row) => {
            const categoryQuantity = numberValue(row[cfg.qtyRowField]);
            if (categoryQuantity > 0) return sum + lineTotal(categoryQuantity, row[cfg.priceRowField]);
            const usesSimpleEquipmentRow = categoryQuantityFromRow(row) <= 0;
            return usesSimpleEquipmentRow && equipmentGroupForName(row.equipment || row.particular) === cfg.group
              ? sum + totalFromRowPrices(row)
              : sum;
          },
          0
        );
        return { key: cfg.key, label: cfg.label, quantity, value };
      }),
    [rows]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);
  const selectedDetailRow = useMemo(
    () => rows.find((row) => row.id === selectedDetailRowId) ?? null,
    [rows, selectedDetailRowId]
  );
  const detachmentSummaries = useMemo(() => {
    const groups = new Map<string, {
      detachment: string;
      records: number;
      quantity: number;
      value: number;
      paraphernaliaQuantity: number;
      paraphernaliaValue: number;
    }>();
    const ensureGroup = (detachment: string) => {
      const key = normalizeImportKey(detachment);
      const current = groups.get(key) ?? {
        detachment,
        records: 0,
        quantity: 0,
        value: 0,
        paraphernaliaQuantity: 0,
        paraphernaliaValue: 0,
      };
      groups.set(key, current);
      return current;
    };
    for (const name of clientNameOptions) {
      if (name?.trim()) ensureGroup(name.trim());
    }
    for (const row of rows) {
      const detachment = String(row.detachment ?? "").trim() || "Unassigned Detachment";
      const current = ensureGroup(detachment);
      current.records += 1;
      current.quantity += totalQuantityFromRow(row);
      current.value += totalFromRowPrices(row);
    }
    for (const balance of paraphernaliaBalances) {
      const detachment = String(balance.specific_area ?? "").trim() || "Unassigned Detachment";
      const current = ensureGroup(detachment);
      const quantity = numberValue(balance.stock_balance);
      const unitPrice = equipmentPriceByName.get(normalizeEquipmentCatalogName(balance.item)) ?? 0;
      current.paraphernaliaQuantity += quantity;
      current.paraphernaliaValue += lineTotal(quantity, unitPrice);
    }
    return Array.from(groups.values()).sort((a, b) => a.detachment.localeCompare(b.detachment));
  }, [clientNameOptions, equipmentPriceByName, paraphernaliaBalances, rows]);

  const matrixData = useMemo(() => {
    const detachmentList = detachmentSummaries.map((s) => s.detachment);
    const equipmentMap = new Map<string, Map<string, number>>();

    // Seed equipmentMap with all catalog items from EQUIPMENT_NAMES & inventoryEquipmentOptions
    const allKnownItems = new Set<string>();
    for (const name of EQUIPMENT_NAMES) allKnownItems.add(name);
    for (const opt of inventoryEquipmentOptions) if (opt.name) allKnownItems.add(opt.name);

    for (const name of allKnownItems) {
      const norm = normalizeEquipmentName(name);
      if (norm && !equipmentMap.has(norm)) {
        equipmentMap.set(norm, new Map<string, number>());
      }
    }

    const addQty = (equipName: string, detachment: string, qty: number) => {
      const normEquip = normalizeEquipmentName(equipName);
      if (!normEquip) return;
      const normDet = String(detachment || "Unassigned Detachment").trim();
      let detMap = equipmentMap.get(normEquip);
      if (!detMap) {
        detMap = new Map<string, number>();
        equipmentMap.set(normEquip, detMap);
      }
      const prev = detMap.get(normDet) ?? 0;
      detMap.set(normDet, prev + qty);
    };

    for (const row of rows) {
      const equip = row.equipment || row.particular || "UNSPECIFIED FIXED ASSET";
      const det = row.detachment || "Unassigned Detachment";
      const qty = totalQuantityFromRow(row);
      if (qty > 0) {
        addQty(equip, det, qty);
      }
    }

    for (const bal of paraphernaliaBalances) {
      const equip = bal.item || "UNSPECIFIED PARAPHERNALIA";
      const det = bal.specific_area || "Unassigned Detachment";
      const qty = numberValue(bal.stock_balance);
      if (qty > 0) {
        addQty(equip, det, qty);
      }
    }

    const equipmentRows = Array.from(equipmentMap.entries()).map(([equipment, detMap]) => {
      let totalQty = 0;
      const qtysPerDetachment: Record<string, number> = {};
      for (const det of detachmentList) {
        const q = detMap.get(det) ?? 0;
        qtysPerDetachment[det] = q;
        totalQty += q;
      }
      const group = equipmentGroupForName(equipment);
      return {
        equipment,
        group,
        totalQty,
        qtysPerDetachment,
      };
    });

    const groupedByCategory = EQUIPMENT_GROUPS.map((group) => {
      const rowsInGroup = equipmentRows
        .filter((r) => r.group === group)
        .sort((a, b) => a.equipment.localeCompare(b.equipment));
      return {
        group,
        rows: rowsInGroup,
      };
    });

    return {
      detachments: detachmentList,
      equipmentRows,
      groupedByCategory,
    };
  }, [detachmentSummaries, inventoryEquipmentOptions, paraphernaliaBalances, rows]);
  const selectedDetachmentRows = useMemo(() => {
    if (!selectedDetachmentView) return [];
    if (selectedDetachmentView === "__ALL__") return rows;
    const key = normalizeImportKey(selectedDetachmentView);
    return rows.filter((row) => normalizeImportKey(row.detachment || "Unassigned Detachment") === key);
  }, [rows, selectedDetachmentView]);
  const selectedDetachmentItems = useMemo(() => {
    const items = new Map<string, DetachmentItemSummary>();
    for (const row of selectedDetachmentRows) {
      for (const line of inventoryItemLinesFromRow(row)) {
        const key = `${line.group}:${normalizeEquipmentCatalogName(line.item)}`;
        const current = items.get(key) ?? { ...line, key, quantity: 0, unitValue: 0, totalValue: 0 };
        current.quantity += line.quantity;
        current.totalValue += line.totalValue;
        current.unitValue = current.quantity > 0 ? current.totalValue / current.quantity : line.unitValue;
        items.set(key, current);
      }
    }
    return Array.from(items.values()).sort((a, b) => a.group.localeCompare(b.group) || a.item.localeCompare(b.item));
  }, [selectedDetachmentRows]);
  const selectedDetachmentTotals = useMemo(() => ({
    records: selectedDetachmentRows.length,
    quantity: selectedDetachmentRows.reduce((sum, row) => sum + totalQuantityFromRow(row), 0),
    value: selectedDetachmentRows.reduce((sum, row) => sum + totalFromRowPrices(row), 0),
  }), [selectedDetachmentRows]);
  const selectedDetachmentParaphernalia = useMemo(() => {
    if (!selectedDetachmentView) return [];
    const selectedKey = normalizeImportKey(selectedDetachmentView);
    const grouped = new Map<string, {
      key: string;
      detachment: string;
      item: string;
      group: EquipmentGroup;
      quantity: number;
      unitValue: number;
      totalValue: number;
    }>();
    for (const row of paraphernaliaBalances) {
      if (selectedDetachmentView !== "__ALL__" && normalizeImportKey(row.specific_area || "Unassigned Detachment") !== selectedKey) continue;
        const item = normalizeEquipmentCatalogName(row.item) || "UNSPECIFIED ITEM";
        const quantity = numberValue(row.stock_balance);
        const unitValue = equipmentPriceByName.get(item) ?? 0;
        const detachment = String(row.specific_area ?? "").trim() || "Unassigned Detachment";
        const key = `${normalizeImportKey(detachment)}:${item}`;
        const current = grouped.get(key) ?? {
          key,
          detachment,
          item,
          group: equipmentGroupForName(item),
          quantity: 0,
          unitValue,
          totalValue: 0,
        };
        current.quantity += quantity;
        current.totalValue += lineTotal(quantity, unitValue);
        grouped.set(key, current);
    }
    return Array.from(grouped.values())
      .sort((a, b) => a.detachment.localeCompare(b.detachment) || a.group.localeCompare(b.group) || a.item.localeCompare(b.item));
  }, [equipmentPriceByName, paraphernaliaBalances, selectedDetachmentView]);
  const selectedParaphernaliaTotals = useMemo(() => ({
    quantity: selectedDetachmentParaphernalia.reduce((sum, row) => sum + row.quantity, 0),
    value: selectedDetachmentParaphernalia.reduce((sum, row) => sum + row.totalValue, 0),
  }), [selectedDetachmentParaphernalia]);

  function inventoryExportRows() {
    return filtered.map((row) => {
      const out: Record<string, string | number> = {};
      if (showEquipmentColumn) out.Equipment = row.equipment ?? "-";
      if (showControlNumberColumn) out.CONTROLNUMBER = row.control_number ?? "-";
      if (showSerialPlateColumn) out["Serial # / Plate #"] = row.serial_plate_number ?? "-";
      if (showMakerColumn) out.Maker = row.maker ?? "-";
      if (showModelColumn) out["Model #"] = row.model_number ?? "-";
      if (showDetachmentColumn) out.Detachment = row.detachment ?? "-";
      if (showRemarksColumn) out.Remarks = row.remarks ?? "-";
      if (showUnitCostColumn) out["Unit Cost"] = row.unit_cost ?? "";
      if (showDatePurchasedColumn) out["Date of Purchased"] = row.date_purchased ?? "-";
      if (showExpirationColumn) out.Expiration = row.expiration ?? "-";
      if (showLastMaintenanceColumn) out["Last Maintenance"] = row.last_maintenance ?? "-";
      if (showUserColumn) out.User = [row.user_text, row.user_attachment].filter(Boolean).join(" | ") || "-";
      if (showDateColumn) out.Date = row.date ?? "—";
      if (showParticularColumn) out.Particular = row.particular ?? "—";
      for (const cfg of visibleCategoryConfigs) {
        const name = String(row[cfg.nameRowField] ?? "").trim() || "—";
        const qty = Number(row[cfg.qtyRowField] ?? 0) || 0;
        const price = Number(row[cfg.priceRowField] ?? 0) || 0;
        out[`${cfg.label} Name`] = name;
        out[`${cfg.label} Qty`] = qty;
        out[`${cfg.label} Price`] = price;
        out[`${cfg.label} Total`] = lineTotal(qty, price);
      }
      if (showRowTotalColumn) out["Row Total"] = totalFromRowPrices(row);
      if (showGrandTotalColumn) out["Grand Total"] = row.grand_total ?? totalFromRowPrices(row);
      out["Last Updated"] = formatTimestamp(row.last_updated_at);
      return out;
    });
  }

  function inventoryExportFileBase() {
    return `inventory_export_${new Date().toISOString().slice(0, 10)}`;
  }

  async function exportInventoryXlsx() {
    const exportRows = inventoryExportRows();
    if (!exportRows.length) {
      setError("No rows available for export.");
      return;
    }
    const out = await buildBrandedWorkbookBuffer([
      {
        name: "Inventory",
        title: "Inventory Export",
        subtitle: "Inventory snapshots and totals",
        rows: exportRows,
      },
    ]);
    downloadBlob(`${inventoryExportFileBase()}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  function exportInventoryCsv() {
    const exportRows = inventoryExportRows();
    if (!exportRows.length) {
      setError("No rows available for export.");
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(buildBrandedAoa(exportRows, "Inventory Export", "Inventory snapshots and totals"));
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(`${inventoryExportFileBase()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  async function exportInventoryPdf() {
    const exportRows = inventoryExportRows();
    if (!exportRows.length) {
      setError("No rows available for export.");
      return;
    }
    const headers = Object.keys(exportRows[0]);
    const body = exportRows.map((row) => headers.map((h) => String(row[h] ?? "")));
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const startY = await addBrandedPdfHeader(doc, "Inventory Export", "Inventory snapshots and totals");
    autoTable(doc, {
      startY: startY + 10,
      head: [headers],
      body,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
    });
    doc.save(`${inventoryExportFileBase()}.pdf`);
  }

  function rowToForm(row: InventoryRow): InventoryForm {
    return {
      equipment: row.equipment ?? "",
      control_number: row.control_number ?? "",
      serial_plate_number: row.serial_plate_number ?? "",
      maker: row.maker ?? "",
      model_number: row.model_number ?? "",
      detachment: row.detachment ?? "",
      date: row.date ?? "",
      particular: row.particular ?? "",
      quanitity: String(Number(row.quanitity ?? 0) || 0),
      firearms_name: row.firearms_name ?? "",
      firearms_qty: String(Number(row.firearms_qty ?? 0) || 0),
      firearms_price: String(Number(row.firearms_price ?? 0) || 0),
      communications_name: row.communications_name ?? "",
      communications_qty: String(Number(row.communications_qty ?? 0) || 0),
      communications_price: String(Number(row.communications_price ?? 0) || 0),
      furniture_name: row.furniture_name ?? "",
      furniture_qty: String(Number(row.furniture_qty ?? 0) || 0),
      furniture_price: String(Number(row.furniture_price ?? 0) || 0),
      office_name: row.office_name ?? "",
      office_qty: String(Number(row.office_qty ?? 0) || 0),
      office_price: String(Number(row.office_price ?? 0) || 0),
      sec_name: row.sec_name ?? "",
      sec_qty: String(Number(row.sec_qty ?? 0) || 0),
      sec_price: String(Number(row.sec_price ?? 0) || 0),
      vehicle_name: row.vehicle_name ?? "",
      vehicle_qty: String(Number(row.vehicle_qty ?? 0) || 0),
      vehicle_price: String(Number(row.vehicle_price ?? 0) || 0),
      remarks: row.remarks ?? "",
      unit_cost: String(Number(row.unit_cost ?? 0) || 0),
      date_purchased: row.date_purchased ?? "",
      expiration: row.expiration ?? "",
      last_maintenance: row.last_maintenance ?? "",
      user_text: row.user_text ?? "",
      user_attachment: row.user_attachment ?? "",
    };
  }

  function openEditModal(row: InventoryRow) {
    if (!canMutateInventory) return;
    setEditingRowId(row.id);
    setFormData(rowToForm(row));
    setUserAttachmentFile(null);
    setShowEditModal(true);
    setShowAddModal(false);
    setError("");
    setSuccess("");
  }

  function openDetailsModal(row: InventoryRow) {
    setSelectedDetailRowId(row.id);
    setError("");
    setSuccess("");
  }

  function closeDetailsModal() {
    setSelectedDetailRowId(null);
  }

  function editSelectedDetailRow() {
    if (!selectedDetailRow) return;
    closeDetailsModal();
    openEditModal(selectedDetailRow);
  }

  function closeModals() {
    setShowAddModal(false);
    setShowEditModal(false);
    setEditingRowId(null);
    setFormData(EMPTY_FORM);
    setUserAttachmentFile(null);
  }

  async function uploadInventoryAttachment(file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `inventory/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(INVENTORY_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(INVENTORY_BUCKET).getPublicUrl(path);
    return data.publicUrl || path;
  }

  async function buildInventoryPayload(totalAmount: number, totalQuantity: number, grandTotalValue?: number) {
    const uploadedAttachment = userAttachmentFile ? await uploadInventoryAttachment(userAttachmentFile) : null;
    const controlNumber =
      normalizeControlNumber(formData.control_number) ||
      (formData.equipment.trim() ? nextInventoryControlNumber(formData.equipment.trim()) : "");

    return {
      equipment: formData.equipment.trim() || null,
      control_number: controlNumber || null,
      serial_plate_number: formData.serial_plate_number.trim() || null,
      maker: formData.maker.trim() || null,
      model_number: formData.model_number.trim() || null,
      detachment: formData.detachment.trim() || null,
      date: formData.date,
      particular: formData.particular.trim(),
      quanitity: totalQuantity,
      amount: totalAmount,
      remarks: formData.remarks.trim() || null,
      unit_cost: toNumber(formData.unit_cost),
      date_purchased: formData.date_purchased || null,
      expiration: formData.expiration || null,
      last_maintenance: formData.last_maintenance || null,
      user_text: formData.user_text.trim() || null,
      user_attachment: uploadedAttachment || formData.user_attachment.trim() || null,
      firearms_name: formData.firearms_name.trim() || null,
      firearms_qty: toNumber(formData.firearms_qty),
      firearms_price: toNumber(formData.firearms_price),
      communications_name: formData.communications_name.trim() || null,
      communications_qty: toNumber(formData.communications_qty),
      communications_price: toNumber(formData.communications_price),
      furniture_name: formData.furniture_name.trim() || null,
      furniture_qty: toNumber(formData.furniture_qty),
      furniture_price: toNumber(formData.furniture_price),
      office_name: formData.office_name.trim() || null,
      office_qty: toNumber(formData.office_qty),
      office_price: toNumber(formData.office_price),
      sec_name: formData.sec_name.trim() || null,
      sec_qty: toNumber(formData.sec_qty),
      sec_price: toNumber(formData.sec_price),
      vehicle_name: formData.vehicle_name.trim() || null,
      vehicle_qty: toNumber(formData.vehicle_qty),
      vehicle_price: toNumber(formData.vehicle_price),
      firearms_ammunitions: formData.firearms_name.trim() || null,
      communications_equipment: formData.communications_name.trim() || null,
      furniture_and_fixtures: formData.furniture_name.trim() || null,
      office_equipments_sec_equipments: formData.office_name.trim() || null,
      sec_equipments: formData.sec_name.trim() || null,
      vehicle_and_motorcycle: formData.vehicle_name.trim() || null,
      total_amount: totalAmount,
      ...(grandTotalValue == null ? {} : { grand_total: grandTotalValue }),
    };
  }

  async function addRow() {
    if (!canMutateInventory || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const totalAmount = totalFromPrices(formData);
    const totalQuantity = totalQuantityFromForm(formData);
    const nextGrandTotal = grandTotal + totalAmount;

    if (!formData.particular.trim() && !formData.equipment.trim()) {
      setSaving(false);
      setError("Equipment or Particular is required.");
      return;
    }

    const payload = {
      ...(await buildInventoryPayload(totalAmount, totalQuantity, nextGrandTotal)),
      date: formData.date || null,
      particular: formData.particular.trim() || formData.equipment.trim(),
      last_updated_at: null,
    };

    const res = await supabase.from("inventory_fixed_asset").insert(payload);

    setSaving(false);
    if (res.error) {
      setError(res.error.message || "Failed to save inventory record");
      return;
    }

    setSuccess("Inventory record saved.");
    closeModals();
    await loadData();
  }

  async function updateRow() {
    if (!canMutateInventory || saving || !editingRowId) return;
    setSaving(true);
    setError("");
    setSuccess("");

    if (!formData.particular.trim() && !formData.equipment.trim()) {
      setSaving(false);
      setError("Equipment or Particular is required.");
      return;
    }

    const totalAmount = totalFromPrices(formData);
    const totalQuantity = totalQuantityFromForm(formData);

    const payload = {
      ...(await buildInventoryPayload(totalAmount, totalQuantity)),
      date: formData.date || null,
      particular: formData.particular.trim() || formData.equipment.trim(),
      last_updated_at: new Date().toISOString(),
    };

    const res = await supabase.from("inventory_fixed_asset").update(payload).eq("id", editingRowId);

    setSaving(false);
    if (res.error) {
      setError(res.error.message || "Failed to update inventory record");
      return;
    }

    setSuccess("Inventory record updated.");
    closeModals();
    await loadData();
  }

  async function deleteRow(row: InventoryRow) {
    if (!canMutateInventory || saving) return;

    const label = (row.particular ?? "").trim() || row.date || "this inventory record";
    const ok = globalThis.confirm ? globalThis.confirm(`Delete ${label}? This cannot be undone.`) : true;
    if (!ok) return;

    setSaving(true);

    setError("");
    setSuccess("");

    const res = await supabase.from("inventory_fixed_asset").delete().eq("id", row.id);

    setSaving(false);
    if (res.error) {
      setError(res.error.message || "Failed to delete inventory record");
      return;
    }

    setSuccess("Inventory record deleted.");
    if (editingRowId === row.id) closeModals();
    await loadData();
  }


  async function deleteEditingRow() {
    if (!editingRowId) return;
    const row = rows.find((item) => item.id === editingRowId);
    if (!row) {
      closeModals();
      await loadData();
      return;
    }
    await deleteRow(row);
  }

  const mainInventoryHeaderCell = (align = "text-left", rounded = "") =>
    `sticky top-0 z-20 bg-[#FFDA03] px-4 py-3 ${align} font-semibold text-black whitespace-nowrap shadow-[0_2px_0_rgba(0,0,0,0.16)] ${rounded}`;

  return (
    <>
      <section className="glass-panel animate-slide-up rounded-3xl p-6 space-y-5">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="text-lg font-semibold text-black">Logistics • Fixed Asset Inventory</div>
            <div className="text-sm text-gray-500">Per-category quantity and price tracking for all fixed assets.</div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canMutateInventory ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="animated-btn px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
                >
                  Insert Information
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemManagerError("");
                    setItemManagerMessage("");
                    setItemManagerOpen(true);
                  }}
                  className="animated-btn flex items-center gap-2 px-4 py-2 rounded-xl border bg-white text-sm font-semibold text-black hover:bg-gray-50"
                >
                  <Pencil className="w-4 h-4" />
                  Manage Items
                </button>
              </>
            ) : null}

            {canImportInventory ? (
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                disabled={importing}
                className="animated-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white text-sm text-black hover:bg-white disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                {importing ? "Importing..." : "Import Excel/CSV"}
              </button>
            ) : null}

            {canDownloadInventoryTemplate ? (
              <>
                <button
    type="button"
    onClick={() => setShowTemplatePopup(true)}
    className="animated-btn flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
  >
    <Download className="w-4 h-4" />
    Download Templates
  </button>
              </>
            ) : null}

            {canExportInventory ? (
              <>
               <button
    type="button"
    onClick={() => setShowExportPopup(true)}
    className="animated-btn flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white"
  >
    <FileText className="w-4 h-4" />
    Export
  </button>
              </>

              
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importSpreadsheet(f);
              }}
            />
          </div>
        </div>

        

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {canViewInventoryColumn("quanitity") ? (
            <div className="glass-panel animate-slide-up rounded-2xl border-none p-4">
              <div className="text-xs text-gray-500">Total Quantity</div>
              <div className="text-xl font-semibold text-black">{totalQuantity.toLocaleString()}</div>
            </div>
          ) : null}
          {showRowTotalColumn ? (
            <div className="glass-panel animate-slide-up rounded-2xl border-none p-4">
              <div className="text-xs text-gray-500">Total Amount (Sum of Rows)</div>
              <div className="text-xl font-semibold text-black">₱ {toMoney(grandTotal)}</div>
            </div>
          ) : null}
          {showGrandTotalColumn ? (
            <div className="glass-panel animate-slide-up rounded-2xl border-none p-4">
              <div className="text-xs text-gray-500">Grand Total</div>
              <div className="text-xl font-semibold text-black">₱ {toMoney(grandTotal)}</div>
            </div>
          ) : null}
        </div>
        {showDetachmentColumn ? (
          <div className="rounded-3xl border border-[#e5dcc7] bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold text-black">
                  <Boxes className="h-5 w-5 text-[#8B1C1C]" />
                  Inventory by Detachment / Specific Area
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  Equipment & Paraphernalia breakdown across all client detachments.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl bg-gray-100 p-1 border">
                  <button
                    type="button"
                    onClick={() => setInventoryViewMode("grid")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      inventoryViewMode === "grid" ? "bg-[#8B1C1C] text-white shadow-sm" : "text-gray-600 hover:text-black"
                    }`}
                  >
                    Detachment Cards Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryViewMode("matrix")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      inventoryViewMode === "matrix" ? "bg-[#8B1C1C] text-white shadow-sm" : "text-gray-600 hover:text-black"
                    }`}
                  >
                    FSAI Equipment Matrix (Spreadsheet)
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetachmentView("__ALL__")}
                  className="rounded-xl bg-[#8B1C1C] px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110"
                >
                  View All Inventory
                </button>
              </div>
            </div>

            {inventoryViewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                {detachmentSummaries.length ? detachmentSummaries.map((summary) => (
                  <button
                    key={summary.detachment}
                    type="button"
                    onClick={() => setSelectedDetachmentView(summary.detachment)}
                    className="group relative rounded-2xl border-2 border-amber-300 bg-white p-4 text-left transition-all duration-200 hover:border-[#8B1C1C] hover:bg-[#fffdf5] hover:shadow-lg flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#8B1C1C] shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#8B1C1C]">DETACHMENT</span>
                      </div>
                      <div className="font-extrabold text-sm text-slate-900 leading-snug break-words group-hover:text-[#8B1C1C] transition-colors" title={summary.detachment}>
                        {summary.detachment}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <span className="rounded-md bg-amber-100/90 px-2 py-0.5 text-amber-950 font-bold">{summary.quantity} fixed</span>
                        <span className="rounded-md bg-emerald-100/90 px-2 py-0.5 text-emerald-950 font-bold">{summary.paraphernaliaQuantity} para</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-amber-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Total Value</span>
                      <span className="text-sm font-black text-[#8B1C1C]">
                        PHP {toMoney(summary.value + summary.paraphernaliaValue)}
                      </span>
                    </div>
                  </button>
                )) : (
                  <div className="col-span-full rounded-2xl border border-dashed px-4 py-6 text-sm text-gray-500 text-center">
                    No detachment inventory records available.
                  </div>
                )}
              </div>
            ) : (
              <TableZoomWrapper storageKey="fsai-inventory-matrix" defaultZoom={0.85}>
                <div className="relative overflow-x-auto rounded-2xl border bg-white max-h-[500px]">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#FFDA03] text-black font-bold">
                      <tr>
                        <th className="px-3 py-2.5 text-left border-2 border-amber-400 text-slate-950 font-black">EQUIPMENT</th>
                        <th className="px-3 py-2.5 text-center border-2 border-amber-400 text-[#8B1C1C] font-black">TOTAL QTY</th>
                        {matrixData.detachments.map((det) => (
                          <th key={det} className="px-3 py-2.5 text-center border-2 border-amber-400 bg-[#FFDA03] min-w-[130px] max-w-[170px] whitespace-normal font-black text-xs text-slate-950 leading-tight" title={det}>
                            <div className="line-clamp-2 uppercase tracking-wide">{det}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixData.groupedByCategory.some((c) => c.rows.length > 0) ? (
                        matrixData.groupedByCategory.map((catGroup) => (
                          <tr key={`matrix-group-${catGroup.group}`} className="contents">
                            {catGroup.rows.length > 0 ? (
                              <tr className="sticky z-5 left-0">
                                <td
                                  colSpan={matrixData.detachments.length + 2}
                                  className="px-4 py-2.5 bg-[#8B1C1C] text-white font-black text-xs uppercase tracking-widest border-y-2 border-amber-400"
                                >
                                  ❖ CATEGORY: {catGroup.group} ({catGroup.rows.length} Items)
                                </td>
                              </tr>
                            ) : null}
                            {catGroup.rows.map((row, idx) => (
                              <tr key={`${row.equipment}-${idx}`} className="border-b hover:bg-amber-50/50">
                                <td className="px-3 py-2 font-semibold text-gray-900 border truncate max-w-[200px]" title={row.equipment}>
                                  {row.equipment}
                                </td>
                                <td className="px-3 py-2 text-center font-bold text-[#8B1C1C] border bg-amber-50">
                                  {row.totalQty}
                                </td>
                                {matrixData.detachments.map((det) => {
                                  const q = row.qtysPerDetachment[det] ?? 0;
                                  return (
                                    <td
                                      key={det}
                                      className={`px-2 py-2 text-center border font-medium ${
                                        q > 0 ? "bg-emerald-100 text-emerald-900 font-bold text-sm" : "text-gray-300 bg-white"
                                      }`}
                                    >
                                      {q > 0 ? q : ""}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={matrixData.detachments.length + 2} className="px-4 py-8 text-center text-gray-500">
                            No equipment matrix records available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TableZoomWrapper>
            )}
          </div>
        ) : null}

        <div className="flex items-center gap-3 glass-panel rounded-2xl px-4 py-3 max-w-xl">
          <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
            <Search className="w-5 h-5 text-black" />
          </div>
          <input
            placeholder="Search inventory..."
            className="flex-1 outline-none text-sm text-black"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {error ? <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-2xl border bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        <TableZoomWrapper storageKey="inventory" defaultZoom={0.8}>
        <div className="relative overflow-x-auto rounded-2xl glass-panel animate-slide-up">
          <table className="w-full text-sm text-black min-w-[1200px] border-separate border-spacing-y-2">
            <thead>
              <tr className="bg-[#FFDA03]">
                {showEquipmentColumn ? <th className={mainInventoryHeaderCell("text-left", "rounded-l-xl")}>EQUIPMENT</th> : null}
                {showControlNumberColumn ? <th className={mainInventoryHeaderCell()}>CONTROLNUMBER</th> : null}
                {showSerialPlateColumn ? <th className={mainInventoryHeaderCell()}>SERIAL # / PLATE #</th> : null}
                {showMakerColumn ? <th className={mainInventoryHeaderCell()}>MAKER</th> : null}
                {showModelColumn ? <th className={mainInventoryHeaderCell()}>MODEL #</th> : null}
                {showDetachmentColumn ? <th className={mainInventoryHeaderCell()}>DETACHMENT</th> : null}
                {showRemarksColumn ? <th className={mainInventoryHeaderCell()}>REMARKS</th> : null}
                {showUnitCostColumn ? <th className={mainInventoryHeaderCell("text-right")}>UNIT COST</th> : null}
                {showDatePurchasedColumn ? <th className={mainInventoryHeaderCell()}>DATE OF PURCHASED</th> : null}
                {showExpirationColumn ? <th className={mainInventoryHeaderCell()}>EXPIRATION</th> : null}
                {showLastMaintenanceColumn ? <th className={mainInventoryHeaderCell()}>LAST MAINTENANCE</th> : null}
                {showUserColumn ? <th className={mainInventoryHeaderCell()}>USER</th> : null}
                {showDateColumn ? <th className={mainInventoryHeaderCell()}>Date</th> : null}
                {showParticularColumn ? <th className={mainInventoryHeaderCell()}>Particular</th> : null}
                {showRowTotalColumn ? <th className={mainInventoryHeaderCell("text-right")}>Row Total</th> : null}
                <th className={mainInventoryHeaderCell()}>Last Updated</th>
                {canMutateInventory ? <th className={mainInventoryHeaderCell("text-center", "rounded-r-xl")}>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={inventoryTableColumnCount} className="px-4 py-8 text-center text-gray-500">
                    <LoadingCircle label="Loading inventory..." className="py-2" />
                  </td>
                </tr>
              ) : paginated.length ? (
                paginated.map((row) => (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      openDetailsModal(row);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetailsModal(row);
                      }
                    }}
                    className="animated-row cursor-pointer border-b border-gray-100 transition hover:shadow-md"
                  >
                    {showEquipmentColumn ? <td className="px-4 py-3 font-semibold whitespace-nowrap rounded-l-xl">{row.equipment || "-"}</td> : null}
                    {showControlNumberColumn ? <td className="px-4 py-3 whitespace-nowrap">{row.control_number || "-"}</td> : null}
                    {showSerialPlateColumn ? <td className="px-4 py-3 whitespace-nowrap">{row.serial_plate_number || "-"}</td> : null}
                    {showMakerColumn ? <td className="px-4 py-3 whitespace-nowrap">{row.maker || "-"}</td> : null}
                    {showModelColumn ? <td className="px-4 py-3 whitespace-nowrap">{row.model_number || "-"}</td> : null}
                    {showDetachmentColumn ? (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedDetachmentView(row.detachment?.trim() || "Unassigned Detachment");
                          }}
                          className="rounded-full border border-amber-300 bg-[#fff9e6] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#FFDA03]"
                        >
                          {row.detachment || "Unassigned Detachment"}
                        </button>
                      </td>
                    ) : null}
                    {showRemarksColumn ? <td className="px-4 py-3 min-w-[180px]">{row.remarks || "-"}</td> : null}
                    {showUnitCostColumn ? <td className="px-4 py-3 text-right whitespace-nowrap">PHP {toMoney(Number(row.unit_cost ?? 0) || 0)}</td> : null}
                    {showDatePurchasedColumn ? <td className="px-4 py-3 whitespace-nowrap">{formatDateCell(row.date_purchased)}</td> : null}
                    {showExpirationColumn ? <td className="px-4 py-3 whitespace-nowrap">{formatDateCell(row.expiration)}</td> : null}
                    {showLastMaintenanceColumn ? <td className="px-4 py-3 whitespace-nowrap">{formatDateCell(row.last_maintenance)}</td> : null}
                    {showUserColumn ? (
                      <td className="px-4 py-3 min-w-[220px]">
                        <div>{row.user_text || "-"}</div>
                        {row.user_attachment ? (
                          <a href={row.user_attachment} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-blue-700 underline">
                            View file
                          </a>
                        ) : null}
                      </td>
                    ) : null}
                    {showDateColumn ? <td className="px-4 py-3 whitespace-nowrap">{row.date || "—"}</td> : null}
                    {showParticularColumn ? <td className="px-4 py-3">{row.particular || "—"}</td> : null}
                    {showRowTotalColumn ? <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">₱ {toMoney(totalFromRowPrices(row))}</td> : null}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatTimestamp(row.last_updated_at)}</td>
                    {canMutateInventory ? (
                      <td className="px-4 py-3 text-center rounded-r-xl">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            className="animated-btn px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(row);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="animated-btn px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-sm text-red-700 hover:bg-red-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteRow(row);
                            }}
                            disabled={saving}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={inventoryTableColumnCount} className="px-4 py-8 text-center text-gray-500">No records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </TableZoomWrapper>

        {showGrandTotalColumn ? (
          <div className="glass-panel rounded-2xl border-none px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-700">Grand Total (Bottom)</div>
            <div className="text-lg font-semibold text-black">₱ {toMoney(grandTotal)}</div>
          </div>
        ) : null}

        <div className="flex justify-between items-center text-sm">
          <span>Page {pageClamped} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={pageClamped === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border rounded-lg disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={pageClamped === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded-lg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        
      </section>




        {showExportPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">

          <div className="bg-white w-[750px] rounded-2xl shadow-xl overflow-hidden">

            {/* HEADER */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-2xl font-semibold">
                Export Inventory
              </h2>

              <button
                onClick={() => setShowExportPopup(false)}
                className="border px-4 py-2 rounded-xl hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            {/* BODY */}
            <div className="p-6">

              <p className="text-gray-600 mb-6">
                Choose the format you want to export.
              </p>

              <div className="flex gap-4">

                <button 
                onClick={exportInventoryXlsx}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white">
                  <FileDown className="w-4 h-4" />
                  Export XLSX
                </button>

                <button 
                onClick={exportInventoryCsv}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white">
                  <FileDown className="w-4 h-4" />
                  Export CSV
                </button>

                <button 
                onClick={exportInventoryPdf}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white">
                  <FileText className="w-4 h-4" />
                  Export PDF
                </button>

              </div>

            </div>

          </div>

        </div>
      )}


{showTemplatePopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">

          <div className="bg-white w-[750px] rounded-2xl shadow-xl overflow-hidden">

            {/* HEADER */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-2xl font-semibold">
                Download Templates
              </h2>

              <button
                onClick={() => setShowTemplatePopup(false)}
                className="border px-4 py-2 rounded-xl hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            {/* BODY */}
            <div className="p-6">

              <p className="text-gray-600 mb-6">
                Download a template file for importing inventory data.
              </p>

              <div className="flex gap-4">

                <button 
                onClick={downloadInventoryTemplateXlsx}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white">
                 <Download className="w-4 h-4" />
                  Template XLSX
                </button>

                <button 
                onClick={downloadInventoryTemplateCsv}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-black hover:bg-white">
                  <Download className="w-4 h-4" />
                  Template CSV
                </button>

              </div>

            </div>

          </div>

        </div>
)}

      {itemManagerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[#fffefb] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border-2 border-amber-200">
            {/* HEADER */}
            <div className="flex items-start justify-between px-6 py-4 border-b bg-[#fff9e6]">
              <div>
                <h2 className="text-2xl font-extrabold text-black">Manage Inventory Items</h2>
                <p className="text-xs font-semibold text-gray-600 mt-1">
                  These items appear in the typed ITEMS dropdown. Removing an item hides it from future selections but does not remove old stock records.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!itemBusy) setItemManagerOpen(false); }}
                className="border-2 border-slate-300 bg-white px-4 py-2 rounded-xl hover:bg-gray-100 font-bold text-sm text-black"
              >
                Close
              </button>
            </div>

            {/* BODY */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {itemManagerError ? (
                <div className="rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold">{itemManagerError}</div>
              ) : null}
              {itemManagerMessage ? (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-semibold">{itemManagerMessage}</div>
              ) : null}

              {/* INPUT CARD */}
              <div className="grid grid-cols-1 gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-4 md:grid-cols-[1fr_220px_160px_auto]">
                <label className="block">
                  <span className="block text-xs font-extrabold uppercase tracking-wide text-gray-600 mb-1">NEW ITEM NAME</span>
                  <input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2 text-sm text-black font-semibold outline-none focus:ring-2 focus:ring-[#FFDA03]"
                    placeholder="Type item name"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-extrabold uppercase tracking-wide text-gray-600 mb-1">EQUIPMENT CATEGORY</span>
                  <select
                    value={newItemGroup}
                    onChange={(e) => setNewItemGroup(e.target.value as EquipmentGroup)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2 text-sm text-black font-semibold outline-none focus:ring-2 focus:ring-[#FFDA03]"
                  >
                    {EQUIPMENT_GROUPS.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-extrabold uppercase tracking-wide text-gray-600 mb-1">UNIT PRICE</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2 text-sm text-black font-semibold outline-none focus:ring-2 focus:ring-[#FFDA03]"
                    placeholder="0.00"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void addItemOption()}
                    disabled={itemBusy}
                    className="w-full rounded-xl bg-[#FFDA03] px-5 py-2 text-sm font-black text-black hover:brightness-95 disabled:opacity-60"
                  >
                    {itemBusy ? "Saving..." : "Add Item"}
                  </button>
                </div>
              </div>

              {/* SEARCH BAR */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={itemManagerSearch}
                  onChange={(e) => setItemManagerSearch(e.target.value)}
                  className="w-full rounded-2xl border-2 border-slate-200 pl-10 pr-4 py-2.5 text-sm text-black font-medium outline-none focus:ring-2 focus:ring-[#FFDA03]"
                  placeholder="Search item name, category, inventory type, or price..."
                />
              </div>

              {/* ITEMS TABLE */}
              <TableZoomWrapper storageKey="inventory-manage-items" defaultZoom={0.85}>
                <div className="max-h-[45vh] overflow-auto rounded-2xl border-2 border-slate-200 bg-white">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#FFDA03] text-black font-black">
                      <tr>
                        <th className="px-4 py-3">ITEMS</th>
                        <th className="px-4 py-3">Equipment Category</th>
                        <th className="px-4 py-3">Unit Price</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {managedItemOptions.length ? (
                        managedItemOptions.map((item) => (
                          <tr key={`${item.name}-manager`} className="hover:bg-amber-50/50">
                            <td className="px-4 py-3 font-extrabold text-slate-900">{item.name}</td>
                            <td className="px-4 py-3 text-slate-700 font-semibold">{item.group}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={itemPriceDrafts[item.name] ?? String(item.unitPrice)}
                                onChange={(e) => setItemPriceDrafts((prev) => ({ ...prev, [item.name]: e.target.value }))}
                                className="w-32 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-right text-sm text-black font-bold"
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveItemPrice(item)}
                                  disabled={itemBusy}
                                  className="rounded-xl border-2 border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-slate-50 disabled:opacity-60"
                                >
                                  Save Price
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeItemOption(item)}
                                  disabled={itemBusy}
                                  className="rounded-xl border-2 border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-500 font-semibold">
                            No matching items found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TableZoomWrapper>
            </div>
          </div>
        </div>
      )}

      {selectedDetachmentView ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
          onClick={() => setSelectedDetachmentView(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#fffdf5] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 bg-gradient-to-r from-slate-950 via-slate-800 to-[#8B1C1C] px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFDA03]">Detachment Inventory</div>
                  <h2 className="mt-2 text-2xl font-bold">
                    {selectedDetachmentView === "__ALL__" ? "All Detachments" : selectedDetachmentView}
                  </h2>
                  <p className="mt-1 text-sm text-white/75">Complete item quantities, individual values, asset values, and record details.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetachmentView(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 hover:bg-white/20"
                  aria-label="Close detachment inventory"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5 md:p-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inventory Records</div>
                  <div className="mt-2 text-2xl font-bold text-black">{selectedDetachmentTotals.records.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Quantity</div>
                  <div className="mt-2 text-2xl font-bold text-black">{selectedDetachmentTotals.quantity.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-[#fff3b0] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#6d4b00]">Fixed Asset Value</div>
                  <div className="mt-2 text-2xl font-bold text-[#8B1C1C]">PHP {toMoney(selectedDetachmentTotals.value)}</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Paraphernalia Balance</div>
                  <div className="mt-2 text-2xl font-bold text-emerald-800">{selectedParaphernaliaTotals.quantity.toLocaleString()}</div>
                  <div className="mt-1 text-xs font-semibold text-emerald-700">PHP {toMoney(selectedParaphernaliaTotals.value)}</div>
                </div>
              </div>

              <section className="space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-black">Items and Individual Values</h3>
                  <p className="text-sm text-gray-600">Repeated items are combined to show their total quantity and average individual value.</p>
                </div>
                <div className="overflow-x-auto rounded-2xl border bg-white">
                  <table className="min-w-[760px] w-full text-left text-sm text-black">
                    <thead className="bg-[#FFDA03]">
                      <tr>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3 text-right">Individual Value</th>
                        <th className="px-4 py-3 text-right">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedDetachmentItems.length ? selectedDetachmentItems.map((item) => (
                        <tr key={item.key}>
                          <td className="px-4 py-3 text-gray-600">{item.group}</td>
                          <td className="px-4 py-3 font-semibold">{item.item}</td>
                          <td className="px-4 py-3 text-right">{item.quantity.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">PHP {toMoney(item.unitValue)}</td>
                          <td className="px-4 py-3 text-right font-bold">PHP {toMoney(item.totalValue)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No item values are available for this detachment.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-black">Connected Paraphernalia Balance</h3>
                  <p className="text-sm text-gray-600">Live Stock In minus Stock Out balances from the Paraphernalia page, valued using the shared item catalog.</p>
                </div>
                <div className="overflow-x-auto rounded-2xl border bg-white">
                  <table className="min-w-[820px] w-full text-left text-sm text-black">
                    <thead className="bg-emerald-100">
                      <tr>
                        {selectedDetachmentView === "__ALL__" ? <th className="px-4 py-3">Detachment</th> : null}
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-right">Stock Balance</th>
                        <th className="px-4 py-3 text-right">Catalog Unit Price</th>
                        <th className="px-4 py-3 text-right">Balance Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedDetachmentParaphernalia.length ? selectedDetachmentParaphernalia.map((item) => (
                        <tr key={item.key}>
                          {selectedDetachmentView === "__ALL__" ? <td className="px-4 py-3">{item.detachment}</td> : null}
                          <td className="px-4 py-3 text-gray-600">{item.group}</td>
                          <td className="px-4 py-3 font-semibold">{item.item}</td>
                          <td className="px-4 py-3 text-right">{item.quantity.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">PHP {toMoney(item.unitValue)}</td>
                          <td className="px-4 py-3 text-right font-bold">PHP {toMoney(item.totalValue)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={selectedDetachmentView === "__ALL__" ? 6 : 5} className="px-4 py-8 text-center text-gray-500">No connected Paraphernalia balance is available for this detachment.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-black">Complete Asset Records</h3>
                  <p className="text-sm text-gray-600">Select View to open the full editable inventory record.</p>
                </div>
                <div className="overflow-x-auto rounded-2xl border bg-white">
                  <table className="min-w-[1180px] w-full text-left text-sm text-black">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3">Equipment</th>
                        <th className="px-4 py-3">Control Number</th>
                        <th className="px-4 py-3">Serial / Plate</th>
                        <th className="px-4 py-3">Maker / Model</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3 text-right">Unit Cost</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3">Purchased</th>
                        <th className="px-4 py-3">Remarks</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedDetachmentRows.map((row) => (
                        <tr key={`${row.id}-detachment-view`}>
                          <td className="px-4 py-3 font-semibold">{row.equipment || row.particular || "-"}</td>
                          <td className="px-4 py-3">{row.control_number || "-"}</td>
                          <td className="px-4 py-3">{row.serial_plate_number || "-"}</td>
                          <td className="px-4 py-3">{[row.maker, row.model_number].filter(Boolean).join(" / ") || "-"}</td>
                          <td className="px-4 py-3 text-right">{totalQuantityFromRow(row).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">PHP {toMoney(numberValue(row.unit_cost))}</td>
                          <td className="px-4 py-3 text-right font-semibold">PHP {toMoney(totalFromRowPrices(row))}</td>
                          <td className="px-4 py-3">{formatDateCell(row.date_purchased)}</td>
                          <td className="max-w-[260px] px-4 py-3">{row.remarks || "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDetachmentView(null);
                                openDetailsModal(row);
                              }}
                              className="rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#fff3b0]"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDetailRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/40 p-4"
          onClick={closeDetailsModal}
        >
          <div
            className="glass-panel flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-black/10 bg-[#fff9e6] px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-black">
                    {selectedDetailRow.equipment || selectedDetailRow.particular || selectedDetailRow.control_number || "Inventory Record"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {selectedDetailRow.control_number ? `CONTROLNUMBER: ${selectedDetailRow.control_number}` : "Inventory information and computed totals"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {canMutateInventory ? (
                    <button
                      type="button"
                      onClick={editSelectedDetailRow}
                      className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
                    >
                      Edit Information
                    </button>
                  ) : null}
                  {showRowTotalColumn ? (
                    <div className="rounded-2xl bg-[#FFDA03] px-4 py-3 text-right text-black">
                      <div className="text-xs font-semibold uppercase tracking-wide">Row Total</div>
                      <div className="text-xl font-bold">PHP {toMoney(totalFromRowPrices(selectedDetailRow))}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {showEquipmentColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Equipment</div>
                    <div className="mt-1 font-semibold text-black">{selectedDetailRow.equipment || "-"}</div>
                  </div>
                ) : null}
                {showControlNumberColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">CONTROLNUMBER</div>
                    <div className="mt-1 font-semibold text-black">{selectedDetailRow.control_number || "-"}</div>
                  </div>
                ) : null}
                {showSerialPlateColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Serial / Plate</div>
                    <div className="mt-1 font-semibold text-black">{selectedDetailRow.serial_plate_number || "-"}</div>
                  </div>
                ) : null}
                {showMakerColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Maker</div>
                    <div className="mt-1 font-semibold text-black">{selectedDetailRow.maker || "-"}</div>
                  </div>
                ) : null}
                {showModelColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Model #</div>
                    <div className="mt-1 font-semibold text-black">{selectedDetailRow.model_number || "-"}</div>
                  </div>
                ) : null}
                {showDetachmentColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Detachment / Client Name</div>
                    <div className="mt-1 font-semibold text-black">{selectedDetailRow.detachment || "-"}</div>
                  </div>
                ) : null}
                {showParticularColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Particular</div>
                    <div className="mt-1 font-semibold text-black">{selectedDetailRow.particular || "-"}</div>
                  </div>
                ) : null}
                {canViewInventoryColumn("quanitity") ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Quantity</div>
                    <div className="mt-1 font-semibold text-black">{totalQuantityFromRow(selectedDetailRow).toLocaleString()}</div>
                  </div>
                ) : null}
                {showUnitCostColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unit Cost</div>
                    <div className="mt-1 font-semibold text-black">PHP {toMoney(Number(selectedDetailRow.unit_cost ?? 0) || 0)}</div>
                  </div>
                ) : null}
                {showDatePurchasedColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date of Purchased</div>
                    <div className="mt-1 font-semibold text-black">{formatDateCell(selectedDetailRow.date_purchased)}</div>
                  </div>
                ) : null}
                {showExpirationColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expiration</div>
                    <div className="mt-1 font-semibold text-black">{formatDateCell(selectedDetailRow.expiration)}</div>
                  </div>
                ) : null}
                {showLastMaintenanceColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last Maintenance</div>
                    <div className="mt-1 font-semibold text-black">{formatDateCell(selectedDetailRow.last_maintenance)}</div>
                  </div>
                ) : null}
              </div>

              {visibleCategoryConfigs.length ? (
                <div className="mt-5">
                  <h3 className="mb-3 text-base font-semibold text-black">Category Breakdown</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {visibleCategoryConfigs.map((cfg) => {
                      const name = String(selectedDetailRow[cfg.nameRowField] ?? "").trim();
                      const qty = Number(selectedDetailRow[cfg.qtyRowField] ?? 0) || 0;
                      const price = Number(selectedDetailRow[cfg.priceRowField] ?? 0) || 0;
                      return (
                        <div key={`${selectedDetailRow.id}-${cfg.key}-detail`} className="rounded-2xl border bg-white p-4">
                          <div className="font-semibold text-black">{cfg.label}</div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div className="col-span-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name</div>
                              <div className="font-medium text-black">{name || "-"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</div>
                              <div className="font-medium text-black">{qty.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Price</div>
                              <div className="font-medium text-black">PHP {toMoney(price)}</div>
                            </div>
                            <div className="col-span-2 rounded-xl bg-[#fff9e6] px-3 py-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Total</div>
                              <div className="font-semibold text-black">PHP {toMoney(lineTotal(qty, price))}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {showRemarksColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Remarks</div>
                    <div className="mt-1 whitespace-pre-wrap text-black">{selectedDetailRow.remarks || "-"}</div>
                  </div>
                ) : null}
                {showUserColumn ? (
                  <div className="rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">User</div>
                    <div className="mt-1 text-black">{selectedDetailRow.user_text || "-"}</div>
                    {selectedDetailRow.user_attachment ? (
                      <a href={selectedDetailRow.user_attachment} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-blue-700 underline">
                        View attached file
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <div className="rounded-2xl border bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last Updated</div>
                  <div className="mt-1 text-black">{formatTimestamp(selectedDetailRow.last_updated_at)}</div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-black/10 bg-white/90 px-6 py-4">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button type="button" onClick={closeDetailsModal} className="rounded-xl border px-4 py-2 text-black hover:bg-gray-50">
                  Close
                </button>
                {canMutateInventory ? (
                  <button type="button" onClick={editSelectedDetailRow} className="rounded-xl bg-[#FFDA03] px-4 py-2 font-semibold text-black hover:brightness-95">
                    Edit Information
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}


      {(showAddModal || showEditModal) && canMutateInventory ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-hidden"
          onClick={closeModals}
        >
          <div
            className="glass-panel rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] overflow-hidden animate-scale-in flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-black/10 px-6 py-4">
              <h2 className="text-lg font-semibold text-black">
                {showEditModal ? "Edit Inventory Row" : "Insert Inventory Information"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Scroll inside this popup to complete all inventory details.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showEquipmentColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">EQUIPMENT</span>
                  <SearchDropdownInput
                    className="border rounded-xl px-3 py-2 w-full"
                    value={formData.equipment}
                    options={equipmentDropdownNames}
                    placeholder="Type or select equipment"
                    onChange={(value) => {
                      const equipment = value.toUpperCase();
                      const unitPrice = equipmentPriceByName.get(normalizeEquipmentCatalogName(equipment)) ?? 0;
                      setFormData((prev) => ({
                        ...prev,
                        equipment,
                        control_number: prev.control_number || (equipment.trim() ? nextInventoryControlNumber(equipment) : ""),
                        unit_cost: prev.unit_cost || (unitPrice > 0 ? String(unitPrice) : ""),
                      }));
                    }}
                  />
                </label>
              ) : null}
              {showControlNumberColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">CONTROLNUMBER</span>
                  <input
                    className="border rounded-xl px-3 py-2 w-full"
                    value={formData.control_number}
                    onChange={(e) => setFormData((prev) => ({ ...prev, control_number: normalizeControlNumber(e.target.value) }))}
                  />
                </label>
              ) : null}
              {showSerialPlateColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">SERIAL / PLATE</span>
                  <input className="border rounded-xl px-3 py-2 w-full" value={formData.serial_plate_number} onChange={(e) => setFormData((prev) => ({ ...prev, serial_plate_number: e.target.value }))} />
                </label>
              ) : null}
              {showMakerColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">MAKER</span>
                  <input className="border rounded-xl px-3 py-2 w-full" value={formData.maker} onChange={(e) => setFormData((prev) => ({ ...prev, maker: e.target.value }))} />
                </label>
              ) : null}
              {showModelColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">MODEL #</span>
                  <input className="border rounded-xl px-3 py-2 w-full" value={formData.model_number} onChange={(e) => setFormData((prev) => ({ ...prev, model_number: e.target.value }))} />
                </label>
              ) : null}
              {showDetachmentColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">DETACHMENT (CLIENT NAME)</span>
                  <select className="border rounded-xl px-3 py-2 w-full bg-white" value={formData.detachment} onChange={(e) => setFormData((prev) => ({ ...prev, detachment: e.target.value }))}>
                    <option value="">Select Client Name</option>
                    {detachmentOptions.map((clientName) => (
                      <option key={clientName} value={clientName}>
                        {clientName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {showUnitCostColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">UNIT COST</span>
                  <input type="number" min="0" step="0.01" className="border rounded-xl px-3 py-2 w-full" value={formData.unit_cost} onChange={(e) => setFormData((prev) => ({ ...prev, unit_cost: e.target.value }))} />
                </label>
              ) : null}
              {showDatePurchasedColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">DATE OF PURCHASED</span>
                  <input type="date" className="border rounded-xl px-3 py-2 w-full" value={formData.date_purchased} onChange={(e) => setFormData((prev) => ({ ...prev, date_purchased: e.target.value }))} />
                </label>
              ) : null}
              {showExpirationColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">EXPIRATION</span>
                  <input type="date" className="border rounded-xl px-3 py-2 w-full" value={formData.expiration} onChange={(e) => setFormData((prev) => ({ ...prev, expiration: e.target.value }))} />
                </label>
              ) : null}
              {showLastMaintenanceColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">LAST MAINTENANCE</span>
                  <input type="date" className="border rounded-xl px-3 py-2 w-full" value={formData.last_maintenance} onChange={(e) => setFormData((prev) => ({ ...prev, last_maintenance: e.target.value }))} />
                </label>
              ) : null}
              {showParticularColumn ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">PARTICULAR</span>
                  <input className="border rounded-xl px-3 py-2 w-full" value={formData.particular} onChange={(e) => setFormData((prev) => ({ ...prev, particular: e.target.value }))} />
                </label>
              ) : null}
              {canViewInventoryColumn("quanitity") ? (
                <label className="text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">TOTAL QUANTITY</span>
                  <input
                    type="number"
                    min="0"
                    className="border rounded-xl px-3 py-2 w-full"
                    value={formData.quanitity}
                    onChange={(e) => setFormData((prev) => ({ ...prev, quanitity: e.target.value }))}
                  />
                </label>
              ) : null}
              {showRowTotalColumn ? (
                <div className="border rounded-xl px-3 py-2 bg-white text-sm text-gray-700">
                  Row Total (quantity x price):
                  <span className="ml-2 font-semibold text-black">₱ {toMoney(totalFromPrices(formData))}</span>
                </div>
              ) : null}
              </div>

              {showRemarksColumn ? (
                <label className="block text-sm text-gray-700">
                  <span className="mb-1 block text-xs uppercase tracking-wide">REMARKS</span>
                  <input className="border rounded-xl px-3 py-2 w-full" value={formData.remarks} onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))} />
                </label>
              ) : null}

              {showUserColumn ? (
                <div className="rounded-2xl border bg-white p-4 space-y-3">
                  <div className="font-medium text-gray-900">USER</div>
                  <input
                    placeholder="User text / assigned user"
                    className="border rounded-xl px-3 py-2 w-full"
                    value={formData.user_text}
                    onChange={(e) => setFormData((prev) => ({ ...prev, user_text: e.target.value }))}
                  />
                  <input
                    placeholder="Existing file URL"
                    className="border rounded-xl px-3 py-2 w-full"
                    value={formData.user_attachment}
                    onChange={(e) => setFormData((prev) => ({ ...prev, user_attachment: e.target.value }))}
                  />
                  <label className="flex flex-wrap items-center gap-3 rounded-xl border bg-gray-50 px-3 py-2 text-sm text-black">
                    <Upload className="h-4 w-4" />
                    <span>{userAttachmentFile ? userAttachmentFile.name : "Upload file/image to inventory bucket"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setUserAttachmentFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-black/10 bg-white/90 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  {showEditModal ? (
                    <button
                      onClick={() => void deleteEditingRow()}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-700 font-semibold disabled:opacity-60"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={closeModals} className="px-4 py-2 rounded-xl border">Cancel</button>
                  <button
                    onClick={showEditModal ? updateRow : addRow}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-[#FFDA03] font-semibold text-black disabled:opacity-60"
                  >
                    {saving ? "Saving..." : showEditModal ? "Update" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <SpreadsheetImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Inventory"
        description="Upload an Excel (.xlsx/.xls) or CSV (.csv) file with inventory data."
        allowTemplateDownloads={canDownloadInventoryTemplate}
        templateFileName="inventory_import_template"
        templateSampleData={{
          equipment: "CIGNUS",
          control_number: "CIG-2026-0001",
          serial_plate_number: "SN-001",
          maker: "Sample Maker",
          model_number: "Model A",
          detachment: "Sample Client",
          date: "2026-03-01",
          particular: "Sample Particular",
          quanitity: 5,
          unit_cost: 1000,
          amount: 5000,
          total_amount: 5000,
          grand_total: 5000,
          date_purchased: "2026-03-01",
          expiration: "2027-03-01",
          last_maintenance: "2026-05-01",
          user_text: "Assigned user or notes",
          user_attachment: "Optional URL",
          communication_name: "CIGNUS",
          communication_qty: 1,
          communication_price: 1000,
          security_safety_name: "BODYCAMERA",
          security_safety_qty: 1,
          security_safety_price: 800,
          tactical_name: "PISTOL",
          tactical_qty: 1,
          tactical_price: 500,
          transportation_mobility_name: "MOTORCYCLE",
          transportation_mobility_qty: 1,
          transportation_mobility_price: 400,
          emergency_medical_name: "FIRST AID KIT",
          emergency_medical_qty: 1,
          emergency_medical_price: 300,
          office_equipment_name: "PRINTER",
          office_equipment_qty: 1,
          office_equipment_price: 2000,
          remarks: "Optional remarks",
        }}
        previewColumns={["CONTROLNUMBER / Equipment"]}
        parseRow={parseInventoryImportRow}
        onImport={handleInventoryImport}
      />

      <ImportSummaryModal
        open={importSummaryOpen}
        summary={importSummary}
        title="Inventory Import Summary"
        onClose={() => setImportSummaryOpen(false)}
      />

      
    </>
  );
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickByAliases(row: Record<string, unknown>, aliases: string[]) {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) map.set(normalizeHeader(k), v);
  for (const alias of aliases) {
    const v = map.get(normalizeHeader(alias));
    if (v !== undefined && String(v ?? "").trim() !== "") return String(v);
  }
  return "";
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
