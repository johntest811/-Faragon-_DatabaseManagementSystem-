"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Download, FileDown, FileText, Search, Upload } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import TableZoomWrapper from "@/app/Components/TableZoomWrapper";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";
import SpreadsheetImportModal from "@/app/Components/SpreadsheetImportModal";
import { addBrandedPdfHeader, buildBrandedAoa, buildBrandedWorkbookBuffer } from "../Components/exportBranding";

type CategoryConfig = {
  key: "firearms" | "communications" | "furniture" | "office" | "sec" | "vehicle";
  label: string;
  nameField: keyof InventoryForm;
  qtyField: keyof InventoryForm;
  priceField: keyof InventoryForm;
  nameRowField: keyof InventoryRow;
  qtyRowField: keyof InventoryRow;
  priceRowField: keyof InventoryRow;
};

type InventoryRow = {
  id: string;
  date: string | null;
  particular: string | null;
  quanitity: number | null;
  amount: number | null;
  last_updated_at: string | null;
  remarks: string | null;
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
};

const EMPTY_FORM: InventoryForm = {
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
};

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    key: "firearms",
    label: "Firearms & Ammunitions",
    nameField: "firearms_name",
    qtyField: "firearms_qty",
    priceField: "firearms_price",
    nameRowField: "firearms_name",
    qtyRowField: "firearms_qty",
    priceRowField: "firearms_price",
  },
  {
    key: "communications",
    label: "Communications Equipment",
    nameField: "communications_name",
    qtyField: "communications_qty",
    priceField: "communications_price",
    nameRowField: "communications_name",
    qtyRowField: "communications_qty",
    priceRowField: "communications_price",
  },
  {
    key: "furniture",
    label: "Furniture & Fixtures",
    nameField: "furniture_name",
    qtyField: "furniture_qty",
    priceField: "furniture_price",
    nameRowField: "furniture_name",
    qtyRowField: "furniture_qty",
    priceRowField: "furniture_price",
  },
  {
    key: "office",
    label: "Office Equip.",
    nameField: "office_name",
    qtyField: "office_qty",
    priceField: "office_price",
    nameRowField: "office_name",
    qtyRowField: "office_qty",
    priceRowField: "office_price",
  },
  {
    key: "sec",
    label: "Sec Equip.",
    nameField: "sec_name",
    qtyField: "sec_qty",
    priceField: "sec_price",
    nameRowField: "sec_name",
    qtyRowField: "sec_qty",
    priceRowField: "sec_price",
  },
  {
    key: "vehicle",
    label: "Vehicle & Motorcycle",
    nameField: "vehicle_name",
    qtyField: "vehicle_qty",
    priceField: "vehicle_price",
    nameRowField: "vehicle_name",
    qtyRowField: "vehicle_qty",
    priceRowField: "vehicle_price",
  },
];

const INVENTORY_COLUMN_TO_DB_FIELDS: Record<string, string[]> = {
  date: ["date"],
  particular: ["particular"],
  quanitity: ["quanitity"],
  amount: ["amount"],
  remarks: ["remarks"],
  firearms_name: ["firearms_name", "firearms_qty", "firearms_price", "firearms_ammunitions"],
  communications_name: ["communications_name", "communications_qty", "communications_price", "communications_equipment"],
  furniture_name: ["furniture_name", "furniture_qty", "furniture_price", "furniture_and_fixtures"],
  office_name: ["office_name", "office_qty", "office_price", "office_equipments_sec_equipments"],
  sec_name: ["sec_name", "sec_qty", "sec_price", "sec_equipments"],
  vehicle_name: ["vehicle_name", "vehicle_qty", "vehicle_price", "vehicle_and_motorcycle"],
  total_amount: ["total_amount"],
  grand_total: ["grand_total"],
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

function toMoney(value: number) {
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function totalFromPrices(formData: InventoryForm) {
  return (
    toNumber(formData.firearms_price) +
    toNumber(formData.communications_price) +
    toNumber(formData.furniture_price) +
    toNumber(formData.office_price) +
    toNumber(formData.sec_price) +
    toNumber(formData.vehicle_price)
  );
}

function totalFromRowPrices(row: InventoryRow) {
  return (
    (Number(row.firearms_price ?? 0) || 0) +
    (Number(row.communications_price ?? 0) || 0) +
    (Number(row.furniture_price ?? 0) || 0) +
    (Number(row.office_price ?? 0) || 0) +
    (Number(row.sec_price ?? 0) || 0) +
    (Number(row.vehicle_price ?? 0) || 0)
  );
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

  const showDateColumn = canViewInventoryColumn("date");
  const showParticularColumn = canViewInventoryColumn("particular");
  const showRemarksColumn = canViewInventoryColumn("remarks");
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
      (showParticularColumn ? 1 : 0) +
      visibleCategoryConfigs.length +
      (showRowTotalColumn ? 1 : 0) +
      1 +
      (showRemarksColumn ? 1 : 0) +
      (canMutateInventory ? 1 : 0)
    );
  }, [showDateColumn, showParticularColumn, visibleCategoryConfigs.length, showRowTotalColumn, showRemarksColumn, canMutateInventory]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
  const [importSummaryOpen, setImportSummaryOpen] = useState(false);
 const [showTemplatePopup, setShowTemplatePopup] = useState(false);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formData, setFormData] = useState<InventoryForm>(EMPTY_FORM);

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
      date: "2026-03-01",
      particular: "Sample Particular",
      quanitity: 5,
      firearms_name: "Sample Firearm",
      firearms_qty: 1,
      firearms_price: 1000,
      communications_name: "Sample Radio",
      communications_qty: 1,
      communications_price: 800,
      furniture_name: "Sample Chair",
      furniture_qty: 1,
      furniture_price: 500,
      office_name: "Sample Printer",
      office_qty: 1,
      office_price: 400,
      sec_name: "Sample Vest",
      sec_qty: 1,
      sec_price: 300,
      vehicle_name: "Sample Motorcycle",
      vehicle_qty: 1,
      vehicle_price: 2000,
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
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) throw new Error("No sheet found in selected file.");

      const ws = wb.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (!rawRows.length) throw new Error("The selected file has no data rows.");

      const rowErrors: string[] = [];
      let skipped = 0;

      const importedRows = rawRows
        .map((row, idx) => {
          const firearmsPrice = toNumber(pickByAliases(row, ["firearms_price", "firearms price", "firearms amount"]));
          const communicationsPrice = toNumber(pickByAliases(row, ["communications_price", "communications price", "communications amount"]));
          const furniturePrice = toNumber(pickByAliases(row, ["furniture_price", "furniture price", "furniture amount"]));
          const officePrice = toNumber(pickByAliases(row, ["office_price", "office price", "office amount"]));
          const secPrice = toNumber(pickByAliases(row, ["sec_price", "sec price", "security price"]));
          const vehiclePrice = toNumber(pickByAliases(row, ["vehicle_price", "vehicle price", "vehicle amount"]));
          const computedAmount = firearmsPrice + communicationsPrice + furniturePrice + officePrice + secPrice + vehiclePrice;

          const payload = {
            date: pickByAliases(row, ["date"]).trim() || null,
            particular: pickByAliases(row, ["particular", "description", "item"]).trim() || null,
            quanitity: toNumber(pickByAliases(row, ["quanitity", "quantity", "total quantity"])),
            amount: toNumber(pickByAliases(row, ["amount", "row total", "total_amount"])) || computedAmount,
            remarks: pickByAliases(row, ["remarks", "note", "notes"]).trim() || null,
            firearms_name: pickByAliases(row, ["firearms_name", "firearms", "firearms ammunitions"]).trim() || null,
            firearms_qty: toNumber(pickByAliases(row, ["firearms_qty", "firearms quantity"])),
            firearms_price: firearmsPrice,
            communications_name: pickByAliases(row, ["communications_name", "communications", "communications equipment"]).trim() || null,
            communications_qty: toNumber(pickByAliases(row, ["communications_qty", "communications quantity"])),
            communications_price: communicationsPrice,
            furniture_name: pickByAliases(row, ["furniture_name", "furniture", "furniture fixtures"]).trim() || null,
            furniture_qty: toNumber(pickByAliases(row, ["furniture_qty", "furniture quantity"])),
            furniture_price: furniturePrice,
            office_name: pickByAliases(row, ["office_name", "office", "office equipment"]).trim() || null,
            office_qty: toNumber(pickByAliases(row, ["office_qty", "office quantity"])),
            office_price: officePrice,
            sec_name: pickByAliases(row, ["sec_name", "security_name", "sec equipment"]).trim() || null,
            sec_qty: toNumber(pickByAliases(row, ["sec_qty", "security quantity"])),
            sec_price: secPrice,
            vehicle_name: pickByAliases(row, ["vehicle_name", "vehicle", "motorcycle"]).trim() || null,
            vehicle_qty: toNumber(pickByAliases(row, ["vehicle_qty", "vehicle quantity"])),
            vehicle_price: vehiclePrice,
            firearms_ammunitions: pickByAliases(row, ["firearms_ammunitions", "firearms_name"]).trim() || null,
            communications_equipment: pickByAliases(row, ["communications_equipment", "communications_name"]).trim() || null,
            furniture_and_fixtures: pickByAliases(row, ["furniture_and_fixtures", "furniture_name"]).trim() || null,
            office_equipments_sec_equipments: pickByAliases(row, ["office_equipments_sec_equipments", "office_name"]).trim() || null,
            sec_equipments: pickByAliases(row, ["sec_equipments", "sec_name"]).trim() || null,
            vehicle_and_motorcycle: pickByAliases(row, ["vehicle_and_motorcycle", "vehicle_name"]).trim() || null,
            total_amount: toNumber(pickByAliases(row, ["total_amount", "amount"])) || computedAmount,
            grand_total: toNumber(pickByAliases(row, ["grand_total"])) || null,
          };

          const hasIdentity = Boolean((payload.particular ?? "").trim() || (payload.date ?? "").trim());
          if (!hasIdentity) {
            skipped += 1;
            rowErrors.push(`Row ${idx + 2}: Missing identity fields (particular/date).`);
          }
          return hasIdentity ? payload : null;
        })
        .filter((v): v is NonNullable<typeof v> => Boolean(v));

      if (!importedRows.length) throw new Error("No valid inventory rows found in file.");

      const { data: existingRows, error: existingErr } = await supabase
        .from("inventory_fixed_asset")
        .select("id, date, particular")
        .limit(10000);
      if (existingErr) throw existingErr;

      const byComposite = new Map<string, string>();
      const byParticularUnique = new Map<string, string>();
      const particularCounts = new Map<string, number>();
      for (const row of ((existingRows ?? []) as Array<Record<string, unknown>>)) {
        const id = String(row.id ?? "");
        if (!id) continue;
        const particularKey = normalizeImportKey(row.particular);
        const dateKey = normalizeImportKey(row.date);
        const key = `${particularKey}|${dateKey}`;
        if (key !== "|") byComposite.set(key, id);

        if (particularKey) {
          particularCounts.set(particularKey, (particularCounts.get(particularKey) ?? 0) + 1);
          if (!byParticularUnique.has(particularKey)) byParticularUnique.set(particularKey, id);
        }
      }

      for (const [particularKey, count] of particularCounts.entries()) {
        if (count > 1) byParticularUnique.delete(particularKey);
      }

      type InventoryPayload = NonNullable<(typeof importedRows)[number]>;
      const deduped = new Map<string, InventoryPayload>();
      for (const payload of importedRows) {
        const particularKey = normalizeImportKey(payload.particular);
        const dateKey = normalizeImportKey(payload.date);
        const key = dateKey ? `${particularKey}|${dateKey}` : `p:${particularKey}`;
        if (deduped.has(key)) skipped += 1;
        deduped.set(key, payload);
      }

      let inserted = 0;
      let updated = 0;
      for (const [key, payload] of deduped.entries()) {
        const particularKey = normalizeImportKey(payload.particular);
        const dateKey = normalizeImportKey(payload.date);
        const compositeKey = `${particularKey}|${dateKey}`;
        const id = byComposite.get(compositeKey) ?? (particularKey ? byParticularUnique.get(particularKey) : undefined);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const parseInventoryImportRow = useCallback((row: Record<string, unknown>) => {
    const firearmsPrice = toNumber(pickByAliases(row, ["firearms_price", "firearms price", "firearms amount"]));
    const communicationsPrice = toNumber(pickByAliases(row, ["communications_price", "communications price", "communications amount"]));
    const furniturePrice = toNumber(pickByAliases(row, ["furniture_price", "furniture price", "furniture amount"]));
    const officePrice = toNumber(pickByAliases(row, ["office_price", "office price", "office amount"]));
    const secPrice = toNumber(pickByAliases(row, ["sec_price", "sec price", "security price"]));
    const vehiclePrice = toNumber(pickByAliases(row, ["vehicle_price", "vehicle price", "vehicle amount"]));
    const computedAmount = firearmsPrice + communicationsPrice + furniturePrice + officePrice + secPrice + vehiclePrice;

    const payload = {
      date: pickByAliases(row, ["date"]).trim() || null,
      particular: pickByAliases(row, ["particular", "description", "item"]).trim() || null,
      quanitity: toNumber(pickByAliases(row, ["quanitity", "quantity", "total quantity"])),
      amount: toNumber(pickByAliases(row, ["amount", "row total", "total_amount"])) || computedAmount,
      remarks: pickByAliases(row, ["remarks", "note", "notes"]).trim() || null,
      firearms_name: pickByAliases(row, ["firearms_name", "firearms", "firearms ammunitions"]).trim() || null,
      firearms_qty: toNumber(pickByAliases(row, ["firearms_qty", "firearms quantity"])),
      firearms_price: firearmsPrice,
      communications_name: pickByAliases(row, ["communications_name", "communications", "communications equipment"]).trim() || null,
      communications_qty: toNumber(pickByAliases(row, ["communications_qty", "communications quantity"])),
      communications_price: communicationsPrice,
      furniture_name: pickByAliases(row, ["furniture_name", "furniture", "furniture fixtures"]).trim() || null,
      furniture_qty: toNumber(pickByAliases(row, ["furniture_qty", "furniture quantity"])),
      furniture_price: furniturePrice,
      office_name: pickByAliases(row, ["office_name", "office", "office equipment"]).trim() || null,
      office_qty: toNumber(pickByAliases(row, ["office_qty", "office quantity"])),
      office_price: officePrice,
      sec_name: pickByAliases(row, ["sec_name", "security_name", "sec equipment"]).trim() || null,
      sec_qty: toNumber(pickByAliases(row, ["sec_qty", "security quantity"])),
      sec_price: secPrice,
      vehicle_name: pickByAliases(row, ["vehicle_name", "vehicle", "motorcycle"]).trim() || null,
      vehicle_qty: toNumber(pickByAliases(row, ["vehicle_qty", "vehicle quantity"])),
      vehicle_price: vehiclePrice,
      firearms_ammunitions: pickByAliases(row, ["firearms_ammunitions", "firearms_name"]).trim() || null,
      communications_equipment: pickByAliases(row, ["communications_equipment", "communications_name"]).trim() || null,
      furniture_and_fixtures: pickByAliases(row, ["furniture_and_fixtures", "furniture_name"]).trim() || null,
      office_equipments_sec_equipments: pickByAliases(row, ["office_equipments_sec_equipments", "office_name"]).trim() || null,
      sec_equipments: pickByAliases(row, ["sec_equipments", "sec_name"]).trim() || null,
      vehicle_and_motorcycle: pickByAliases(row, ["vehicle_and_motorcycle", "vehicle_name"]).trim() || null,
      total_amount: toNumber(pickByAliases(row, ["total_amount", "amount"])) || computedAmount,
      grand_total: toNumber(pickByAliases(row, ["grand_total"])) || null,
    };

    const hasIdentity = Boolean((payload.particular ?? "").trim() || (payload.date ?? "").trim());
    const displayName = payload.particular || payload.date || "—";

    if (!hasIdentity) {
      return { payload: null, displayName, error: "Missing identity fields (particular/date)" };
    }

    return { payload, displayName };
  }, []);

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
      .select("id, date, particular")
      .limit(10000);
    if (existingErr) throw existingErr;

    const byComposite = new Map<string, string>();
    const byParticularUnique = new Map<string, string>();
    const particularCounts = new Map<string, number>();
    for (const row of ((existingRows ?? []) as Array<Record<string, unknown>>)) {
      const id = String(row.id ?? "");
      if (!id) continue;
      const particularKey = normalizeImportKey(row.particular);
      const dateKey = normalizeImportKey(row.date);
      const key = `${particularKey}|${dateKey}`;
      if (key !== "|") byComposite.set(key, id);

      if (particularKey) {
        particularCounts.set(particularKey, (particularCounts.get(particularKey) ?? 0) + 1);
        if (!byParticularUnique.has(particularKey)) byParticularUnique.set(particularKey, id);
      }
    }

    for (const [particularKey, count] of particularCounts.entries()) {
      if (count > 1) byParticularUnique.delete(particularKey);
    }

    const deduped = new Map<string, Record<string, unknown>>();
    for (const payload of importedRows) {
      const particularKey = normalizeImportKey(payload.particular);
      const dateKey = normalizeImportKey(payload.date);
      const key = dateKey ? `${particularKey}|${dateKey}` : `p:${particularKey}`;
      if (deduped.has(key)) skipped += 1;
      deduped.set(key, payload);
    }

    let inserted = 0;
    let updated = 0;
    for (const [key, payload] of deduped.entries()) {
      const particularKey = normalizeImportKey(payload.particular);
      const dateKey = normalizeImportKey(payload.date);
      const compositeKey = `${particularKey}|${dateKey}`;
      const id = byComposite.get(compositeKey) ?? (particularKey ? byParticularUnique.get(particularKey) : undefined);
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
        (sum, r) =>
          sum +
          (Number(r.firearms_qty ?? 0) || 0) +
          (Number(r.communications_qty ?? 0) || 0) +
          (Number(r.furniture_qty ?? 0) || 0) +
          (Number(r.office_qty ?? 0) || 0) +
          (Number(r.sec_qty ?? 0) || 0) +
          (Number(r.vehicle_qty ?? 0) || 0),
        0
      ),
    [rows]
  );

  const totalsByCategory = useMemo(
    () =>
      CATEGORY_CONFIGS.map((cfg) => {
        const quantity = rows.reduce((sum, row) => sum + (Number(row[cfg.qtyRowField] ?? 0) || 0), 0);
        const value = rows.reduce(
          (sum, row) =>
            sum + (Number(row[cfg.priceRowField] ?? 0) || 0),
          0
        );
        return { key: cfg.key, label: cfg.label, quantity, value };
      }),
    [rows]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  function inventoryExportRows() {
    return filtered.map((row) => {
      const out: Record<string, string | number> = {};
      if (showDateColumn) out.Date = row.date ?? "—";
      if (showParticularColumn) out.Particular = row.particular ?? "—";
      for (const cfg of visibleCategoryConfigs) {
        const name = String(row[cfg.nameRowField] ?? "").trim() || "—";
        const qty = Number(row[cfg.qtyRowField] ?? 0) || 0;
        const price = Number(row[cfg.priceRowField] ?? 0) || 0;
        out[`${cfg.label} Name`] = name;
        out[`${cfg.label} Qty`] = qty;
        out[`${cfg.label} Price`] = price;
      }
      if (showRowTotalColumn) out["Row Total"] = totalFromRowPrices(row);
      out["Last Updated"] = formatTimestamp(row.last_updated_at);
      if (showRemarksColumn) out.Remarks = row.remarks ?? "—";
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
    };
  }

  function openEditModal(row: InventoryRow) {
    if (!canMutateInventory) return;
    setEditingRowId(row.id);
    setFormData(rowToForm(row));
    setShowEditModal(true);
    setShowAddModal(false);
    setError("");
    setSuccess("");
  }

  function closeModals() {
    setShowAddModal(false);
    setShowEditModal(false);
    setEditingRowId(null);
    setFormData(EMPTY_FORM);
  }

  async function addRow() {
    if (!canMutateInventory || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const totalAmount = totalFromPrices(formData);
    const totalQuantity = toNumber(formData.quanitity);
    const nextGrandTotal = grandTotal + totalAmount;

    if (!formData.date || !formData.particular.trim()) {
      setSaving(false);
      setError("Date and Particular are required.");
      return;
    }

    const payload = {
      date: formData.date,
      particular: formData.particular.trim(),
      quanitity: totalQuantity,
      amount: totalAmount,
      remarks: formData.remarks.trim() || null,
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
      grand_total: nextGrandTotal,
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

    if (!formData.date || !formData.particular.trim()) {
      setSaving(false);
      setError("Date and Particular are required.");
      return;
    }

    const totalAmount = totalFromPrices(formData);
    const totalQuantity = toNumber(formData.quanitity);

    const payload = {
      date: formData.date,
      particular: formData.particular.trim(),
      quanitity: totalQuantity,
      amount: totalAmount,
      remarks: formData.remarks.trim() || null,
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
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="animated-btn px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
              >
                Insert Information
              </button>
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {totalsByCategory.filter((item) => visibleCategoryConfigs.some((cfg) => cfg.key === item.key)).map((item) => (
            <div key={item.key} className="glass-panel animate-slide-up rounded-2xl p-4">
              <div className="text-sm font-medium text-gray-700">{item.label}</div>
              <div className="mt-2 text-xs text-gray-500">Qty: {item.quantity.toLocaleString()}</div>
              <div className="text-base font-semibold text-black">₱ {toMoney(item.value)}</div>
            </div>
          ))}
        </div>

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
          <table className="w-full text-sm text-black min-w-[1500px] border-separate border-spacing-y-2">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#FFDA03]">
                {showDateColumn ? <th className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap rounded-l-xl">Date</th> : null}
                {showParticularColumn ? <th className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">Particular</th> : null}
                {visibleCategoryConfigs.map((cfg) => (
                  <th key={cfg.key} className="px-4 py-3 text-left font-semibold text-black min-w-[190px] whitespace-nowrap">
                    {cfg.label}
                  </th>
                ))}
                {showRowTotalColumn ? <th className="px-4 py-3 text-right font-semibold text-black whitespace-nowrap">Row Total</th> : null}
                <th className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">Last Updated</th>
                {showRemarksColumn ? (
                  <th className={`px-4 py-3 text-left font-semibold text-black whitespace-nowrap ${canMutateInventory ? "" : "rounded-r-xl"}`}>Remarks</th>
                ) : null}
                {canMutateInventory ? <th className="px-4 py-3 text-center font-semibold text-black whitespace-nowrap rounded-r-xl">Action</th> : null}
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
                    role={canMutateInventory ? "button" : undefined}
                    tabIndex={canMutateInventory ? 0 : -1}
                    onClick={() => {
                      if (!canMutateInventory) return;
                      openEditModal(row);
                    }}
                    onKeyDown={(e) => {
                      if (!canMutateInventory) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEditModal(row);
                      }
                    }}
                    className={`animated-row border-b border-gray-100 transition hover:shadow-md ${
                      canMutateInventory ? "cursor-pointer" : ""
                    }`}
                  >
                    {showDateColumn ? <td className="px-4 py-3 whitespace-nowrap rounded-l-xl">{row.date || "—"}</td> : null}
                    {showParticularColumn ? <td className="px-4 py-3">{row.particular || "—"}</td> : null}
                    {visibleCategoryConfigs.map((cfg) => {
                      const name = (row[cfg.nameRowField] as string | null) ?? "";
                      const qty = Number(row[cfg.qtyRowField] ?? 0) || 0;
                      const price = Number(row[cfg.priceRowField] ?? 0) || 0;
                      return (
                        <td key={`${row.id}-${cfg.key}-cell`} className="px-4 py-3 align-top">
                          <div className="text-xs text-gray-500">Name</div>
                          <div className="font-medium text-black truncate" title={name || "—"}>{name || "—"}</div>
                          <div className="mt-1 text-xs text-gray-600">
                            Qty: <span className="font-semibold text-black">{qty.toLocaleString()}</span>
                          </div>
                          <div className="text-xs text-gray-600">
                            Price: <span className="font-semibold text-black">₱ {toMoney(price)}</span>
                          </div>
                        </td>
                      );
                    })}
                    {showRowTotalColumn ? <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">₱ {toMoney(totalFromRowPrices(row))}</td> : null}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatTimestamp(row.last_updated_at)}</td>
                    {showRemarksColumn ? <td className={`px-4 py-3 ${canMutateInventory ? "" : "rounded-r-xl"}`}>{row.remarks || "—"}</td> : null}
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
      

      {(showAddModal || showEditModal) && canMutateInventory ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={closeModals}
        >
          <div
            className="glass-panel rounded-2xl shadow-2xl p-6 w-full max-w-5xl space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-black">
              {showEditModal ? "Edit Inventory Row" : "Insert Inventory Information"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showDateColumn ? (
                <input type="date" className="border rounded-xl px-3 py-2" value={formData.date} onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))} />
              ) : null}
              {showParticularColumn ? (
                <input placeholder="Particular" className="border rounded-xl px-3 py-2" value={formData.particular} onChange={(e) => setFormData((prev) => ({ ...prev, particular: e.target.value }))} />
              ) : null}
              {canViewInventoryColumn("quanitity") ? (
                <input
                  type="number"
                  min="0"
                  placeholder="Total Quantity"
                  className="border rounded-xl px-3 py-2"
                  value={formData.quanitity}
                  onChange={(e) => setFormData((prev) => ({ ...prev, quanitity: e.target.value }))}
                />
              ) : null}
              {showRowTotalColumn ? (
                <div className="border rounded-xl px-3 py-2 bg-white text-sm text-gray-700">
                  Row Total (sum of all prices):
                  <span className="ml-2 font-semibold text-black">₱ {toMoney(totalFromPrices(formData))}</span>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleCategoryConfigs.map((cfg) => {
                return (
                  <div key={cfg.key} className="rounded-2xl border bg-white p-4 space-y-3">
                    <div className="font-medium text-gray-900">{cfg.label}</div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Kind / Name</label>
                      <input
                        type="text"
                        className="w-full border rounded-xl px-3 py-2"
                        value={formData[cfg.nameField]}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [cfg.nameField]: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full border rounded-xl px-3 py-2"
                          value={formData[cfg.qtyField]}
                          onChange={(e) => setFormData((prev) => ({ ...prev, [cfg.qtyField]: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Price</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full border rounded-xl px-3 py-2"
                          value={formData[cfg.priceField]}
                          onChange={(e) => setFormData((prev) => ({ ...prev, [cfg.priceField]: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {showRemarksColumn ? (
              <input placeholder="Remarks" className="border rounded-xl px-3 py-2 w-full" value={formData.remarks} onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))} />
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-2">
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
      ) : null}

      <SpreadsheetImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Inventory"
        description="Upload an Excel (.xlsx/.xls) or CSV (.csv) file with inventory data."
        allowTemplateDownloads={canDownloadInventoryTemplate}
        templateFileName="inventory_import_template"
        templateSampleData={{
          date: "2026-03-01",
          particular: "Sample Particular",
          quanitity: 5,
          firearms_name: "Sample Firearm",
          firearms_qty: 1,
          firearms_price: 1000,
          communications_name: "Sample Radio",
          communications_qty: 1,
          communications_price: 800,
          furniture_name: "Sample Chair",
          furniture_qty: 1,
          furniture_price: 500,
          office_name: "Sample Printer",
          office_qty: 1,
          office_price: 400,
          sec_name: "Sample Vest",
          sec_qty: 1,
          sec_price: 300,
          vehicle_name: "Sample Motorcycle",
          vehicle_qty: 1,
          vehicle_price: 2000,
          remarks: "Optional remarks",
        }}
        previewColumns={["Particular/Date"]}
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
