"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileDown, FileText, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole, useMyColumnAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ImportSummaryModal, { ImportSummaryData } from "../Components/ImportSummaryModal";

type ParaphernaliaRow = {
  id_paraphernalia: string;
  names: string | null;
  items: string | null;
  quantity: number | null;
  price: number | null;
  date: string | null;
};

type ParaphernaliaInventoryRow = {
  id_paraphernalia_inventory: string;
  id_paraphernalia: string | null;
  items: string | null;
  stock_balance: number | null;
  stock_in: number | null;
  stock_out: number | null;
  paraphernalia: { names: string | null; items: string | null } | null;
};

type RestockRow = {
  id_restock: string;
  id_paraphernalia: string | null;
  id_paraphernalia_inventory: string | null;
  date: string | null;
  status: string | null;
  item: string | null;
  quanitity: string | null;
  paraphernalia: { names: string | null; items: string | null } | null;
  paraphernalia_inventory: { items: string | null } | null;
};

type NewParaphernaliaForm = {
  names: string;
  items: string;
  quantity: string;
  price: string;
  date: string;
  createInventory: boolean;
  inventoryItems: string;
  stockBalance: string;
  stockIn: string;
  stockOut: string;
  createRestock: boolean;
  restockDate: string;
  restockStatus: string;
  restockItem: string;
  restockQuantity: string;
};

type EditState =
  | { section: "paraphernalia"; row: ParaphernaliaRow }
  | { section: "inventory"; row: ParaphernaliaInventoryRow }
  | { section: "restock"; row: RestockRow }
  | null;

type ConfirmDeleteState =
  | { section: "paraphernalia"; id: string; label: string }
  | { section: "inventory"; id: string; label: string }
  | { section: "restock"; id: string; label: string }
  | null;

const EMPTY_FORM: NewParaphernaliaForm = {
  names: "",
  items: "",
  quantity: "",
  price: "",
  date: "",
  createInventory: true,
  inventoryItems: "",
  stockBalance: "",
  stockIn: "",
  stockOut: "",
  createRestock: true,
  restockDate: "",
  restockStatus: "",
  restockItem: "",
  restockQuantity: "",
};

function safeText(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "—";
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function tableCell(value: string | number | null | undefined) {
  if (value == null) return "—";
  const text = String(value).trim();
  return text.length ? text : "—";
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

export default function ParaphernaliaPage() {
  const { role } = useAuthRole();
  const { allowedColumns, restricted } = useMyColumnAccess("paraphernalia");
  const isAdmin = role === "admin" || role === "superadmin";
  const canViewPermission = (columnKey: string) => !restricted || allowedColumns.has(columnKey);
  const canImportParaphernalia = isAdmin && canViewPermission("import_file");
  const canDownloadParaphernaliaTemplate = isAdmin && canViewPermission("export_template");
  const canExportParaphernalia = isAdmin && canViewPermission("export_file");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [search, setSearch] = useState("");

  const [paraphernaliaRows, setParaphernaliaRows] = useState<ParaphernaliaRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<ParaphernaliaInventoryRow[]>([]);
  const [restockRows, setRestockRows] = useState<RestockRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState<NewParaphernaliaForm>(EMPTY_FORM);

  const [editState, setEditState] = useState<EditState>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleteState, setDeleteState] = useState<ConfirmDeleteState>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null);
  const [importSummaryOpen, setImportSummaryOpen] = useState(false);

  function downloadTemplate(format: "xlsx" | "csv") {
    const sample = {
      names: "Sample Name",
      items: "Sample Item",
      quantity: 10,
      price: 50,
      date: "2026-03-01",
    };

    const ws = XLSX.utils.json_to_sheet([sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ParaphernaliaTemplate");

    if (format === "xlsx") {
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob("paraphernalia_import_template.xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      return;
    }

    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob("paraphernalia_import_template.csv", new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  async function importSpreadsheet(file: File) {
    if (!canImportParaphernalia) {
      setError("You do not have permission to import files in Paraphernalia page.");
      return;
    }

    setImportBusy(true);
    setError("");
    setInfoMessage("");
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

      const payloads = rawRows
        .map((row, idx) => {
          const payload = {
            names: pickByAliases(row, ["names", "name"]).trim() || null,
            items: pickByAliases(row, ["items", "item"]).trim() || null,
            quantity: toNumberOrNull(pickByAliases(row, ["quantity", "qty"])),
            price: toNumberOrNull(pickByAliases(row, ["price", "unit_price", "amount"])),
            date: pickByAliases(row, ["date", "created_at"]).trim() || null,
          };

          const hasIdentity = Boolean(payload.names || payload.items);
          if (!hasIdentity) {
            skipped += 1;
            rowErrors.push(`Row ${idx + 2}: Missing identity fields (names/items).`);
          }
          return hasIdentity ? payload : null;
        })
        .filter((v): v is { names: string | null; items: string | null; quantity: number | null; price: number | null; date: string | null } => Boolean(v));

      if (!payloads.length) throw new Error("No valid paraphernalia rows found in file.");

      const { data: existingRows, error: existingErr } = await supabase
        .from("paraphernalia")
        .select("id_paraphernalia, names, items, date")
        .limit(10000);
      if (existingErr) throw existingErr;

      const byComposite = new Map<string, string>();
      for (const row of ((existingRows ?? []) as Array<Record<string, unknown>>)) {
        const id = String(row.id_paraphernalia ?? "");
        if (!id) continue;
        const key = [
          String(row.names ?? "").trim().toLowerCase(),
          String(row.items ?? "").trim().toLowerCase(),
          String(row.date ?? "").trim().toLowerCase(),
        ].join("|");
        if (key !== "||") byComposite.set(key, id);
      }

      const deduped = new Map<string, (typeof payloads)[number]>();
      for (const p of payloads) {
        const key = [
          String(p.names ?? "").trim().toLowerCase(),
          String(p.items ?? "").trim().toLowerCase(),
          String(p.date ?? "").trim().toLowerCase(),
        ].join("|");
        if (deduped.has(key)) skipped += 1;
        deduped.set(key, p);
      }

      let inserted = 0;
      let updated = 0;

      for (const [key, payload] of deduped.entries()) {
        const id = byComposite.get(key);
        if (id) {
          const upd = await supabase.from("paraphernalia").update(payload).eq("id_paraphernalia", id);
          if (upd.error) {
            skipped += 1;
            rowErrors.push(`Update failed for key ${key}: ${upd.error.message}`);
            continue;
          }
          updated += 1;
        } else {
          const insertPayload = { ...payload, id_paraphernalia: crypto.randomUUID() };
          const ins = await supabase.from("paraphernalia").insert(insertPayload);
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
      setError("");
      await loadAll();
      setInfoMessage(`Import complete. Inserted: ${inserted}, Updated (overwritten): ${updated}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadAll() {
    setLoading(true);
    setError("");

    const [pRes, invRes, rRes] = await Promise.all([
      supabase
        .from("paraphernalia")
        .select("id_paraphernalia, names, items, quantity, price, date")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("paraphernalia_inventory")
        .select("id_paraphernalia_inventory, id_paraphernalia, items, stock_balance, stock_in, stock_out, paraphernalia(names, items)")
        .limit(2000),
      supabase
        .from("restock")
        .select("id_restock, id_paraphernalia, id_paraphernalia_inventory, date, status, item, quanitity, paraphernalia(names, items), paraphernalia_inventory(items)")
        .order("timestamptz", { ascending: false })
        .limit(3000),
    ]);

    if (pRes.error || invRes.error || rRes.error) {
      setError(
        pRes.error?.message || invRes.error?.message || rRes.error?.message || "Failed to load paraphernalia data"
      );
      setParaphernaliaRows([]);
      setInventoryRows([]);
      setRestockRows([]);
      setLoading(false);
      return;
    }

    const pRows = ((pRes.data ?? []) as Record<string, unknown>[])
      .map((r) => ({
        id_paraphernalia: String(r.id_paraphernalia ?? ""),
        names: r.names == null ? null : String(r.names),
        items: r.items == null ? null : String(r.items),
        quantity: toNumberOrNull(r.quantity),
        price: toNumberOrNull(r.price),
        date: r.date == null ? null : String(r.date),
      }))
      .filter((r) => r.id_paraphernalia);
    setParaphernaliaRows(pRows);

    const invRaw = (invRes.data ?? []) as Record<string, unknown>[];
    setInventoryRows(
      invRaw
        .map((r) => {
          const paraphernalia = firstOrNull(
            r.paraphernalia as { names?: unknown; items?: unknown } | { names?: unknown; items?: unknown }[] | null
          );

          const id = String(r.id_paraphernalia_inventory ?? "");
          if (!id) return null;

          return {
            id_paraphernalia_inventory: id,
            id_paraphernalia: r.id_paraphernalia == null ? null : String(r.id_paraphernalia),
            items: r.items == null ? null : String(r.items),
            stock_balance: toNumberOrNull(r.stock_balance),
            stock_in: toNumberOrNull(r.stock_in),
            stock_out: toNumberOrNull(r.stock_out),
            paraphernalia: paraphernalia
              ? {
                  names: paraphernalia.names == null ? null : String(paraphernalia.names),
                  items: paraphernalia.items == null ? null : String(paraphernalia.items),
                }
              : null,
          } satisfies ParaphernaliaInventoryRow;
        })
        .filter((x): x is ParaphernaliaInventoryRow => x !== null)
    );

    const restockRaw = (rRes.data ?? []) as Record<string, unknown>[];
    setRestockRows(
      restockRaw
        .map((r) => {
          const paraphernalia = firstOrNull(
            r.paraphernalia as { names?: unknown; items?: unknown } | { names?: unknown; items?: unknown }[] | null
          );
          const paraphernaliaInventory = firstOrNull(
            r.paraphernalia_inventory as { items?: unknown } | { items?: unknown }[] | null
          );
          const id = String(r.id_restock ?? "");
          if (!id) return null;

          return {
            id_restock: id,
            id_paraphernalia: r.id_paraphernalia == null ? null : String(r.id_paraphernalia),
            id_paraphernalia_inventory:
              r.id_paraphernalia_inventory == null ? null : String(r.id_paraphernalia_inventory),
            date: r.date == null ? null : String(r.date),
            status: r.status == null ? null : String(r.status),
            item: r.item == null ? null : String(r.item),
            quanitity: r.quanitity == null ? null : String(r.quanitity),
            paraphernalia: paraphernalia
              ? {
                  names: paraphernalia.names == null ? null : String(paraphernalia.names),
                  items: paraphernalia.items == null ? null : String(paraphernalia.items),
                }
              : null,
            paraphernalia_inventory: paraphernaliaInventory
              ? {
                  items: paraphernaliaInventory.items == null ? null : String(paraphernaliaInventory.items),
                }
              : null,
          } satisfies RestockRow;
        })
        .filter((x): x is RestockRow => x !== null)
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
    const channel = supabase
      .channel("realtime:paraphernalia-connected")
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia_inventory" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "restock" }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const q = search.trim().toLowerCase();

  const filteredParaphernalia = useMemo(() => {
    if (!q) return paraphernaliaRows;
    return paraphernaliaRows.filter((r) => {
      const hay = [r.names, r.items, r.quantity == null ? null : String(r.quantity), r.price == null ? null : String(r.price), r.date]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [paraphernaliaRows, q]);

  const filteredInventory = useMemo(() => {
    if (!q) return inventoryRows;
    return inventoryRows.filter((r) => {
      const hay = [
        r.items,
        r.paraphernalia?.names,
        r.paraphernalia?.items,
        r.stock_balance == null ? null : String(r.stock_balance),
        r.stock_in == null ? null : String(r.stock_in),
        r.stock_out == null ? null : String(r.stock_out),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [inventoryRows, q]);

  const filteredRestock = useMemo(() => {
    if (!q) return restockRows;
    return restockRows.filter((r) => {
      const hay = [
        r.date,
        r.status,
        r.item,
        r.quanitity,
        r.paraphernalia?.names,
        r.paraphernalia?.items,
        r.paraphernalia_inventory?.items,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [restockRows, q]);

  function paraphernaliaExportFileBase() {
    return `paraphernalia_export_${new Date().toISOString().slice(0, 10)}`;
  }

  function paraphernaliaItemsExportRows() {
    return filteredParaphernalia.map((r) => ({
      Name: safeText(r.names),
      Item: safeText(r.items),
      Quantity: tableCell(r.quantity),
      "Unit Price": tableCell(r.price),
      Date: safeText(r.date),
    }));
  }

  function inventorySnapshotExportRows() {
    return filteredInventory.map((r) => ({
      Name: safeText(r.paraphernalia?.names),
      Item: safeText(r.items ?? r.paraphernalia?.items),
      "Stock Balance": tableCell(r.stock_balance),
      "Stock In": tableCell(r.stock_in),
      "Stock Out": tableCell(r.stock_out),
    }));
  }

  function restockExportRows() {
    return filteredRestock.map((r) => ({
      Date: safeText(r.date),
      Status: safeText(r.status),
      Item: safeText(r.item ?? r.paraphernalia?.items),
      Quantity: safeText(r.quanitity),
      "Linked Inventory Item": safeText(r.paraphernalia_inventory?.items),
    }));
  }

  function exportParaphernaliaXlsx() {
    const rowsA = paraphernaliaItemsExportRows();
    const rowsB = inventorySnapshotExportRows();
    const rowsC = restockExportRows();
    if (!rowsA.length && !rowsB.length && !rowsC.length) {
      setError("No rows available for export.");
      return;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsA.length ? rowsA : [{}]), "Paraphernalia");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsB.length ? rowsB : [{}]), "InventorySnapshot");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsC.length ? rowsC : [{}]), "RestockHistory");

    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    downloadBlob(`${paraphernaliaExportFileBase()}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  function exportParaphernaliaCsv() {
    const rowsA = paraphernaliaItemsExportRows().map((r) => ({ Section: "Paraphernalia", ...r }));
    const rowsB = inventorySnapshotExportRows().map((r) => ({ Section: "InventorySnapshot", ...r }));
    const rowsC = restockExportRows().map((r) => ({ Section: "RestockHistory", ...r }));
    const rows = [...rowsA, ...rowsB, ...rowsC];
    if (!rows.length) {
      setError("No rows available for export.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    downloadBlob(`${paraphernaliaExportFileBase()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  }

  function exportParaphernaliaPdf() {
    const rowsA = paraphernaliaItemsExportRows();
    const rowsB = inventorySnapshotExportRows();
    const rowsC = restockExportRows();
    if (!rowsA.length && !rowsB.length && !rowsC.length) {
      setError("No rows available for export.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Paraphernalia Export", 40, 40);

    let y = 60;
    const sections: Array<{ title: string; rows: Record<string, string>[] }> = [
      { title: "Paraphernalia Items", rows: rowsA },
      { title: "Inventory Stock Snapshot", rows: rowsB },
      { title: "Restock History", rows: rowsC },
    ];

    for (const section of sections) {
      if (!section.rows.length) continue;
      doc.setFontSize(11);
      doc.text(section.title, 40, y);
      const headers = Object.keys(section.rows[0]);
      const body = section.rows.map((r) => headers.map((h) => String(r[h] ?? "")));
      autoTable(doc, {
        startY: y + 10,
        head: [headers],
        body,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [255, 218, 3], textColor: [0, 0, 0] },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 120) + 20;
    }

    doc.save(`${paraphernaliaExportFileBase()}.pdf`);
  }

  function openCreateModal() {
    setCreateError("");
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (createBusy) return;

    const names = form.names.trim();
    const items = form.items.trim();

    if (!names || !items) {
      setCreateError("Paraphernalia Name and Item are required.");
      return;
    }

    setCreateBusy(true);
    setCreateError("");

    const paraphernaliaId = crypto.randomUUID();

    const paraphernaliaPayload = {
      id_paraphernalia: paraphernaliaId,
      names,
      items,
      quantity: toNumberOrNull(form.quantity),
      price: toNumberOrNull(form.price),
      date: form.date.trim() || null,
    };

    const pInsert = await supabase.from("paraphernalia").insert(paraphernaliaPayload);

    if (pInsert.error) {
      setCreateBusy(false);
      setCreateError(pInsert.error?.message || "Failed to create paraphernalia item.");
      return;
    }

    let inventoryId: string | null = null;

    if (form.createInventory) {
      inventoryId = crypto.randomUUID();
      const invPayload = {
        id_paraphernalia_inventory: inventoryId,
        id_paraphernalia: paraphernaliaId,
        items: form.inventoryItems.trim() || items,
        stock_balance: toNumberOrNull(form.stockBalance),
        stock_in: toNumberOrNull(form.stockIn),
        stock_out: toNumberOrNull(form.stockOut),
      };

      const invInsert = await supabase.from("paraphernalia_inventory").insert(invPayload);

      if (invInsert.error) {
        setCreateBusy(false);
        setCreateError(invInsert.error?.message || "Paraphernalia item created, but inventory snapshot failed.");
        await loadAll();
        return;
      }
    }

    if (form.createRestock) {
      const restockPayload = {
        id_restock: crypto.randomUUID(),
        id_paraphernalia: paraphernaliaId,
        id_paraphernalia_inventory: inventoryId,
        date: form.restockDate.trim() || null,
        status: form.restockStatus.trim() || null,
        item: form.restockItem.trim() || items,
        quanitity: form.restockQuantity.trim() || null,
      };

      const rInsert = await supabase.from("restock").insert(restockPayload);
      if (rInsert.error) {
        setCreateBusy(false);
        setCreateError(rInsert.error.message || "Main records saved, but restock history failed.");
        await loadAll();
        return;
      }
    }

    setCreateBusy(false);
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    await loadAll();
  }

  function openEdit(section: "paraphernalia" | "inventory" | "restock", row: ParaphernaliaRow | ParaphernaliaInventoryRow | RestockRow) {
    setEditError("");
    if (section === "paraphernalia") {
      setEditState({ section, row: row as ParaphernaliaRow });
      return;
    }
    if (section === "inventory") {
      setEditState({ section, row: row as ParaphernaliaInventoryRow });
      return;
    }
    setEditState({ section, row: row as RestockRow });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editState || editBusy) return;

    setEditBusy(true);
    setEditError("");

    if (editState.section === "paraphernalia") {
      const row = editState.row;
      const { error: updateError } = await supabase
        .from("paraphernalia")
        .update({
          names: row.names?.trim() || null,
          items: row.items?.trim() || null,
          quantity: toNumberOrNull(row.quantity),
          price: toNumberOrNull(row.price),
          date: row.date?.trim() || null,
        })
        .eq("id_paraphernalia", row.id_paraphernalia);

      if (updateError) {
        setEditBusy(false);
        setEditError(updateError.message || "Failed to update paraphernalia row.");
        return;
      }
    }

    if (editState.section === "inventory") {
      const row = editState.row;
      const { error: updateError } = await supabase
        .from("paraphernalia_inventory")
        .update({
          items: row.items?.trim() || null,
          stock_balance: toNumberOrNull(row.stock_balance),
          stock_in: toNumberOrNull(row.stock_in),
          stock_out: toNumberOrNull(row.stock_out),
        })
        .eq("id_paraphernalia_inventory", row.id_paraphernalia_inventory);

      if (updateError) {
        setEditBusy(false);
        setEditError(updateError.message || "Failed to update inventory row.");
        return;
      }
    }

    if (editState.section === "restock") {
      const row = editState.row;
      const { error: updateError } = await supabase
        .from("restock")
        .update({
          date: row.date?.trim() || null,
          status: row.status?.trim() || null,
          item: row.item?.trim() || null,
          quanitity: row.quanitity?.trim() || null,
        })
        .eq("id_restock", row.id_restock);

      if (updateError) {
        setEditBusy(false);
        setEditError(updateError.message || "Failed to update restock row.");
        return;
      }
    }

    setEditBusy(false);
    setEditState(null);
    await loadAll();
  }

  function openDelete(section: "paraphernalia" | "inventory" | "restock", id: string, label: string) {
    setDeleteError("");
    setDeleteState({ section, id, label });
  }

  async function confirmDelete() {
    if (!deleteState || deleteBusy) return;

    setDeleteBusy(true);
    setDeleteError("");

    if (deleteState.section === "paraphernalia") {
      const { error: deleteErrorValue } = await supabase
        .from("paraphernalia")
        .delete()
        .eq("id_paraphernalia", deleteState.id);
      if (deleteErrorValue) {
        setDeleteBusy(false);
        setDeleteError(deleteErrorValue.message || "Failed to delete paraphernalia row.");
        return;
      }
    }

    if (deleteState.section === "inventory") {
      const { error: deleteErrorValue } = await supabase
        .from("paraphernalia_inventory")
        .delete()
        .eq("id_paraphernalia_inventory", deleteState.id);
      if (deleteErrorValue) {
        setDeleteBusy(false);
        setDeleteError(deleteErrorValue.message || "Failed to delete inventory row.");
        return;
      }
    }

    if (deleteState.section === "restock") {
      const { error: deleteErrorValue } = await supabase
        .from("restock")
        .delete()
        .eq("id_restock", deleteState.id);
      if (deleteErrorValue) {
        setDeleteBusy(false);
        setDeleteError(deleteErrorValue.message || "Failed to delete restock row.");
        return;
      }
    }

    setDeleteBusy(false);
    setDeleteState(null);
    await loadAll();
  }

  return (
    <div className="rounded-3xl bg-white border p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-gray-900">Logistics • Paraphernalia</div>
          <div className="text-sm text-gray-500">Clear view of item list, stock summary, and restock history.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-medium hover:brightness-95"
          >
            <Plus className="w-4 h-4" />
            Add Paraphernalia Data
          </button>

          {canImportParaphernalia ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importBusy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50 disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              {importBusy ? "Importing..." : "Import Excel/CSV"}
            </button>
          ) : null}

          {canDownloadParaphernaliaTemplate ? (
            <>
              <button
                type="button"
                onClick={() => downloadTemplate("xlsx")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50"
              >
                <Download className="w-4 h-4" /> Template XLSX
              </button>
              <button
                type="button"
                onClick={() => downloadTemplate("csv")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50"
              >
                <Download className="w-4 h-4" /> Template CSV
              </button>
            </>
          ) : null}

          {canExportParaphernalia ? (
            <>
              <button
                type="button"
                onClick={exportParaphernaliaPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50"
              >
                <FileText className="w-4 h-4" /> Export PDF
              </button>
              <button
                type="button"
                onClick={exportParaphernaliaXlsx}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50"
              >
                <FileDown className="w-4 h-4" /> Export XLSX
              </button>
              <button
                type="button"
                onClick={exportParaphernaliaCsv}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50"
              >
                <FileDown className="w-4 h-4" /> Export CSV
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

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all paraphernalia tables..."
            className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50 w-full md:w-auto"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {infoMessage ? <div className="rounded-2xl border bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{infoMessage}</div> : null}

      <div className="space-y-3">
        <div className="text-sm font-semibold text-black">Paraphernalia Items</div>
        <div className="relative overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm text-black">
            <thead className="bg-gray-50 border-b text-black">
              <tr>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Item</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Quantity</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Unit Price</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <LoadingCircle label="Loading paraphernalia..." className="py-2" />
                  </td>
                </tr>
              ) : filteredParaphernalia.length ? (
                filteredParaphernalia.map((r) => (
                  <tr key={r.id_paraphernalia} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{safeText(r.names)}</td>
                    <td className="px-4 py-3">{safeText(r.items)}</td>
                    <td className="px-4 py-3">{tableCell(r.quantity)}</td>
                    <td className="px-4 py-3">{tableCell(r.price)}</td>
                    <td className="px-4 py-3">{safeText(r.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit("paraphernalia", r)}
                          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-gray-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete("paraphernalia", r.id_paraphernalia, r.items ?? r.names ?? "paraphernalia row")}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 px-2 py-1 text-xs hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No paraphernalia rows.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-black">Inventory Stock Snapshot</div>
        <div className="relative overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm text-black">
            <thead className="bg-gray-50 border-b text-black">
              <tr>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Item</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Stock Balance</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Stock In</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Stock Out</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <LoadingCircle label="Loading inventory..." className="py-2" />
                  </td>
                </tr>
              ) : filteredInventory.length ? (
                filteredInventory.map((r) => (
                  <tr key={r.id_paraphernalia_inventory} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{safeText(r.paraphernalia?.names)}</td>
                    <td className="px-4 py-3">{safeText(r.items ?? r.paraphernalia?.items)}</td>
                    <td className="px-4 py-3">{tableCell(r.stock_balance)}</td>
                    <td className="px-4 py-3">{tableCell(r.stock_in)}</td>
                    <td className="px-4 py-3">{tableCell(r.stock_out)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit("inventory", r)}
                          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-gray-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            openDelete(
                              "inventory",
                              r.id_paraphernalia_inventory,
                              r.items ?? r.paraphernalia?.items ?? "inventory row"
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 px-2 py-1 text-xs hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No inventory rows.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-black">Restock History</div>
        <div className="relative overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm text-black">
            <thead className="bg-gray-50 border-b text-black">
              <tr>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Item</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Quantity</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Linked Inventory Item</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <LoadingCircle label="Loading restock history..." className="py-2" />
                  </td>
                </tr>
              ) : filteredRestock.length ? (
                filteredRestock.map((r) => (
                  <tr key={r.id_restock} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{safeText(r.date)}</td>
                    <td className="px-4 py-3">{safeText(r.status)}</td>
                    <td className="px-4 py-3">{safeText(r.item ?? r.paraphernalia?.items)}</td>
                    <td className="px-4 py-3">{safeText(r.quanitity)}</td>
                    <td className="px-4 py-3">{safeText(r.paraphernalia_inventory?.items)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit("restock", r)}
                          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-gray-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete("restock", r.id_restock, r.item ?? "restock row")}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-red-600 px-2 py-1 text-xs hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No restock rows.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b sticky top-0 bg-white">
              <div className="text-base font-semibold text-black">Add Paraphernalia Data</div>
              <div className="text-sm text-gray-500">Segmented form for Paraphernalia Items, Inventory Stock Snapshot, and Restock History.</div>
            </div>

            <form onSubmit={handleCreateSubmit} className="px-5 py-4 space-y-5">
              <div className="rounded-2xl border p-4 space-y-3">
                <div className="text-sm font-semibold text-black">Paraphernalia Items</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Name *</span>
                    <input
                      value={form.names}
                      onChange={(e) => setForm((prev) => ({ ...prev, names: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="Enter name"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Item *</span>
                    <input
                      value={form.items}
                      onChange={(e) => setForm((prev) => ({ ...prev, items: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="Enter item"
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Quantity</span>
                    <input
                      type="number"
                      value={form.quantity}
                      onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Unit Price</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-700">Date</span>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-black">Inventory Stock Snapshot</div>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={form.createInventory}
                      onChange={(e) => setForm((prev) => ({ ...prev, createInventory: e.target.checked }))}
                    />
                    Include this section
                  </label>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${form.createInventory ? "" : "opacity-50 pointer-events-none"}`}>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-700">Inventory Item</span>
                    <input
                      value={form.inventoryItems}
                      onChange={(e) => setForm((prev) => ({ ...prev, inventoryItems: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="Defaults to Paraphernalia Item"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Stock Balance</span>
                    <input
                      type="number"
                      value={form.stockBalance}
                      onChange={(e) => setForm((prev) => ({ ...prev, stockBalance: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Stock In</span>
                    <input
                      type="number"
                      value={form.stockIn}
                      onChange={(e) => setForm((prev) => ({ ...prev, stockIn: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-700">Stock Out</span>
                    <input
                      type="number"
                      value={form.stockOut}
                      onChange={(e) => setForm((prev) => ({ ...prev, stockOut: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="0"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-black">Restock History</div>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={form.createRestock}
                      onChange={(e) => setForm((prev) => ({ ...prev, createRestock: e.target.checked }))}
                    />
                    Include this section
                  </label>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${form.createRestock ? "" : "opacity-50 pointer-events-none"}`}>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Date</span>
                    <input
                      type="date"
                      value={form.restockDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, restockDate: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Status</span>
                    <input
                      value={form.restockStatus}
                      onChange={(e) => setForm((prev) => ({ ...prev, restockStatus: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="e.g. Restocked"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Item</span>
                    <input
                      value={form.restockItem}
                      onChange={(e) => setForm((prev) => ({ ...prev, restockItem: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="Defaults to Paraphernalia Item"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Quantity</span>
                    <input
                      value={form.restockQuantity}
                      onChange={(e) => setForm((prev) => ({ ...prev, restockQuantity: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                      placeholder="e.g. 10"
                    />
                  </label>
                </div>
              </div>

              {createError ? (
                <div className="rounded-xl border bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  disabled={createBusy}
                  className="px-4 py-2 rounded-xl border text-sm text-black hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBusy}
                  className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-medium hover:brightness-95 disabled:opacity-60"
                >
                  {createBusy ? "Saving..." : "Save All Connected Data"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editState ? (
        <div className="fixed inset-0 z-[85] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-xl">
            <div className="px-5 py-4 border-b">
              <div className="text-base font-semibold text-black">Edit {editState.section === "paraphernalia" ? "Paraphernalia Item" : editState.section === "inventory" ? "Inventory Snapshot" : "Restock History"}</div>
            </div>

            <form onSubmit={saveEdit} className="px-5 py-4 space-y-4">
              {editState.section === "paraphernalia" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Name</span>
                    <input
                      value={editState.row.names ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "paraphernalia"
                            ? { ...prev, row: { ...prev.row, names: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Item</span>
                    <input
                      value={editState.row.items ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "paraphernalia"
                            ? { ...prev, row: { ...prev.row, items: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Quantity</span>
                    <input
                      type="number"
                      value={editState.row.quantity ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "paraphernalia"
                            ? { ...prev, row: { ...prev.row, quantity: toNumberOrNull(e.target.value) } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Unit Price</span>
                    <input
                      type="number"
                      value={editState.row.price ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "paraphernalia"
                            ? { ...prev, row: { ...prev.row, price: toNumberOrNull(e.target.value) } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-700">Date</span>
                    <input
                      value={editState.row.date ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "paraphernalia"
                            ? { ...prev, row: { ...prev.row, date: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                </div>
              ) : null}

              {editState.section === "inventory" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-700">Item</span>
                    <input
                      value={editState.row.items ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "inventory"
                            ? { ...prev, row: { ...prev.row, items: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Stock Balance</span>
                    <input
                      type="number"
                      value={editState.row.stock_balance ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "inventory"
                            ? { ...prev, row: { ...prev.row, stock_balance: toNumberOrNull(e.target.value) } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Stock In</span>
                    <input
                      type="number"
                      value={editState.row.stock_in ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "inventory"
                            ? { ...prev, row: { ...prev.row, stock_in: toNumberOrNull(e.target.value) } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-gray-700">Stock Out</span>
                    <input
                      type="number"
                      value={editState.row.stock_out ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "inventory"
                            ? { ...prev, row: { ...prev.row, stock_out: toNumberOrNull(e.target.value) } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                </div>
              ) : null}

              {editState.section === "restock" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Date</span>
                    <input
                      value={editState.row.date ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "restock"
                            ? { ...prev, row: { ...prev.row, date: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Status</span>
                    <input
                      value={editState.row.status ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "restock"
                            ? { ...prev, row: { ...prev.row, status: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Item</span>
                    <input
                      value={editState.row.item ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "restock"
                            ? { ...prev, row: { ...prev.row, item: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-gray-700">Quantity</span>
                    <input
                      value={editState.row.quanitity ?? ""}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev && prev.section === "restock"
                            ? { ...prev, row: { ...prev.row, quanitity: e.target.value } }
                            : prev
                        )
                      }
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </label>
                </div>
              ) : null}

              {editError ? <div className="rounded-xl border bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div> : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditState(null)}
                  disabled={editBusy}
                  className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editBusy}
                  className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-medium hover:brightness-95 disabled:opacity-60"
                >
                  {editBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteState ? (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-xl">
            <div className="px-5 py-4 border-b">
              <div className="text-base font-semibold text-black">Confirm Delete</div>
              <div className="mt-1 text-sm text-gray-600">Delete this {deleteState.section} row: {safeText(deleteState.label)}?</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {deleteError ? <div className="rounded-xl border bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div> : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteState(null)}
                  disabled={deleteBusy}
                  className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={deleteBusy}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                >
                  {deleteBusy ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ImportSummaryModal
        open={importSummaryOpen}
        summary={importSummary}
        title="Paraphernalia Import Summary"
        onClose={() => setImportSummaryOpen(false)}
      />
    </div>
  );
}
