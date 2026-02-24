"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";

type PlainRow = Record<string, unknown>;

type ClientRow = {
  contract_id: string;
  contract_no: string | null;
  applicant_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  restock_count: number;
  paraphernalia_count: number;
  paraphernalia_inventory_count: number;
  resigned_count: number;
};

type ApplicantOption = {
  applicant_id: string;
  full_name: string;
};

type ContractOption = {
  contract_id: string;
  contract_no: string | null;
};

type ParaphernaliaOption = {
  id_paraphernalia: string;
  label: string;
};

type InventoryOption = {
  id_paraphernalia_inventory: string;
  contract_id: string | null;
};

type SaveState = {
  type: "" | "success" | "error";
  message: string;
};

const inputClass = "w-full rounded-xl border px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-[#FFDA03]";

function ModalShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl bg-white rounded-3xl border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-black">{title}</div>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-black text-sm">
            Close
          </button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

function toNullableText(value: string) {
  const clean = value.trim();
  return clean.length ? clean : null;
}

function toNullableNumber(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [applicants, setApplicants] = useState<ApplicantOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [paraphernaliaItems, setParaphernaliaItems] = useState<ParaphernaliaOption[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryOption[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ type: "", message: "" });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [contractForm, setContractForm] = useState({
    applicant_id: "",
    contract_no: "",
    start_date: "",
    end_date: "",
    status: "ACTIVE",
  });

  const [paraphernaliaForm, setParaphernaliaForm] = useState({
    names: "",
    items: "",
    quantity: "",
    price: "",
    date: "",
  });

  const [inventoryForm, setInventoryForm] = useState({
    items: "",
    stock_balance: "",
    stock_in: "",
    stock_out: "",
    id_paraphernalia: "",
    contract_id: "",
  });

  const [restockForm, setRestockForm] = useState({
    date: "",
    status: "",
    item: "",
    quanitity: "",
    id_paraphernalia: "",
    id_paraphernalia_inventory: "",
    contract_id: "",
  });

  const [resignedForm, setResignedForm] = useState({
    last_name: "",
    first_name: "",
    middle_name: "",
    date_resigned: "",
    detachment: "",
    remarks: "",
    last_duty: "",
    applicant_id: "",
    contract_id: "",
    id_paraphernalia_inventory: "",
  });

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [paraphernaliaModalOpen, setParaphernaliaModalOpen] = useState(false);
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [restockModalOpen, setRestockModalOpen] = useState(false);
  const [resignedModalOpen, setResignedModalOpen] = useState(false);

  const pageSize = 10;

  async function loadConnectedData() {
    setLoading(true);
    setError("");

    const [contractsRes, applicantsRes, restockRes, paraphernaliaRes, inventoryRes, resignedRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("contract_id, applicant_id, contract_no, start_date, end_date, status")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("applicants").select("applicant_id, first_name, middle_name, last_name").limit(5000),
      supabase.from("restock").select("id_restock, contract_id").limit(5000),
      supabase.from("paraphernalia").select("id_paraphernalia, names, items").limit(5000),
      supabase.from("paraphernalia_inventory").select("id_paraphernalia_inventory, contract_id").limit(5000),
      supabase.from("resigned").select("resigned_id, contract_id").limit(5000),
    ]);

    if (contractsRes.error) {
      setLoading(false);
      setError(contractsRes.error.message || "Failed to load contracts");
      setRows([]);
      return;
    }

    const applicantRows = (applicantsRes.data ?? []) as PlainRow[];
    const applicantsById = new Map<string, string>();
    const applicantOptions: ApplicantOption[] = [];
    for (const applicant of applicantRows) {
      const fullName = [applicant.first_name, applicant.middle_name, applicant.last_name]
        .filter(Boolean)
        .map((value) => String(value))
        .join(" ")
        .trim();
      const applicantId = String(applicant.applicant_id ?? "").trim();
      if (!applicantId) continue;
      applicantsById.set(applicantId, fullName || "Unknown Applicant");
      applicantOptions.push({ applicant_id: applicantId, full_name: fullName || "Unknown Applicant" });
    }
    setApplicants(applicantOptions);

    const contractRows = (contractsRes.data ?? []) as PlainRow[];
    const contractOptions: ContractOption[] = contractRows.map((contract) => ({
      contract_id: String(contract.contract_id ?? ""),
      contract_no: contract.contract_no ? String(contract.contract_no) : null,
    }));
    setContracts(contractOptions.filter((contract) => contract.contract_id));

    const paraphernaliaRows = (paraphernaliaRes.data ?? []) as PlainRow[];
    setParaphernaliaItems(
      paraphernaliaRows
        .map((item) => {
          const id = String(item.id_paraphernalia ?? "").trim();
          const label = [item.names, item.items].filter(Boolean).map((value) => String(value)).join(" - ");
          return { id_paraphernalia: id, label: label || id };
        })
        .filter((item) => item.id_paraphernalia)
    );

    const inventoryRows = (inventoryRes.data ?? []) as PlainRow[];
    setInventoryItems(
      inventoryRows
        .map((inventory) => {
          const inventoryId = String(inventory.id_paraphernalia_inventory ?? "").trim();
          const contractId = inventory.contract_id ? String(inventory.contract_id) : null;
          return { id_paraphernalia_inventory: inventoryId, contract_id: contractId };
        })
        .filter((inventory) => inventory.id_paraphernalia_inventory)
    );

    const restockByContract = new Map<string, number>();
    for (const row of (restockRes.data ?? []) as PlainRow[]) {
      const key = String(row.contract_id || "").trim();
      if (!key) continue;
      restockByContract.set(key, (restockByContract.get(key) || 0) + 1);
    }

    const inventoryByContract = new Map<string, number>();
    for (const row of inventoryRows) {
      const key = String(row.contract_id || "").trim();
      if (!key) continue;
      inventoryByContract.set(key, (inventoryByContract.get(key) || 0) + 1);
    }

    const resignedByContract = new Map<string, number>();
    for (const row of (resignedRes.data ?? []) as PlainRow[]) {
      const key = String(row.contract_id || "").trim();
      if (!key) continue;
      resignedByContract.set(key, (resignedByContract.get(key) || 0) + 1);
    }

    const paraphernaliaCount = paraphernaliaRows.length;

    const merged: ClientRow[] = contractRows.map((contract) => {
      const contractId = String(contract.contract_id);
      return {
        contract_id: contractId,
        contract_no: contract.contract_no ? String(contract.contract_no) : null,
        applicant_name: applicantsById.get(String(contract.applicant_id || "")) || "Unknown Applicant",
        start_date: contract.start_date ? String(contract.start_date) : null,
        end_date: contract.end_date ? String(contract.end_date) : null,
        status: contract.status ? String(contract.status) : null,
        restock_count: restockByContract.get(contractId) || 0,
        paraphernalia_count: paraphernaliaCount,
        paraphernalia_inventory_count: inventoryByContract.get(contractId) || 0,
        resigned_count: resignedByContract.get(contractId) || 0,
      };
    });

    setRows(merged);
    setLoading(false);
  }

  async function submitContract(e: FormEvent) {
    e.preventDefault();
    if (!contractForm.applicant_id) {
      setSaveState({ type: "error", message: "Contracts requires Applicant." });
      return;
    }

    setSavingKey("contract");
    setSaveState({ type: "", message: "" });
    const { error: insertError } = await supabase.from("contracts").insert([
      {
        applicant_id: toNullableText(contractForm.applicant_id),
        contract_no: toNullableText(contractForm.contract_no),
        start_date: toNullableText(contractForm.start_date),
        end_date: toNullableText(contractForm.end_date),
        status: toNullableText(contractForm.status) || "ACTIVE",
      },
    ]);
    if (insertError) {
      setSaveState({ type: "error", message: `Contracts insert failed: ${insertError.message}` });
      setSavingKey(null);
      return;
    }

    setContractForm({ applicant_id: "", contract_no: "", start_date: "", end_date: "", status: "ACTIVE" });
    setSaveState({ type: "success", message: "Contracts row saved." });
    await loadConnectedData();
    setSavingKey(null);
  }

  async function submitParaphernalia(e: FormEvent) {
    e.preventDefault();
    setSavingKey("paraphernalia");
    setSaveState({ type: "", message: "" });
    const { error: insertError } = await supabase.from("paraphernalia").insert([
      {
        id_paraphernalia: crypto.randomUUID(),
        names: toNullableText(paraphernaliaForm.names),
        items: toNullableText(paraphernaliaForm.items),
        quantity: toNullableNumber(paraphernaliaForm.quantity),
        price: toNullableNumber(paraphernaliaForm.price),
        date: toNullableText(paraphernaliaForm.date),
      },
    ]);

    if (insertError) {
      setSaveState({ type: "error", message: `Paraphernalia insert failed: ${insertError.message}` });
      setSavingKey(null);
      return;
    }

    setParaphernaliaForm({ names: "", items: "", quantity: "", price: "", date: "" });
    setSaveState({ type: "success", message: "Paraphernalia row saved." });
    await loadConnectedData();
    setSavingKey(null);
  }

  async function submitParaphernaliaInventory(e: FormEvent) {
    e.preventDefault();
    setSavingKey("inventory");
    setSaveState({ type: "", message: "" });
    const { error: insertError } = await supabase.from("paraphernalia_inventory").insert([
      {
        id_paraphernalia_inventory: crypto.randomUUID(),
        items: toNullableText(inventoryForm.items),
        stock_balance: toNullableNumber(inventoryForm.stock_balance),
        stock_in: toNullableNumber(inventoryForm.stock_in),
        stock_out: toNullableNumber(inventoryForm.stock_out),
        id_paraphernalia: toNullableText(inventoryForm.id_paraphernalia),
        contract_id: toNullableText(inventoryForm.contract_id),
      },
    ]);

    if (insertError) {
      setSaveState({ type: "error", message: `Paraphernalia_Inventory insert failed: ${insertError.message}` });
      setSavingKey(null);
      return;
    }

    setInventoryForm({
      items: "",
      stock_balance: "",
      stock_in: "",
      stock_out: "",
      id_paraphernalia: "",
      contract_id: "",
    });
    setSaveState({ type: "success", message: "Paraphernalia_Inventory row saved." });
    await loadConnectedData();
    setSavingKey(null);
  }

  async function submitRestock(e: FormEvent) {
    e.preventDefault();
    setSavingKey("restock");
    setSaveState({ type: "", message: "" });
    const { error: insertError } = await supabase.from("restock").insert([
      {
        id_restock: crypto.randomUUID(),
        date: toNullableText(restockForm.date),
        status: toNullableText(restockForm.status),
        item: toNullableText(restockForm.item),
        quanitity: toNullableText(restockForm.quanitity),
        id_paraphernalia: toNullableText(restockForm.id_paraphernalia),
        id_paraphernalia_inventory: toNullableText(restockForm.id_paraphernalia_inventory),
        contract_id: toNullableText(restockForm.contract_id),
      },
    ]);

    if (insertError) {
      setSaveState({ type: "error", message: `Restock insert failed: ${insertError.message}` });
      setSavingKey(null);
      return;
    }

    setRestockForm({
      date: "",
      status: "",
      item: "",
      quanitity: "",
      id_paraphernalia: "",
      id_paraphernalia_inventory: "",
      contract_id: "",
    });
    setSaveState({ type: "success", message: "Restock row saved." });
    await loadConnectedData();
    setSavingKey(null);
  }

  async function submitResigned(e: FormEvent) {
    e.preventDefault();
    setSavingKey("resigned");
    setSaveState({ type: "", message: "" });
    const { error: insertError } = await supabase.from("resigned").insert([
      {
        resigned_id: crypto.randomUUID(),
        last_name: toNullableText(resignedForm.last_name),
        first_name: toNullableText(resignedForm.first_name),
        middle_name: toNullableText(resignedForm.middle_name),
        date_resigned: toNullableText(resignedForm.date_resigned),
        detachment: toNullableText(resignedForm.detachment),
        remarks: toNullableText(resignedForm.remarks),
        last_duty: toNullableText(resignedForm.last_duty),
        applicant_id: toNullableText(resignedForm.applicant_id),
        contract_id: toNullableText(resignedForm.contract_id),
        id_paraphernalia_inventory: toNullableText(resignedForm.id_paraphernalia_inventory),
      },
    ]);

    if (insertError) {
      setSaveState({ type: "error", message: `Resigned insert failed: ${insertError.message}` });
      setSavingKey(null);
      return;
    }

    setResignedForm({
      last_name: "",
      first_name: "",
      middle_name: "",
      date_resigned: "",
      detachment: "",
      remarks: "",
      last_duty: "",
      applicant_id: "",
      contract_id: "",
      id_paraphernalia_inventory: "",
    });
    setSaveState({ type: "success", message: "Resigned row saved." });
    await loadConnectedData();
    setSavingKey(null);
  }

  useEffect(() => {
    loadConnectedData();
    const channel = supabase
      .channel("realtime:client-connected-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "restock" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "paraphernalia_inventory" }, loadConnectedData)
      .on("postgres_changes", { event: "*", schema: "public", table: "resigned" }, loadConnectedData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  return (
    <section className="bg-white rounded-3xl border p-6 space-y-5">
      <div>
        <div className="text-lg font-semibold text-black">Logistics • Client Connections</div>
        <div className="text-sm text-gray-500 mt-1">
          Connected to Contracts, Restock, Paraphernalia, Paraphernalia_Inventory, and Resigned tables.
        </div>
      </div>

      {saveState.message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            saveState.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {saveState.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold text-black">Create Contracts</div>
          <button
            type="button"
            onClick={() => setContractModalOpen(true)}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
          >
            Open Form
          </button>
        </div>

        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold text-black">Create Paraphernalia</div>
          <button
            type="button"
            onClick={() => setParaphernaliaModalOpen(true)}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
          >
            Open Form
          </button>
        </div>

        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold text-black">Create Paraphernalia_Inventory</div>
          <button
            type="button"
            onClick={() => setInventoryModalOpen(true)}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
          >
            Open Form
          </button>
        </div>

        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold text-black">Create Restock</div>
          <button
            type="button"
            onClick={() => setRestockModalOpen(true)}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
          >
            Open Form
          </button>
        </div>

        <div className="rounded-2xl border p-4 space-y-3 xl:col-span-2">
          <div className="font-semibold text-black">Create Resigned</div>
          <button
            type="button"
            onClick={() => setResignedModalOpen(true)}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black"
          >
            Open Form
          </button>
        </div>
      </div>

      <ModalShell open={contractModalOpen} title="Create Contracts" onClose={() => setContractModalOpen(false)}>
        <form onSubmit={submitContract} className="space-y-3">
          <select
            className={inputClass}
            value={contractForm.applicant_id}
            onChange={(e) => setContractForm((prev) => ({ ...prev, applicant_id: e.target.value }))}
            required
          >
            <option value="">Select applicant</option>
            {applicants.map((applicant) => (
              <option key={applicant.applicant_id} value={applicant.applicant_id}>
                {applicant.full_name} ({applicant.applicant_id.slice(0, 8)})
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="contract_no"
            value={contractForm.contract_no}
            onChange={(e) => setContractForm((prev) => ({ ...prev, contract_no: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              className={inputClass}
              value={contractForm.start_date}
              onChange={(e) => setContractForm((prev) => ({ ...prev, start_date: e.target.value }))}
            />
            <input
              type="date"
              className={inputClass}
              value={contractForm.end_date}
              onChange={(e) => setContractForm((prev) => ({ ...prev, end_date: e.target.value }))}
            />
          </div>
          <input
            className={inputClass}
            placeholder="status (e.g. ACTIVE)"
            value={contractForm.status}
            onChange={(e) => setContractForm((prev) => ({ ...prev, status: e.target.value }))}
          />
          <button
            type="submit"
            disabled={savingKey === "contract"}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {savingKey === "contract" ? "Saving..." : "Save Contract"}
          </button>
        </form>
      </ModalShell>

      <ModalShell open={paraphernaliaModalOpen} title="Create Paraphernalia" onClose={() => setParaphernaliaModalOpen(false)}>
        <form onSubmit={submitParaphernalia} className="space-y-3">
          <input
            className={inputClass}
            placeholder="names"
            value={paraphernaliaForm.names}
            onChange={(e) => setParaphernaliaForm((prev) => ({ ...prev, names: e.target.value }))}
          />
          <input
            className={inputClass}
            placeholder="items"
            value={paraphernaliaForm.items}
            onChange={(e) => setParaphernaliaForm((prev) => ({ ...prev, items: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              placeholder="quantity"
              value={paraphernaliaForm.quantity}
              onChange={(e) => setParaphernaliaForm((prev) => ({ ...prev, quantity: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="price"
              value={paraphernaliaForm.price}
              onChange={(e) => setParaphernaliaForm((prev) => ({ ...prev, price: e.target.value }))}
            />
          </div>
          <input
            className={inputClass}
            placeholder="date (text column)"
            value={paraphernaliaForm.date}
            onChange={(e) => setParaphernaliaForm((prev) => ({ ...prev, date: e.target.value }))}
          />
          <button
            type="submit"
            disabled={savingKey === "paraphernalia"}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {savingKey === "paraphernalia" ? "Saving..." : "Save Paraphernalia"}
          </button>
        </form>
      </ModalShell>

      <ModalShell
        open={inventoryModalOpen}
        title="Create Paraphernalia_Inventory"
        onClose={() => setInventoryModalOpen(false)}
      >
        <form onSubmit={submitParaphernaliaInventory} className="space-y-3">
          <input
            className={inputClass}
            placeholder="items"
            value={inventoryForm.items}
            onChange={(e) => setInventoryForm((prev) => ({ ...prev, items: e.target.value }))}
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              className={inputClass}
              placeholder="stock_balance"
              value={inventoryForm.stock_balance}
              onChange={(e) => setInventoryForm((prev) => ({ ...prev, stock_balance: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="stock_in"
              value={inventoryForm.stock_in}
              onChange={(e) => setInventoryForm((prev) => ({ ...prev, stock_in: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="stock_out"
              value={inventoryForm.stock_out}
              onChange={(e) => setInventoryForm((prev) => ({ ...prev, stock_out: e.target.value }))}
            />
          </div>
          <select
            className={inputClass}
            value={inventoryForm.id_paraphernalia}
            onChange={(e) => setInventoryForm((prev) => ({ ...prev, id_paraphernalia: e.target.value }))}
          >
            <option value="">id_paraphernalia (optional)</option>
            {paraphernaliaItems.map((item) => (
              <option key={item.id_paraphernalia} value={item.id_paraphernalia}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={inventoryForm.contract_id}
            onChange={(e) => setInventoryForm((prev) => ({ ...prev, contract_id: e.target.value }))}
          >
            <option value="">contract_id (optional)</option>
            {contracts.map((contract) => (
              <option key={contract.contract_id} value={contract.contract_id}>
                {contract.contract_no || contract.contract_id}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={savingKey === "inventory"}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {savingKey === "inventory" ? "Saving..." : "Save Inventory"}
          </button>
        </form>
      </ModalShell>

      <ModalShell open={restockModalOpen} title="Create Restock" onClose={() => setRestockModalOpen(false)}>
        <form onSubmit={submitRestock} className="space-y-3">
          <input
            className={inputClass}
            placeholder="date (text column)"
            value={restockForm.date}
            onChange={(e) => setRestockForm((prev) => ({ ...prev, date: e.target.value }))}
          />
          <input
            className={inputClass}
            placeholder="status"
            value={restockForm.status}
            onChange={(e) => setRestockForm((prev) => ({ ...prev, status: e.target.value }))}
          />
          <input
            className={inputClass}
            placeholder="item"
            value={restockForm.item}
            onChange={(e) => setRestockForm((prev) => ({ ...prev, item: e.target.value }))}
          />
          <input
            className={inputClass}
            placeholder="quanitity"
            value={restockForm.quanitity}
            onChange={(e) => setRestockForm((prev) => ({ ...prev, quanitity: e.target.value }))}
          />
          <select
            className={inputClass}
            value={restockForm.id_paraphernalia}
            onChange={(e) => setRestockForm((prev) => ({ ...prev, id_paraphernalia: e.target.value }))}
          >
            <option value="">id_paraphernalia (optional)</option>
            {paraphernaliaItems.map((item) => (
              <option key={item.id_paraphernalia} value={item.id_paraphernalia}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={restockForm.id_paraphernalia_inventory}
            onChange={(e) => setRestockForm((prev) => ({ ...prev, id_paraphernalia_inventory: e.target.value }))}
          >
            <option value="">id_paraphernalia_inventory (optional)</option>
            {inventoryItems.map((item) => (
              <option key={item.id_paraphernalia_inventory} value={item.id_paraphernalia_inventory}>
                {item.id_paraphernalia_inventory.slice(0, 8)} {item.contract_id ? `- ${item.contract_id.slice(0, 8)}` : ""}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={restockForm.contract_id}
            onChange={(e) => setRestockForm((prev) => ({ ...prev, contract_id: e.target.value }))}
          >
            <option value="">contract_id (optional)</option>
            {contracts.map((contract) => (
              <option key={contract.contract_id} value={contract.contract_id}>
                {contract.contract_no || contract.contract_id}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={savingKey === "restock"}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {savingKey === "restock" ? "Saving..." : "Save Restock"}
          </button>
        </form>
      </ModalShell>

      <ModalShell open={resignedModalOpen} title="Create Resigned" onClose={() => setResignedModalOpen(false)}>
        <form onSubmit={submitResigned} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              className={inputClass}
              placeholder="last_name"
              value={resignedForm.last_name}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, last_name: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="first_name"
              value={resignedForm.first_name}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, first_name: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="middle_name"
              value={resignedForm.middle_name}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, middle_name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              className={inputClass}
              placeholder="date_resigned"
              value={resignedForm.date_resigned}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, date_resigned: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="detachment"
              value={resignedForm.detachment}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, detachment: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="last_duty"
              value={resignedForm.last_duty}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, last_duty: e.target.value }))}
            />
          </div>
          <textarea
            className={inputClass}
            placeholder="remarks"
            rows={3}
            value={resignedForm.remarks}
            onChange={(e) => setResignedForm((prev) => ({ ...prev, remarks: e.target.value }))}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              className={inputClass}
              value={resignedForm.applicant_id}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, applicant_id: e.target.value }))}
            >
              <option value="">applicant_id (optional)</option>
              {applicants.map((applicant) => (
                <option key={applicant.applicant_id} value={applicant.applicant_id}>
                  {applicant.full_name}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={resignedForm.contract_id}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, contract_id: e.target.value }))}
            >
              <option value="">contract_id (optional)</option>
              {contracts.map((contract) => (
                <option key={contract.contract_id} value={contract.contract_id}>
                  {contract.contract_no || contract.contract_id}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={resignedForm.id_paraphernalia_inventory}
              onChange={(e) => setResignedForm((prev) => ({ ...prev, id_paraphernalia_inventory: e.target.value }))}
            >
              <option value="">id_paraphernalia_inventory (optional)</option>
              {inventoryItems.map((item) => (
                <option key={item.id_paraphernalia_inventory} value={item.id_paraphernalia_inventory}>
                  {item.id_paraphernalia_inventory}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={savingKey === "resigned"}
            className="rounded-xl bg-[#FFDA03] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {savingKey === "resigned" ? "Saving..." : "Save Resigned"}
          </button>
        </form>
      </ModalShell>

      <div className="flex items-center gap-3 border rounded-2xl px-4 py-3 max-w-xl w-full">
        <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center">
          <Search className="w-5 h-5 text-black" />
        </div>
        <input
          placeholder="Search contract/applicant..."
          className="flex-1 outline-none text-sm text-black placeholder:text-gray-400"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error ? <div className="rounded-2xl border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="relative overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm text-black">
          <thead className="bg-gray-100 border-b">
            <tr>
              {["Contract No.", "Applicant", "Start", "End", "Status", "Restock", "Paraphernalia", "Paraphernalia Inventory", "Resigned"].map((label) => (
                <th key={label} className="px-4 py-3 text-left font-semibold text-black whitespace-nowrap">{label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading connected client records...</td>
              </tr>
            ) : paginated.length ? (
              paginated.map((row) => (
                <tr key={row.contract_id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{row.contract_no || "—"}</td>
                  <td className="px-4 py-3 font-medium">{row.applicant_name}</td>
                  <td className="px-4 py-3">{row.start_date || "—"}</td>
                  <td className="px-4 py-3">{row.end_date || "—"}</td>
                  <td className="px-4 py-3">{row.status || "UNKNOWN"}</td>
                  <td className="px-4 py-3 text-center">{row.restock_count}</td>
                  <td className="px-4 py-3 text-center">{row.paraphernalia_count}</td>
                  <td className="px-4 py-3 text-center">{row.paraphernalia_inventory_count}</td>
                  <td className="px-4 py-3 text-center">{row.resigned_count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No client records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
  );
}

