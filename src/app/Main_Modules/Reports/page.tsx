"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/Client/SupabaseClients";
import LoadingCircle from "@/app/Components/LoadingCircle";

type LoadState = {
  loading: boolean;
  error: string;
};

type ContractRow = {
  contract_id: string;
  status: string | null;
  client_name: string | null;
  project_name: string | null;
  contract_end: string | null;
  contracted_manpower: number | null;
  deployed_guards: number | null;
};

type InventoryFixedAssetRow = {
  id: string;
  date: string | null;
  firearms_qty: number | null;
  firearms_price: number | null;
  communications_qty: number | null;
  communications_price: number | null;
  furniture_qty: number | null;
  furniture_price: number | null;
  office_qty: number | null;
  office_price: number | null;
  sec_qty: number | null;
  sec_price: number | null;
  vehicle_qty: number | null;
  vehicle_price: number | null;
};

type ParaphernaliaInventoryRow = {
  id_paraphernalia_inventory: string;
  items: string | null;
  stock_balance: number | null;
  paraphernalia: { names: string | null; items: string | null } | null;
};

type RestockRow = {
  id_restock: string;
  status: string | null;
  date: string | null;
  item: string | null;
  quanitity: string | null;
};

type InventoryQtyKey =
  | "firearms_qty"
  | "communications_qty"
  | "furniture_qty"
  | "office_qty"
  | "sec_qty"
  | "vehicle_qty";

type InventoryPriceKey =
  | "firearms_price"
  | "communications_price"
  | "furniture_price"
  | "office_price"
  | "sec_price"
  | "vehicle_price";

type CategoryConfig = {
  label: string;
  qtyKey: InventoryQtyKey;
  priceKey: InventoryPriceKey;
};

const CATEGORY_CONFIGS: readonly CategoryConfig[] = [
  { label: "Firearms & Ammunitions", qtyKey: "firearms_qty", priceKey: "firearms_price" },
  { label: "Communications Equipment", qtyKey: "communications_qty", priceKey: "communications_price" },
  { label: "Furniture & Fixtures", qtyKey: "furniture_qty", priceKey: "furniture_price" },
  { label: "Office Equip.", qtyKey: "office_qty", priceKey: "office_price" },
  { label: "Sec Equip.", qtyKey: "sec_qty", priceKey: "sec_price" },
  { label: "Vehicle & Motorcycle", qtyKey: "vehicle_qty", priceKey: "vehicle_price" },
];

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function moneyPhp(value: number) {
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function fmtDate(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString();
}

function normalizeStatus(s: string | null) {
  const v = String(s ?? "").trim().toUpperCase();
  return v || "UNKNOWN";
}

function getErrorMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export default function LogisticsReportsPage() {
  const [contractsState, setContractsState] = useState<LoadState>({ loading: true, error: "" });
  const [inventoryState, setInventoryState] = useState<LoadState>({ loading: true, error: "" });
  const [paraphernaliaState, setParaphernaliaState] = useState<LoadState>({ loading: true, error: "" });
  const [restockState, setRestockState] = useState<LoadState>({ loading: true, error: "" });

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryFixedAssetRow[]>([]);
  const [paraInvRows, setParaInvRows] = useState<ParaphernaliaInventoryRow[]>([]);
  const [restockRows, setRestockRows] = useState<RestockRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadContracts() {
      setContractsState({ loading: true, error: "" });
      try {
        const res = await supabase
          .from("contracts")
          .select("contract_id, status, client_name, project_name, contract_end, contracted_manpower, deployed_guards")
          .order("created_at", { ascending: false })
          .limit(5000);
        if (res.error) throw res.error;
        if (cancelled) return;
        setContracts((res.data as ContractRow[]) ?? []);
      } catch (e: unknown) {
        if (cancelled) return;
        setContracts([]);
        setContractsState({ loading: false, error: getErrorMessage(e, "Failed to load contracts.") });
        return;
      }
      if (cancelled) return;
      setContractsState({ loading: false, error: "" });
    }

    async function loadInventory() {
      setInventoryState({ loading: true, error: "" });
      try {
        const res = await supabase
          .from("inventory_fixed_asset")
          .select(
            "id, date, firearms_qty, firearms_price, communications_qty, communications_price, furniture_qty, furniture_price, office_qty, office_price, sec_qty, sec_price, vehicle_qty, vehicle_price"
          )
          .order("date", { ascending: false })
          .limit(1000);
        if (res.error) throw res.error;
        if (cancelled) return;
        setInventoryRows((res.data as InventoryFixedAssetRow[]) ?? []);
      } catch (e: unknown) {
        if (cancelled) return;
        setInventoryRows([]);
        setInventoryState({ loading: false, error: getErrorMessage(e, "Failed to load inventory.") });
        return;
      }
      if (cancelled) return;
      setInventoryState({ loading: false, error: "" });
    }

    async function loadParaphernalia() {
      setParaphernaliaState({ loading: true, error: "" });
      try {
        const res = await supabase
          .from("paraphernalia_inventory")
          .select("id_paraphernalia_inventory, items, stock_balance, paraphernalia(names, items)")
          .limit(2000);
        if (res.error) throw res.error;
        if (cancelled) return;
        setParaInvRows((res.data as ParaphernaliaInventoryRow[]) ?? []);
      } catch (e: unknown) {
        if (cancelled) return;
        setParaInvRows([]);
        setParaphernaliaState({
          loading: false,
          error: getErrorMessage(e, "Failed to load paraphernalia inventory."),
        });
        return;
      }
      if (cancelled) return;
      setParaphernaliaState({ loading: false, error: "" });
    }

    async function loadRestock() {
      setRestockState({ loading: true, error: "" });
      try {
        const res = await supabase
          .from("restock")
          .select("id_restock, status, date, item, quanitity")
          .order("timestamptz", { ascending: false })
          .limit(3000);
        if (res.error) throw res.error;
        if (cancelled) return;
        setRestockRows((res.data as RestockRow[]) ?? []);
      } catch (e: unknown) {
        if (cancelled) return;
        setRestockRows([]);
        setRestockState({ loading: false, error: getErrorMessage(e, "Failed to load restock history.") });
        return;
      }
      if (cancelled) return;
      setRestockState({ loading: false, error: "" });
    }

    void loadContracts();
    void loadInventory();
    void loadParaphernalia();
    void loadRestock();

    return () => {
      cancelled = true;
    };
  }, []);

  const contractsSummary = useMemo(() => {
    const byStatus = new Map<string, { count: number; deployed: number; manpower: number }>();
    for (const c of contracts) {
      const k = normalizeStatus(c.status);
      const cur = byStatus.get(k) ?? { count: 0, deployed: 0, manpower: 0 };
      cur.count += 1;
      cur.deployed += safeNum(c.deployed_guards);
      cur.manpower += safeNum(c.contracted_manpower);
      byStatus.set(k, cur);
    }
    const rows = Array.from(byStatus.entries())
      .map(([status, v]) => ({ status, ...v }))
      .sort((a, b) => b.count - a.count);

    const active = rows.find((r) => r.status === "ACTIVE")?.count ?? 0;
    return {
      total: contracts.length,
      active,
      rows,
      totalDeployed: rows.reduce((s, r) => s + r.deployed, 0),
      totalManpower: rows.reduce((s, r) => s + r.manpower, 0),
    };
  }, [contracts]);

  const inventorySummary = useMemo(() => {
    const byCategory = CATEGORY_CONFIGS.map((cfg) => {
      const quantity = inventoryRows.reduce((sum, r) => sum + safeNum(r[cfg.qtyKey]), 0);
      const value = inventoryRows.reduce((sum, r) => sum + safeNum(r[cfg.priceKey]), 0);
      return { label: cfg.label, quantity, value };
    });
    const totalValue = byCategory.reduce((sum, r) => sum + r.value, 0);
    const totalQty = byCategory.reduce((sum, r) => sum + r.quantity, 0);
    return { byCategory, totalValue, totalQty };
  }, [inventoryRows]);

  const paraphernaliaSummary = useMemo(() => {
    const totalStockBalance = paraInvRows.reduce((sum, r) => sum + safeNum(r.stock_balance), 0);
    const lowest = [...paraInvRows]
      .sort((a, b) => safeNum(a.stock_balance) - safeNum(b.stock_balance))
      .slice(0, 12);
    return { totalStockBalance, lowest, totalItems: paraInvRows.length };
  }, [paraInvRows]);

  const restockSummary = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const r of restockRows) {
      const k = normalizeStatus(r.status);
      byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
    }
    const rows = Array.from(byStatus.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
    return { total: restockRows.length, rows };
  }, [restockRows]);

  const anyLoading = contractsState.loading || inventoryState.loading || paraphernaliaState.loading || restockState.loading;

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-6">
      <div>
        <div className="text-lg font-semibold text-black">Logistics • Reports</div>
        <div className="text-sm text-gray-500 mt-1">Quick summaries for Client, Inventory, and Paraphernalia.</div>
      </div>

      {anyLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingCircle />
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border bg-gray-50 p-4">
          <div className="text-xs text-gray-500">Contracts (Active)</div>
          <div className="text-2xl font-bold text-black mt-1">{contractsSummary.active}</div>
          <div className="text-xs text-gray-500 mt-1">Total: {contractsSummary.total}</div>
          {contractsState.error ? <div className="text-xs text-red-600 mt-2">{contractsState.error}</div> : null}
        </div>
        <div className="rounded-2xl border bg-gray-50 p-4">
          <div className="text-xs text-gray-500">Deployed Guards</div>
          <div className="text-2xl font-bold text-black mt-1">{contractsSummary.totalDeployed}</div>
          <div className="text-xs text-gray-500 mt-1">Contracted: {contractsSummary.totalManpower}</div>
        </div>
        <div className="rounded-2xl border bg-gray-50 p-4">
          <div className="text-xs text-gray-500">Inventory Value</div>
          <div className="text-2xl font-bold text-black mt-1">₱ {moneyPhp(inventorySummary.totalValue)}</div>
          <div className="text-xs text-gray-500 mt-1">Total qty: {inventorySummary.totalQty}</div>
          {inventoryState.error ? <div className="text-xs text-red-600 mt-2">{inventoryState.error}</div> : null}
        </div>
        <div className="rounded-2xl border bg-gray-50 p-4">
          <div className="text-xs text-gray-500">Paraphernalia Stock Balance</div>
          <div className="text-2xl font-bold text-black mt-1">{paraphernaliaSummary.totalStockBalance}</div>
          <div className="text-xs text-gray-500 mt-1">Items tracked: {paraphernaliaSummary.totalItems}</div>
          {paraphernaliaState.error ? <div className="text-xs text-red-600 mt-2">{paraphernaliaState.error}</div> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <div className="text-sm font-semibold text-black">Inventory • Totals by Category</div>
            <div className="text-xs text-gray-500">Sum of qty + value columns in inventory_fixed_asset</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-black">
              <thead>
                <tr className="bg-[#FFDA03]">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Category</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Quantity</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Value</th>
                </tr>
              </thead>
              <tbody>
                {inventorySummary.byCategory.map((r) => (
                  <tr key={r.label} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{r.label}</td>
                    <td className="px-4 py-3 text-right">{r.quantity}</td>
                    <td className="px-4 py-3 text-right">₱ {moneyPhp(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <div className="text-sm font-semibold text-black">Clients • Contracts by Status</div>
            <div className="text-xs text-gray-500">Counts + manpower/deployed totals</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-black">
              <thead>
                <tr className="bg-[#FFDA03]">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Contracts</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Contracted</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Deployed</th>
                </tr>
              </thead>
              <tbody>
                {contractsSummary.rows.length ? (
                  contractsSummary.rows.map((r) => (
                    <tr key={r.status} className="border-b last:border-b-0">
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3 text-right">{r.count}</td>
                      <td className="px-4 py-3 text-right">{r.manpower}</td>
                      <td className="px-4 py-3 text-right">{r.deployed}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={4}>
                      No contract rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <div className="text-sm font-semibold text-black">Paraphernalia • Lowest Stock</div>
            <div className="text-xs text-gray-500">Top 12 items with the lowest stock balance</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-black">
              <thead>
                <tr className="bg-[#FFDA03]">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Item</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Stock</th>
                </tr>
              </thead>
              <tbody>
                {paraphernaliaSummary.lowest.length ? (
                  paraphernaliaSummary.lowest.map((r) => (
                    <tr key={r.id_paraphernalia_inventory} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        {(r.paraphernalia?.items ?? r.items ?? "—")}
                        <div className="text-[11px] text-gray-500">{r.paraphernalia?.names ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{safeNum(r.stock_balance)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={2}>
                      No paraphernalia inventory rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <div className="text-sm font-semibold text-black">Restock • Status Summary</div>
            <div className="text-xs text-gray-500">Counts by restock.status</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-black">
              <thead>
                <tr className="bg-[#FFDA03]">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Count</th>
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Latest</th>
                </tr>
              </thead>
              <tbody>
                {restockSummary.rows.length ? (
                  restockSummary.rows.map((r) => {
                    const latest = restockRows.find((x) => normalizeStatus(x.status) === r.status) ?? null;
                    return (
                      <tr key={r.status} className="border-b last:border-b-0">
                        <td className="px-4 py-3">{r.status}</td>
                        <td className="px-4 py-3 text-right">{r.count}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmtDate(latest?.date ?? null)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={3}>
                      No restock rows found.
                      {restockState.error ? <span className="text-red-600"> ({restockState.error})</span> : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
