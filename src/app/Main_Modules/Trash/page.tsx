"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../Client/SupabaseClients";
import { RotateCcw, Trash2, Skull } from "lucide-react";
import { useAuthRole } from "../../Client/useRbac";

type Applicant = {
  applicant_id: string;
  created_at: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  extn_name: string | null;
  client_position: string | null;
  detachment: string | null;
  status: string | null;
  profile_image_path: string | null;
  is_trashed: boolean;
  trashed_at: string | null;
};

const BUCKETS = {
  profile: "Profile_Images",
};

function getFullName(a: Applicant) {
  const parts = [a.first_name, a.middle_name, a.last_name, a.extn_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "(No name)";
}

function getProfileUrl(profilePath: string | null) {
  if (!profilePath) return null;
  const { data } = supabase.storage.from(BUCKETS.profile).getPublicUrl(profilePath);
  return data.publicUrl || null;
}

function normalizeStatus(input: string | null) {
  const v = (input ?? "").trim().toUpperCase();
  if (!v) return "ACTIVE";
  if (v === "ACTIVE" || v === "INACTIVE") return v;
  return "ACTIVE";
}

export default function TrashPage() {
  const { role } = useAuthRole();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [items, setItems] = useState<Applicant[]>([]);
  const [search, setSearch] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"restore" | "delete">("restore");
  const [target, setTarget] = useState<Applicant | null>(null);

  async function load() {
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("applicants")
      .select(
        "applicant_id, created_at, first_name, middle_name, last_name, extn_name, client_position, detachment, status, profile_image_path, is_trashed, trashed_at"
      )
      .eq("is_trashed", true)
      .order("trashed_at", { ascending: false })
      .limit(200);

    if (fetchError) {
      console.error(fetchError);
      setError(fetchError.message || "Failed to load Trash");
      setItems([]);
    } else {
      setItems((data as Applicant[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("realtime:applicants-trash")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applicants" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) => {
      const name = getFullName(e).toLowerCase();
      return (
        name.includes(q) ||
        (e.client_position || "").toLowerCase().includes(q) ||
        (e.detachment || "").toLowerCase().includes(q) ||
        (e.status || "").toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  function openRestore(e: Applicant) {
    setTarget(e);
    setConfirmMode("restore");
    setConfirmOpen(true);
  }

  function openDelete(e: Applicant) {
    setTarget(e);
    setConfirmMode("delete");
    setConfirmOpen(true);
  }

  async function confirm() {
    if (!target) return;
    setError("");

    if (confirmMode === "restore") {
		const normalizedStatus = normalizeStatus(target.status);
      const { error: updateErr } = await supabase
        .from("applicants")
        .update({ is_trashed: false, trashed_at: null, trashed_by: null, status: normalizedStatus })
        .eq("applicant_id", target.applicant_id);

      if (updateErr) {
        console.error(updateErr);
        setError(updateErr.message || "Failed to restore");
        return;
      }

      setItems((prev) => prev.filter((x) => x.applicant_id !== target.applicant_id));
      setConfirmOpen(false);
      setTarget(null);
      return;
    }

    // Permanent delete (superadmin only)
    if (role !== "superadmin") {
      setError("Only Superadmin can permanently delete.");
      return;
    }

    const { error: deleteErr } = await supabase
      .from("applicants")
      .delete()
      .eq("applicant_id", target.applicant_id);

    if (deleteErr) {
      console.error(deleteErr);
      setError(deleteErr.message || "Failed to permanently delete");
      return;
    }

    setItems((prev) => prev.filter((x) => x.applicant_id !== target.applicant_id));
    setConfirmOpen(false);
    setTarget(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 text-black">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trashed employees"
            className="bg-white border rounded-full px-4 py-2 shadow-sm w-full md:w-[360px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Link href="/Main_Modules/Employees/" className="px-4 py-2 rounded-xl bg-white rounded-full bg-[#FFDA03] border text-black">
            Back to Employees
          </Link>
        </div>
      </div>

      {error ? <div className="text-red-600 text-sm">{error}</div> : null}

      {loading ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">Loading trash...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">Trash is empty.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((e) => {
            const name = getFullName(e);
            const profileUrl = getProfileUrl(e.profile_image_path);
            return (
              <div key={e.applicant_id} className="bg-white rounded-3xl border shadow-sm p-6">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
                    {profileUrl ? (
                      <img src={profileUrl} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-xs text-gray-500">No Photo</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">{name}</div>
                    <div className="text-xs text-gray-500 truncate">{e.client_position ?? "—"}</div>
                    <div className="text-xs text-gray-500 truncate">{e.detachment ?? "—"}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      Trashed: {e.trashed_at ? new Date(e.trashed_at).toLocaleString() : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    onClick={() => openRestore(e)}
                    className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-2"
                    title="Restore"
                  >
                    <RotateCcw className="w-4 h-4" /> Restore
                  </button>

                  <button
                    onClick={() => openDelete(e)}
                    className={`h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border ${
                      role === "superadmin" ? "bg-white text-red-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                    title="Permanent delete"
                    disabled={role !== "superadmin"}
                  >
                    <Skull className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="text-lg font-bold text-black">
              {confirmMode === "restore" ? "Restore employee?" : "Permanently delete employee?"}
            </div>
            <div className="mt-2 text-sm text-gray-600">
              {confirmMode === "restore"
                ? "This will move the employee back to Employees."
                : "This cannot be undone."}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setTarget(null);
                }}
                className="px-4 py-2 rounded-xl bg-white border"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                className={`px-4 py-2 rounded-xl font-semibold inline-flex items-center gap-2 ${
                  confirmMode === "restore" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                }`}
              >
                <Trash2 className="w-4 h-4" /> Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
