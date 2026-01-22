"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../Client/SupabaseClients";
import { Eye, RotateCcw } from "lucide-react";

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
  is_archived: boolean | null;
  archived_at: string | null;
};

const BUCKETS = {
  profile: "applicants",
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

export default function ArchivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [items, setItems] = useState<Applicant[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("applicants")
        .select(
          "applicant_id, created_at, first_name, middle_name, last_name, extn_name, client_position, detachment, status, profile_image_path, is_archived, archived_at"
        )
        .eq("is_archived", true)
        .eq("is_trashed", false)
        .order("archived_at", { ascending: false })
        .limit(200);

      if (fetchError) {
        console.error(fetchError);
        setError(fetchError.message || "Failed to load archive");
        setItems([]);
      } else {
        setItems((data as Applicant[]) || []);
      }
      setLoading(false);
    };

    run();

    const channel = supabase
      .channel("realtime:applicants-archive")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applicants" },
        () => run()
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

  async function restore(employee: Applicant) {
    setError("");
		const normalizedStatus = normalizeStatus(employee.status);
    const { error: updateError } = await supabase
      .from("applicants")
      .update({ is_archived: false, archived_at: null, archived_by: null, status: normalizedStatus })
      .eq("applicant_id", employee.applicant_id);

    if (updateError) {
      console.error(updateError);
      setError(updateError.message || "Failed to restore");
      return;
    }

    setItems((prev) => prev.filter((x) => x.applicant_id !== employee.applicant_id));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 text-black">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived employees"
            className="bg-white border rounded-full px-4 py-2 shadow-sm w-full md:w-[360px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Link href="/Main_Modules/Employees/" className="px-4 py-2 rounded-xl bg-white border">
            Back to Employees
          </Link>
        </div>
      </div>

      {error ? <div className="text-red-600 text-sm">{error}</div> : null}

      {loading ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">Loading archive...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-gray-500">No archived employees.</div>
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
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Archived: {e.archived_at ? new Date(e.archived_at).toLocaleString() : "—"}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/Main_Modules/Employees/details/?id=${encodeURIComponent(e.applicant_id)}`)}
                      className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => restore(e)}
                      className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-2"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" /> Restore
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
