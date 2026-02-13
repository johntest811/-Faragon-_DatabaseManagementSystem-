"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, LayoutGrid, Table } from "lucide-react";
import { supabase } from "@/app/Client/SupabaseClients";
import { useAuthRole } from "@/app/Client/useRbac";

type RequestRow = {
  deployment_id: string;
  created_at: string;
  full_name: string;
  position: string;
  detachment: string;
  status: string;
  shift: string;
  start_date: string;
  expected_end_date: string;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    INACTIVE: "bg-gray-100 text-gray-600",
    PENDING: "bg-yellow-100 text-yellow-700",
    REASSIGN: "bg-orange-100 text-orange-700",
  };

  return (
    <span
      className={`px-3 py-1 text-xs rounded-full font-medium ${
        styles[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

function parseRequestDateMs(value: string) {
  const d = new Date(String(value || ""));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export default function LogisticsRequestsPage() {
  const { role } = useAuthRole();
  const isAdmin = role === "admin" || role === "superadmin";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [applicantOptions, setApplicantOptions] = useState<Array<{ applicant_id: string; full_name: string }>>([]);

  const [formApplicantId, setFormApplicantId] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formDetachment, setFormDetachment] = useState("");
  const [formShift, setFormShift] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formExpectedEndDate, setFormExpectedEndDate] = useState("");
  const [formStatus, setFormStatus] = useState("ACTIVE");
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "expiring">("newest");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("logistics:requests:viewMode");
      if (saved === "table" || saved === "grid") setViewMode(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("logistics:requests:viewMode", viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      setLoading(true);
      setError("");

      const res = await supabase
        .from("deployment_status")
        .select("deployment_id, applicant_id, detachment, client_position, shift, start_date, expected_end_date, deployment_status, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (cancelled) return;
      if (res.error) {
        setRows([]);
        setError(res.error.message || "Failed to load requests");
        setLoading(false);
        return;
      }

      const baseRows = (res.data as Array<Record<string, unknown>>) ?? [];
      const ids = Array.from(new Set(baseRows.map((r) => String(r.applicant_id ?? "").trim()).filter(Boolean)));
      const nameMap = new Map<string, string>();

      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const aRes = await supabase
          .from("applicants")
          .select("applicant_id, first_name, middle_name, last_name")
          .in("applicant_id", chunk);
        if (aRes.error) continue;
        for (const a of ((aRes.data as Array<Record<string, unknown>>) ?? [])) {
          const id = String(a.applicant_id ?? "").trim();
          if (!id) continue;
          const full = [a.first_name, a.middle_name, a.last_name]
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
            .join(" ");
          nameMap.set(id, full || "(No name)");
        }
      }

      const mapped: RequestRow[] = baseRows.map((r) => {
        const applicantId = String(r.applicant_id ?? "").trim();
        return {
          deployment_id: String(r.deployment_id ?? ""),
          created_at: String(r.created_at ?? "").trim(),
          full_name: nameMap.get(applicantId) ?? "(No name)",
          position: String(r.client_position ?? "").trim(),
          detachment: String(r.detachment ?? "").trim(),
          status: String(r.deployment_status ?? "").trim().toUpperCase() || "ACTIVE",
          shift: String(r.shift ?? "").trim(),
          start_date: String(r.start_date ?? "").trim(),
          expected_end_date: String(r.expected_end_date ?? "").trim(),
        };
      });

      setRows(mapped);
      setLoading(false);
    }

    async function loadApplicantOptions() {
      const aRes = await supabase
        .from("applicants")
        .select("applicant_id, first_name, middle_name, last_name")
        .eq("is_trashed", false)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (aRes.error || cancelled) return;
      const opts = ((aRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        applicant_id: String(r.applicant_id ?? ""),
        full_name:
          [r.first_name, r.middle_name, r.last_name]
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
            .join(" ") || "(No name)",
      }));
      setApplicantOptions(opts);
    }

    loadRequests();
    loadApplicantOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadRequests() {
    const res = await supabase
      .from("deployment_status")
      .select("deployment_id, applicant_id, detachment, client_position, shift, start_date, expected_end_date, deployment_status, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (res.error) {
      setError(res.error.message || "Failed to reload requests");
      return;
    }

    const baseRows = (res.data as Array<Record<string, unknown>>) ?? [];
    const ids = Array.from(new Set(baseRows.map((r) => String(r.applicant_id ?? "").trim()).filter(Boolean)));
    const nameMap = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const aRes = await supabase
        .from("applicants")
        .select("applicant_id, first_name, middle_name, last_name")
        .in("applicant_id", chunk);
      if (aRes.error) continue;
      for (const a of ((aRes.data as Array<Record<string, unknown>>) ?? [])) {
        const id = String(a.applicant_id ?? "").trim();
        const full = [a.first_name, a.middle_name, a.last_name]
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .join(" ");
        nameMap.set(id, full || "(No name)");
      }
    }

    const mapped: RequestRow[] = baseRows.map((r) => {
      const applicantId = String(r.applicant_id ?? "").trim();
      return {
        deployment_id: String(r.deployment_id ?? ""),
        created_at: String(r.created_at ?? "").trim(),
        full_name: nameMap.get(applicantId) ?? "(No name)",
        position: String(r.client_position ?? "").trim(),
        detachment: String(r.detachment ?? "").trim(),
        status: String(r.deployment_status ?? "").trim().toUpperCase() || "ACTIVE",
        shift: String(r.shift ?? "").trim(),
        start_date: String(r.start_date ?? "").trim(),
        expected_end_date: String(r.expected_end_date ?? "").trim(),
      };
    });
    setRows(mapped);
  }

  async function addRequestRow() {
    if (!isAdmin) return;
    setError("");
    setSuccess("");

    if (!formApplicantId) {
      setError("Please select an applicant.");
      return;
    }

    setSaving(true);
    const res = await supabase.from("deployment_status").insert({
      applicant_id: formApplicantId,
      detachment: formDetachment.trim() || null,
      client_position: formPosition.trim() || null,
      shift: formShift.trim() || null,
      start_date: formStartDate || null,
      expected_end_date: formExpectedEndDate || null,
      deployment_status: formStatus.trim().toUpperCase() || "ACTIVE",
    });
    setSaving(false);

    if (res.error) {
      setError(res.error.message || "Failed to add deployment request");
      return;
    }

    setSuccess("Deployment request added.");
    setFormApplicantId("");
    setFormPosition("");
    setFormDetachment("");
    setFormShift("");
    setFormStartDate("");
    setFormExpectedEndDate("");
    setFormStatus("ACTIVE");
    setShowAddModal(false);
    await reloadRequests();
  }

  const filtered = useMemo(() => rows.filter((row) => {
    const matchesSearch =
      row.position.toLowerCase().includes(search.toLowerCase()) ||
      row.full_name.toLowerCase().includes(search.toLowerCase()) ||
      row.deployment_id.toLowerCase().includes(search.toLowerCase()) ||
      row.detachment.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || row.status === statusFilter;

    return matchesSearch && matchesStatus;
  }), [rows, search, statusFilter]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortBy === "name") {
      return a.full_name.localeCompare(b.full_name);
    }
    if (sortBy === "newest") {
      return parseRequestDateMs(b.created_at) - parseRequestDateMs(a.created_at);
    }

    const rank = (s: string) =>
      s === "ACTIVE" ? 0 : s === "PENDING" ? 1 : s === "REASSIGN" ? 2 : 3;
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return parseRequestDateMs(b.created_at) - parseRequestDateMs(a.created_at);
  }), [filtered, sortBy]);

  return (
    <div className="rounded-3xl bg-white border p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="text-lg font-semibold text-gray-900">
          Logistics • Requests
        </div>
        <div className="text-sm text-gray-500">
          Connected to deployment_status.
        </div>
      </div>

      {isAdmin ? (
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
          >
            Insert Information
          </button>
        </div>
      ) : null}

      {isAdmin && showAddModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white border p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-black">Add Deployment Request</div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg border text-sm text-black"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select value={formApplicantId} onChange={(e) => setFormApplicantId(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-black bg-white md:col-span-2">
                <option value="">Select applicant</option>
                {applicantOptions.map((a) => (
                  <option key={a.applicant_id} value={a.applicant_id}>{a.full_name}</option>
                ))}
              </select>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-black bg-white">
                <option value="ACTIVE">ACTIVE</option>
                <option value="PENDING">PENDING</option>
                <option value="REASSIGN">REASSIGN</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
              <input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} placeholder="Position" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input value={formDetachment} onChange={(e) => setFormDetachment(e.target.value)} placeholder="Detachment" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input value={formShift} onChange={(e) => setFormShift(e.target.value)} placeholder="Shift" className="w-full rounded-xl border px-3 py-2 text-black" />
              <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-black" />
              <input type="date" value={formExpectedEndDate} onChange={(e) => setFormExpectedEndDate(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-black" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl border text-black font-medium">Cancel</button>
              <button onClick={() => void addRequestRow()} disabled={saving} className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${saving ? "opacity-60" : ""}`}>
                {saving ? "Saving..." : "Add Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600 mb-3">{error}</div> : null}
      {success ? <div className="text-sm text-green-700 mb-3">{success}</div> : null}

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment, name or Job ID..."
            className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500">Sort By:</div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2 rounded-full bg-black text-white font-medium border border-black"
          >
            <option value="name">Name</option>
            <option value="newest">Newest Date</option>
            <option value="expiring">Expiring Licenses</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
              viewMode === "grid" ? "bg-[#FFDA03]" : "bg-white"
            }`}
            aria-label="Grid view"
            type="button"
          >
            <LayoutGrid className="w-5 h-5 text-black" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
              viewMode === "table" ? "bg-[#FFDA03]" : "bg-white"
            }`}
            aria-label="Table view"
            type="button"
          >
            <Table className="w-5 h-5 text-black" />
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm text-black"
        >
          <option value="All">All Status</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="PENDING">PENDING</option>
          <option value="REASSIGN">REASSIGN</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((row, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-black truncate">{row.position || "(No position)"}</div>
                  <div className="text-xs text-gray-500 truncate">{row.detachment || "No detachment"} • {row.shift || "No shift"}</div>
                  <div className="mt-2 text-xs text-gray-500">{row.created_at ? row.created_at.slice(0, 19) : "—"}</div>
                </div>
                <StatusBadge status={row.status} />
              </div>

              <div className="mt-4 text-sm text-black">
                <div className="font-medium">{row.full_name}</div>
                <div className="text-xs text-gray-500">Deployment ID: {row.deployment_id.slice(0, 8)}</div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 text-xs text-gray-600">
                <span>Start: {row.start_date || "—"}</span>
                <span>End: {row.expected_end_date || "—"}</span>
              </div>
            </div>
          ))}

          {sorted.length === 0 && (
            <div className="col-span-full py-10 text-center text-gray-400">No matching requests found</div>
          )}
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm text-black border-separate border-spacing-y-2">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#FFDA03]">
                <th className="px-4 py-3 text-left font-semibold text-black first:rounded-l-xl">Timestamp & Date</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Deployment ID</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Position</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Detachment</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Shift</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-black">Start</th>
                <th className="px-4 py-3 text-left font-semibold text-black last:rounded-r-xl">Expected End</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} className="bg-white shadow-sm hover:shadow-md transition">
                  <td className="px-4 py-3 rounded-l-xl">{row.created_at ? row.created_at.slice(0, 19) : "—"}</td>
                  <td className="px-4 py-3">{row.deployment_id.slice(0, 8)}</td>
                  <td className="px-4 py-3">{row.full_name}</td>
                  <td className="px-4 py-3 font-medium">{row.position || "—"}</td>
                  <td className="px-4 py-3">{row.detachment}</td>
                  <td className="px-4 py-3">{row.shift || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">{row.start_date || "—"}</td>
                  <td className="px-4 py-3 rounded-r-xl">{row.expected_end_date || "—"}</td>
                </tr>
              ))}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-gray-400">
                    No matching requests found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
