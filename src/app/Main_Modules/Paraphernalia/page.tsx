"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";

type ParaphernaliaRow = {
  names: string | null;
  items: string | null;
  quantity: number | null;
  price: number | null;
  date: string | null;
};

type ParaphernaliaInventoryRow = {
  items: string | null;
  stock_balance: number | null;
  stock_in: number | null;
  stock_out: number | null;
  paraphernalia: { names: string | null; items: string | null } | null;
  contracts: { contract_no: string | null; start_date: string | null; end_date: string | null } | null;
};

type RestockRow = {
  date: string | null;
  status: string | null;
  item: string | null;
  quanitity: string | null;
  paraphernalia: { names: string | null; items: string | null } | null;
  paraphernalia_inventory: { items: string | null } | null;
  contracts: { contract_no: string | null; start_date: string | null; end_date: string | null } | null;
};

type UnifiedRow = {
  source: "paraphernalia" | "inventory" | "restock";
  names: string | null;
  items: string | null;
  quantity: number | null;
  price: number | null;
  date: string | null;
  stock_balance: number | null;
  stock_in: number | null;
  stock_out: number | null;
  restock_status: string | null;
  restock_item: string | null;
  restock_quanitity: string | null;
  contract_no: string | null;
  contract_start: string | null;
  contract_end: string | null;
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
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : null;
}

export default function ParaphernaliaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [paraphernaliaRows, setParaphernaliaRows] = useState<ParaphernaliaRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<ParaphernaliaInventoryRow[]>([]);
  const [restockRows, setRestockRows] = useState<RestockRow[]>([]);

  const mergedRows = useMemo(() => {
    const merged: UnifiedRow[] = [];

    for (const r of paraphernaliaRows) {
      merged.push({
        source: "paraphernalia",
        names: r.names,
        items: r.items,
        quantity: r.quantity,
        price: r.price,
        date: r.date,
        stock_balance: null,
        stock_in: null,
        stock_out: null,
        restock_status: null,
        restock_item: null,
        restock_quanitity: null,
        contract_no: null,
        contract_start: null,
        contract_end: null,
      });
    }

    for (const r of inventoryRows) {
      merged.push({
        source: "inventory",
        names: r.paraphernalia?.names ?? null,
        items: r.items ?? r.paraphernalia?.items ?? null,
        quantity: null,
        price: null,
        date: null,
        stock_balance: r.stock_balance,
        stock_in: r.stock_in,
        stock_out: r.stock_out,
        restock_status: null,
        restock_item: null,
        restock_quanitity: null,
        contract_no: r.contracts?.contract_no ?? null,
        contract_start: r.contracts?.start_date ?? null,
        contract_end: r.contracts?.end_date ?? null,
      });
    }

    for (const r of restockRows) {
      merged.push({
        source: "restock",
        names: r.paraphernalia?.names ?? null,
        items: r.paraphernalia?.items ?? null,
        quantity: null,
        price: null,
        date: r.date,
        stock_balance: null,
        stock_in: null,
        stock_out: null,
        restock_status: r.status,
        restock_item: r.item,
        restock_quanitity: r.quanitity,
        contract_no: r.contracts?.contract_no ?? null,
        contract_start: r.contracts?.start_date ?? null,
        contract_end: r.contracts?.end_date ?? null,
      });
    }

    return merged;
  }, [inventoryRows, paraphernaliaRows, restockRows]);

  async function loadAll() {
    setLoading(true);
    setError("");

    const [pRes, invRes, rRes] = await Promise.all([
      supabase
        .from("paraphernalia")
        .select("names, items, quantity, price, date")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("paraphernalia_inventory")
        .select(
          "items, stock_balance, stock_in, stock_out, paraphernalia(names, items), contracts(contract_no, start_date, end_date)"
        )
        .limit(2000),
      supabase
        .from("restock")
        .select(
          "date, status, item, quanitity, paraphernalia(names, items), paraphernalia_inventory(items), contracts(contract_no, start_date, end_date)"
        )
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

    setParaphernaliaRows((pRes.data ?? []) as ParaphernaliaRow[]);

    const invRaw = (invRes.data ?? []) as Record<string, unknown>[];
    setInventoryRows(
      invRaw.map((r) => {
        const paraphernalia = firstOrNull(r.paraphernalia as { names?: unknown; items?: unknown } | { names?: unknown; items?: unknown }[] | null);
        const contracts = firstOrNull(
          r.contracts as
            | { contract_no?: unknown; start_date?: unknown; end_date?: unknown }
            | { contract_no?: unknown; start_date?: unknown; end_date?: unknown }[]
            | null
        );

        return {
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
          contracts: contracts
            ? {
                contract_no: contracts.contract_no == null ? null : String(contracts.contract_no),
                start_date: contracts.start_date == null ? null : String(contracts.start_date),
                end_date: contracts.end_date == null ? null : String(contracts.end_date),
              }
            : null,
        } satisfies ParaphernaliaInventoryRow;
      })
    );

    const restockRaw = (rRes.data ?? []) as Record<string, unknown>[];
    setRestockRows(
      restockRaw.map((r) => {
        const paraphernalia = firstOrNull(r.paraphernalia as { names?: unknown; items?: unknown } | { names?: unknown; items?: unknown }[] | null);
        const paraphernaliaInventory = firstOrNull(
          r.paraphernalia_inventory as { items?: unknown } | { items?: unknown }[] | null
        );
        const contracts = firstOrNull(
          r.contracts as
            | { contract_no?: unknown; start_date?: unknown; end_date?: unknown }
            | { contract_no?: unknown; start_date?: unknown; end_date?: unknown }[]
            | null
        );

        return {
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
          contracts: contracts
            ? {
                contract_no: contracts.contract_no == null ? null : String(contracts.contract_no),
                start_date: contracts.start_date == null ? null : String(contracts.start_date),
                end_date: contracts.end_date == null ? null : String(contracts.end_date),
              }
            : null,
        } satisfies RestockRow;
      })
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
  const filteredMerged = useMemo(() => {
    if (!q) return mergedRows;
    return mergedRows.filter((r) => {
      const hay = [
        r.source,
        r.names,
        r.items,
        r.quantity == null ? null : String(r.quantity),
        r.price == null ? null : String(r.price),
        r.date,
        r.stock_balance == null ? null : String(r.stock_balance),
        r.stock_in == null ? null : String(r.stock_in),
        r.stock_out == null ? null : String(r.stock_out),
        r.restock_status,
        r.restock_item,
        r.restock_quanitity,
        r.contract_no,
        r.contract_start,
        r.contract_end,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [mergedRows, q]);

  return (
    <div className="rounded-3xl bg-white border p-6 space-y-6">
      <div>
        <div className="text-lg font-semibold text-gray-900">Logistics • Paraphernalia</div>
        <div className="text-sm text-gray-500">Connected to restock, paraphernalia, and paraphernalia_inventory tables.</div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search paraphernalia/inventory/restock..."
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

      {/* Merged Table */}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-black">Paraphernalia</div>
        <div className="relative overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm text-black">
            <thead className="bg-gray-50 border-b text-black">
              <tr>
                {[
                  "source",
                  "names",
                  "items",
                  "quantity",
                  "price",
                  "date",
                  "stock_balance",
                  "stock_in",
                  "stock_out",
                  "restock_status",
                  "restock_item",
                  "restock_quanitity",
                  "contract_no",
                  "contract_start",
                  "contract_end",
                ].map((label) => (
                  <th key={label} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-gray-500">Loading paraphernalia...</td>
                </tr>
              ) : filteredMerged.length ? (
                filteredMerged.map((r, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{safeText(r.source)}</td>
                    <td className="px-4 py-3">{safeText(r.names)}</td>
                    <td className="px-4 py-3">{safeText(r.items)}</td>
                    <td className="px-4 py-3">{r.quantity ?? "—"}</td>
                    <td className="px-4 py-3">{r.price ?? "—"}</td>
                    <td className="px-4 py-3">{safeText(r.date)}</td>
                    <td className="px-4 py-3">{r.stock_balance ?? "—"}</td>
                    <td className="px-4 py-3">{r.stock_in ?? "—"}</td>
                    <td className="px-4 py-3">{r.stock_out ?? "—"}</td>
                    <td className="px-4 py-3">{safeText(r.restock_status)}</td>
                    <td className="px-4 py-3">{safeText(r.restock_item)}</td>
                    <td className="px-4 py-3">{safeText(r.restock_quanitity)}</td>
                    <td className="px-4 py-3">{safeText(r.contract_no)}</td>
                    <td className="px-4 py-3">{safeText(r.contract_start)}</td>
                    <td className="px-4 py-3">{safeText(r.contract_end)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-gray-400">No rows.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
