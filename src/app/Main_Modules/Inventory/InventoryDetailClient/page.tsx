"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/Client/SupabaseClients";
import { useMyColumnAccess } from "@/app/Client/useRbac";
import LoadingCircle from "@/app/Components/LoadingCircle";

type InventoryDetailRow = {
  id: string;
  date: string | null;
  particular: string | null;
  quanitity: number | null;
  amount: number | null;
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
  total_amount: number | null;
  grand_total: number | null;
};

const INVENTORY_COLUMN_TO_DB_FIELDS: Record<string, string[]> = {
  date: ["date"],
  particular: ["particular"],
  quanitity: ["quanitity"],
  amount: ["amount"],
  remarks: ["remarks"],
  firearms_name: ["firearms_name", "firearms_qty", "firearms_price"],
  communications_name: ["communications_name", "communications_qty", "communications_price"],
  furniture_name: ["furniture_name", "furniture_qty", "furniture_price"],
  office_name: ["office_name", "office_qty", "office_price"],
  sec_name: ["sec_name", "sec_qty", "sec_price"],
  vehicle_name: ["vehicle_name", "vehicle_qty", "vehicle_price"],
  total_amount: ["total_amount"],
  grand_total: ["grand_total"],
};

function money(value: number | null | undefined) {
  const n = Number(value ?? 0) || 0;
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function InventoryDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const {
    allowedColumns,
    restricted,
    loading: loadingPermissions,
    error: permissionError,
  } = useMyColumnAccess("inventory");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [row, setRow] = useState<InventoryDetailRow | null>(null);

  const canViewColumn = useCallback(
    (columnKey: string) => !restricted || allowedColumns.has(columnKey),
    [restricted, allowedColumns]
  );

  useEffect(() => {
    const run = async () => {
      if (loadingPermissions) return;
      setLoading(true);
      setError(permissionError || "");

      try {
        const selectFields = new Set<string>(["id"]);
        for (const [columnKey, dbFields] of Object.entries(INVENTORY_COLUMN_TO_DB_FIELDS)) {
          if (!canViewColumn(columnKey)) continue;
          for (const field of dbFields) selectFields.add(field);
        }

        const res = await supabase
          .from("inventory_fixed_asset")
          .select(Array.from(selectFields).join(", "))
          .eq("id", id)
          .maybeSingle();

        if (res.error) throw res.error;
        setRow((res.data as InventoryDetailRow) ?? null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load inventory details");
        setRow(null);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [id, loadingPermissions, permissionError, canViewColumn]);

  const fieldCards = useMemo(() => {
    if (!row) return [] as Array<[string, string]>;

    const cards: Array<[string, string]> = [];
    if (canViewColumn("date")) cards.push(["Date", row.date || "—"]);
    if (canViewColumn("particular")) cards.push(["Particular", row.particular || "—"]);
    if (canViewColumn("quanitity")) cards.push(["Quantity", String(Number(row.quanitity ?? 0) || 0)]);
    if (canViewColumn("amount") || canViewColumn("total_amount")) cards.push(["Row Total", `₱ ${money(row.amount ?? row.total_amount)}`]);
    if (canViewColumn("grand_total")) cards.push(["Grand Total", `₱ ${money(row.grand_total)}`]);

    return cards;
  }, [row, canViewColumn]);

  const categoryCards = useMemo(() => {
    if (!row) return [] as Array<{ label: string; name: string; qty: number; price: number }>;

    const list: Array<{ key: string; label: string; name: string; qty: number; price: number }> = [
      { key: "firearms_name", label: "Firearms & Ammunitions", name: row.firearms_name || "—", qty: Number(row.firearms_qty ?? 0) || 0, price: Number(row.firearms_price ?? 0) || 0 },
      { key: "communications_name", label: "Communications Equipment", name: row.communications_name || "—", qty: Number(row.communications_qty ?? 0) || 0, price: Number(row.communications_price ?? 0) || 0 },
      { key: "furniture_name", label: "Furniture & Fixtures", name: row.furniture_name || "—", qty: Number(row.furniture_qty ?? 0) || 0, price: Number(row.furniture_price ?? 0) || 0 },
      { key: "office_name", label: "Office Equipment", name: row.office_name || "—", qty: Number(row.office_qty ?? 0) || 0, price: Number(row.office_price ?? 0) || 0 },
      { key: "sec_name", label: "Sec Equipment", name: row.sec_name || "—", qty: Number(row.sec_qty ?? 0) || 0, price: Number(row.sec_price ?? 0) || 0 },
      { key: "vehicle_name", label: "Vehicle & Motorcycle", name: row.vehicle_name || "—", qty: Number(row.vehicle_qty ?? 0) || 0, price: Number(row.vehicle_price ?? 0) || 0 },
    ];

    return list.filter((item) => canViewColumn(item.key));
  }, [row, canViewColumn]);

  if (loading || loadingPermissions) {
    return (
      <section className="bg-white rounded-3xl border p-6 max-w-3xl">
        <LoadingCircle label="Loading inventory details..." />
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-white rounded-3xl border p-6 max-w-3xl space-y-4">
        <div className="text-red-600 font-semibold">{error}</div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-100"
        >
          Back
        </button>
      </section>
    );
  }

  if (!row) {
    return (
      <section className="bg-white rounded-3xl border p-6 max-w-3xl space-y-4">
        <div className="text-sm text-gray-600">Inventory item not found.</div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-100"
        >
          Back
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-3xl border p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-lg font-semibold">Inventory Details</div>
          <div className="text-sm text-gray-500">Item ID: {id}</div>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-100"
        >
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fieldCards.map(([label, value]) => (
          <div
            key={label}
            className="border rounded-2xl p-4 bg-gray-50 space-y-1"
          >
            <div className="text-xs text-gray-500">{label}</div>
            <div className="font-medium text-gray-900">{value}</div>
          </div>
        ))}

        {categoryCards.map((item) => (
          <div
            key={item.label}
            className="border rounded-2xl p-4 bg-gray-50 space-y-1"
          >
            <div className="text-xs text-gray-500">{item.label}</div>
            <div className="font-medium text-gray-900">{item.name}</div>
            <div className="text-xs text-gray-600">Qty: {item.qty.toLocaleString()}</div>
            <div className="text-xs text-gray-600">Price: ₱ {money(item.price)}</div>
          </div>
        ))}

        {canViewColumn("remarks") ? (
          <div className="sm:col-span-2 border rounded-2xl p-4 bg-gray-50">
            <div className="text-xs text-gray-500">Remarks</div>
            <div className="font-medium text-gray-900">{row.remarks || "—"}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
