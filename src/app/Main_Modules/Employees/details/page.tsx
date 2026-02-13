"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Mail,
  Phone,
  MapPin,
  User,
  ShieldCheck,
  FileText,
  Briefcase,
  ArrowLeft,
  ExternalLink,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { supabase } from "../../../Client/SupabaseClients";
import { useAuthRole } from "../../../Client/useRbac";
import EmployeeEditorModal from "../../../Components/EmployeeEditorModal";

type Applicant = {
  applicant_id: string;
  created_at: string;
  custom_id: string | null;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string | null;
  age: number | null;
  gender: string | null;
  education_attainment: string | null;
  date_hired_fsai: string | null;
  client_position: string | null;
  detachment: string | null;
  security_licensed_num: string | null;
  sss_number: string | null;
  pagibig_number: string | null;
  philhealth_number: string | null;
  tin_number: string | null;
  client_contact_num: string | null;
  client_email: string | null;
  present_address: string | null;
  province_address: string | null;
  emergency_contact_person: string | null;
  emergency_contact_num: string | null;
  status: string | null;

  profile_image_path: string | null;
  sss_certain_path: string | null;
  tin_id_path: string | null;
  pag_ibig_id_path: string | null;
  philhealth_id_path: string | null;
  security_license_path: string | null;
};

type Certificates = {
  training_path: string | null;
  seminar_path: string | null;
  gun_safety_certificate_path: string | null;
  highschool_diploma_path: string | null;
  college_diploma_path: string | null;
  vocational_path: string | null;
  course_title_degree: string | null;

  training_when_where?: string | null;
  seminar_when_where?: string | null;
  highschool_when_where?: string | null;
  college_when_where?: string | null;
  vocational_when_where?: string | null;
  course_when_where?: string | null;
};

type EmploymentItem = {
  employment_id?: string;
  company_name: string | null;
  position: string | null;
  telephone?: string | null;
  inclusive_dates?: string | null;
  leave_reason: string | null;
};

type EmploymentRecordRow = {
  company_name: string | null;
  position: string | null;
  leave_reason: string | null;
};

type Biodata = {
  applicant_form_path: string | null;
};

type Licensure = {
  driver_license_number: string | null;
  driver_expiration: string | null;
  security_license_number: string | null;
  security_expiration: string | null;
  insurance: string | null;
  insurance_expiration: string | null;
};

const BUCKETS = {
  applicants: "applicants",
  certificates: "certificates",
  licensure: "licensure",
};

function getFullName(a: Applicant) {
  const parts = [a.first_name, a.middle_name, a.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "(No name)";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addYearsClamped(base: Date, years: number) {
  const y = base.getFullYear() + years;
  const m = base.getMonth();
  const day = base.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, lastDay), 0, 0, 0, 0);
}

function addMonthsClamped(base: Date, months: number) {
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const day = base.getDate();
  const first = new Date(y, m, 1, 0, 0, 0, 0);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay), 0, 0, 0, 0);
}

function diffYearsMonthsDays(from: Date, to: Date) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end.getTime() < start.getTime()) return { years: 0, months: 0, days: 0 };

  let years = end.getFullYear() - start.getFullYear();
  let cursor = addYearsClamped(start, years);
  if (cursor.getTime() > end.getTime()) {
    years -= 1;
    cursor = addYearsClamped(start, years);
  }

  let months = (end.getFullYear() - cursor.getFullYear()) * 12 + (end.getMonth() - cursor.getMonth());
  let cursor2 = addMonthsClamped(cursor, months);
  if (cursor2.getTime() > end.getTime()) {
    months -= 1;
    cursor2 = addMonthsClamped(cursor, months);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.round((end.getTime() - cursor2.getTime()) / msPerDay));
  return { years: Math.max(0, years), months: Math.max(0, months), days };
}

function formatServiceLength(fromIso: string | null, now: Date) {
  if (!fromIso) return "—";
  const d = new Date(fromIso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = diffYearsMonthsDays(d, now);
  return `${diff.years} year(s), ${diff.months} month(s), ${diff.days} day(s)`;
}

function publicUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || null;
}

type ViewerItem = {
  key: string;
  title: string;
  url: string;
};

function isImageUrl(url: string | null) {
  if (!url) return false;
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url);
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-[#FFDA03] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-black" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm font-semibold text-gray-900 break-words">{value}</div>
      </div>
    </div>
  );
}

function ImageViewerModal({
  open,
  items,
  index,
  zoom,
  onClose,
  onChangeIndex,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onWheelZoom,
}: {
  open: boolean;
  items: ViewerItem[];
  index: number;
  zoom: number;
  onClose: () => void;
  onChangeIndex: (next: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onWheelZoom: (deltaY: number) => void;
}) {
  if (!open || !items.length) return null;
  const current = items[index] ?? items[0];

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[85vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-black truncate">{current.title}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onZoomOut}
                className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onZoomIn}
                className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onResetZoom}
                className="px-3 py-2 rounded-xl border bg-white text-black text-xs font-semibold"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-auto bg-gray-100"
            onWheel={(e) => {
              e.preventDefault();
              onWheelZoom(e.deltaY);
            }}
          >
            <div className="h-full min-h-full flex items-center justify-center p-6">
              <img
                src={current.url}
                alt={current.title}
                className="max-h-full max-w-full object-contain origin-center"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          </div>
        </div>

        <div className="w-64 border-l bg-white flex flex-col">
          <div className="px-4 py-3 border-b text-sm font-semibold text-black">Scanned Documents</div>
          <div className="overflow-y-auto p-3 space-y-2">
            {items.map((item, idx) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onChangeIndex(idx)}
                className={`w-full text-left rounded-xl border p-2 ${
                  idx === index ? "border-[#FFDA03] bg-yellow-50" : "border-gray-200 bg-white"
                }`}
              >
                <div className="h-16 w-full rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                  <img src={item.url} alt={item.title} className="h-full w-full object-cover" />
                </div>
                <div className="mt-2 text-xs font-medium text-black truncate">{item.title}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function safeBackHref(from: string | null) {
  if (!from) return "/Main_Modules/Employees/";
  // basic safety: only allow internal module routes
  if (!from.startsWith("/Main_Modules/")) return "/Main_Modules/Employees/";
  return from;
}

function EmployeeDetailsInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const from = params.get("from");
  const backHref = safeBackHref(from);

  const { role: sessionRole } = useAuthRole();
  const canEdit = sessionRole !== "employee";
  const [editorOpen, setEditorOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [certs, setCerts] = useState<Certificates | null>(null);
  const [employment, setEmployment] = useState<EmploymentItem[]>([]);
  const [lic, setLic] = useState<Licensure | null>(null);
  const [bio, setBio] = useState<Biodata | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItems, setViewerItems] = useState<ViewerItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerZoom, setViewerZoom] = useState(1);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const serviceLength = useMemo(
    () => formatServiceLength(applicant?.date_hired_fsai ?? null, now),
    [applicant?.date_hired_fsai, now]
  );

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      setApplicant(null);
      setCerts(null);
      setEmployment([]);
      setLic(null);
      setBio(null);

      if (!id) {
        setLoading(false);
        setError("Missing employee id");
        return;
      }

      try {
        const { data: a, error: aErr } = await supabase
          .from("applicants")
          .select(
            "applicant_id, created_at, custom_id, last_name, first_name, middle_name, birth_date, age, gender, education_attainment, date_hired_fsai, client_position, detachment, security_licensed_num, sss_number, pagibig_number, philhealth_number, tin_number, client_contact_num, client_email, present_address, province_address, emergency_contact_person, emergency_contact_num, status, profile_image_path, sss_certain_path, tin_id_path, pag_ibig_id_path, philhealth_id_path, security_license_path"
          )
          .eq("applicant_id", id)
          .maybeSingle();

        if (aErr) throw aErr;
        setApplicant((a as Applicant) || null);

        const [cRes, eRes, lRes] = await Promise.all([
          supabase
            .from("certificates")
            .select(
              "training_path, seminar_path, gun_safety_certificate_path, highschool_diploma_path, college_diploma_path, vocational_path, course_title_degree, training_when_where, seminar_when_where, highschool_when_where, college_when_where, vocational_when_where, course_when_where"
            )
            .eq("applicant_id", id)
            .maybeSingle(),
          supabase
            .from("employment_history")
            .select("employment_id, company_name, position, telephone, inclusive_dates, leave_reason")
            .eq("applicant_id", id)
            .order("created_at", { ascending: true }),
          supabase
            .from("licensure")
            .select(
              "driver_license_number, driver_expiration, security_license_number, security_expiration, insurance, insurance_expiration"
            )
            .eq("applicant_id", id)
            .maybeSingle(),
        ]);


        const bRes = await supabase
          .from("biodata")
          .select("applicant_form_path")
          .eq("applicant_id", id)
          .maybeSingle();

        if (cRes.error) console.warn(cRes.error);
        if (eRes.error) {
          console.warn(eRes.error);
          // Fallback: legacy single-row employment_record
          const legacy = await supabase
            .from("employment_record")
            .select("company_name, position, leave_reason")
            .eq("applicant_id", id)
            .maybeSingle();
          if (!legacy.error && legacy.data) {
            const legacyRow = legacy.data as unknown as EmploymentRecordRow;
            setEmployment([
              {
                company_name: legacyRow.company_name ?? null,
                position: legacyRow.position ?? null,
                leave_reason: legacyRow.leave_reason ?? null,
              },
            ]);
          }
        }
        if (lRes.error) console.warn(lRes.error);
        if (bRes.error) console.warn(bRes.error);

        setCerts((cRes.data as Certificates) || null);
        if (!eRes.error) setEmployment(((eRes.data as EmploymentItem[]) || []) ?? []);
        setLic((lRes.data as Licensure) || null);
        setBio((bRes.data as Biodata) || null);
      } catch (e: unknown) {
       
        setError(e instanceof Error ? e.message : "Failed to load employee");
      } finally {
        setLoading(false);
      }
    };

    run();

    // Auto-refresh if anything changes for this employee.
    // (Simple approach: any change triggers a refetch; keeps UI consistent.)
    const channel = supabase
      .channel(`realtime:employee:${id ?? "none"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applicants" },
        () => run()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "certificates" },
        () => run()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employment_record" },
        () => run()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "licensure" },
        () => run()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const profile = useMemo(() => {
    if (!applicant) return null;
    return publicUrl(BUCKETS.applicants, applicant.profile_image_path);
  }, [applicant]);

  const docUrls = useMemo(() => {
    if (!applicant) return null;
    return {
      applicationForm: publicUrl(BUCKETS.certificates, bio?.applicant_form_path || null),
      sss: publicUrl(BUCKETS.applicants, applicant.sss_certain_path),
      tin: publicUrl(BUCKETS.applicants, applicant.tin_id_path),
      pagibig: publicUrl(BUCKETS.applicants, applicant.pag_ibig_id_path),
      philhealth: publicUrl(BUCKETS.applicants, applicant.philhealth_id_path),
      securityLicense: publicUrl(BUCKETS.licensure, applicant.security_license_path),
      training: publicUrl(BUCKETS.certificates, certs?.training_path || null),
      seminar: publicUrl(BUCKETS.certificates, certs?.seminar_path || null),
      gunSafety: publicUrl(BUCKETS.certificates, certs?.gun_safety_certificate_path || null),
      hs: publicUrl(BUCKETS.certificates, certs?.highschool_diploma_path || null),
      college: publicUrl(BUCKETS.certificates, certs?.college_diploma_path || null),
      vocational: publicUrl(BUCKETS.certificates, certs?.vocational_path || null),
    };
  }, [applicant, certs, bio]);

  const scannedImageItems = useMemo(() => {
    const list: Array<{ key: string; title: string; url: string | null }> = [
      { key: "profile", title: "Profile Image", url: profile },
      { key: "applicationForm", title: "Application Form", url: docUrls?.applicationForm ?? null },
      { key: "sss", title: "SSS Certain", url: docUrls?.sss ?? null },
      { key: "tin", title: "TIN ID", url: docUrls?.tin ?? null },
      { key: "pagibig", title: "PAG-IBIG ID", url: docUrls?.pagibig ?? null },
      { key: "philhealth", title: "PHILHEALTH ID", url: docUrls?.philhealth ?? null },
      { key: "securityLicense", title: "Security License", url: docUrls?.securityLicense ?? null },
      { key: "gunSafety", title: "Gun Safety Certificate", url: docUrls?.gunSafety ?? null },
      { key: "training", title: "Training Certificate", url: docUrls?.training ?? null },
      { key: "seminar", title: "Seminar Certificate", url: docUrls?.seminar ?? null },
      { key: "hs", title: "Highschool Diploma", url: docUrls?.hs ?? null },
      { key: "college", title: "College Diploma", url: docUrls?.college ?? null },
      { key: "vocational", title: "Vocational", url: docUrls?.vocational ?? null },
    ];

    return list
      .filter((x): x is { key: string; title: string; url: string } => Boolean(x.url))
      .filter((x) => isImageUrl(x.url));
  }, [profile, docUrls]);

  function openImageViewerFromKey(key: string) {
    if (!canEdit) return;
    if (!scannedImageItems.length) return;

    const idx = scannedImageItems.findIndex((x) => x.key === key);
    const items = scannedImageItems.map((x) => ({ key: x.key, title: x.title, url: x.url }));
    setViewerItems(items);
    setViewerIndex(idx >= 0 ? idx : 0);
    setViewerZoom(1);
    setViewerOpen(true);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border shadow-sm p-8 text-center text-gray-500">
        Loading employee details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl border shadow-sm p-8">
        <div className="text-red-600 font-semibold">{error}</div>
        <div className="mt-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white text-black"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </div>
      </div>
    );
  }

  if (!applicant) {
    return (
      <div className="bg-white rounded-3xl border shadow-sm p-8 text-center text-gray-500">
        Employee not found.
      </div>
    );
  }

  const name = getFullName(applicant);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white text-black"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        {canEdit ? (
          <button
            onClick={() => setEditorOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
          >
            Edit
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left profile */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="flex flex-col items-center text-center">
            <div className="h-36 w-36 rounded-3xl bg-gray-100 overflow-hidden flex items-center justify-center">
              {profile ? (
                <button
                  type="button"
                  onClick={() => openImageViewerFromKey("profile")}
                  className="h-full w-full"
                  title={canEdit ? "Open image" : undefined}
                >
                  <img src={profile} alt={name} className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="text-sm text-gray-500">No Photo</div>
              )}
            </div>
            <div className="mt-4 text-2xl font-extrabold uppercase text-gray-900">{name}</div>
            <div className="mt-1 text-sm text-gray-600">{applicant.client_position ?? "—"}</div>

            <div className="mt-4 flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#FFDA03] text-black text-xs font-bold">
                {applicant.applicant_id.slice(0, 8).toUpperCase()}
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold">
                {applicant.status ?? "ACTIVE"}
              </span>
            </div>

            <div className="mt-4 w-full border rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2 text-sm">
                <div className="px-4 py-3 text-gray-500">Employee Status</div>
                <div className="px-4 py-3 font-semibold text-gray-900 text-right">Full-time</div>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="grid grid-cols-2 text-sm">
                <div className="px-4 py-3 text-gray-500">Detachment</div>
                <div className="px-4 py-3 font-semibold text-gray-900 text-right">
                  {applicant.detachment ?? "—"}
                </div>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="grid grid-cols-2 text-sm">
                <div className="px-4 py-3 text-gray-500">Join Date</div>
                <div className="px-4 py-3 font-semibold text-gray-900 text-right">
                  {formatDate(applicant.date_hired_fsai)}
                </div>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="grid grid-cols-2 text-sm">
                <div className="px-4 py-3 text-gray-500">Service Length</div>
                <div className="px-4 py-3 font-semibold text-gray-900 text-right">{serviceLength}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Personal Info */}
        <section className="bg-white rounded-3xl border shadow-sm p-6 xl:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-gray-900">Personal Info</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white px-4 py-3">
            <div className="text-xs text-gray-500">Application Form</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-gray-900">Application Form</div>
              {docUrls?.applicationForm ? (
                canEdit && isImageUrl(docUrls.applicationForm) ? (
                  <button
                    type="button"
                    onClick={() => openImageViewerFromKey("applicationForm")}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    Open <ExternalLink className="w-4 h-4" />
                  </button>
                ) : (
                  <a
                    href={docUrls.applicationForm}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    Open <ExternalLink className="w-4 h-4" />
                  </a>
                )
              ) : (
                <div className="text-xs text-gray-400">Not uploaded</div>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <InfoRow icon={ShieldCheck} label="Custom ID" value={applicant.custom_id ?? "—"} />
            <InfoRow icon={User} label="Gender" value={applicant.gender ?? "—"} />
            <InfoRow icon={Phone} label="Phone Number" value={applicant.client_contact_num ?? "—"} />
            <InfoRow icon={CalendarDays} label="Birth Date" value={formatDate(applicant.birth_date)} />
            <InfoRow icon={Mail} label="Email Address" value={applicant.client_email ?? "—"} />
            <InfoRow icon={User} label="Age" value={applicant.age ?? "—"} />
            <InfoRow icon={User} label="Emergency Contact" value={applicant.emergency_contact_person ?? "—"} />
            <InfoRow icon={MapPin} label="Present Address" value={applicant.present_address ?? "—"} />
            <InfoRow icon={Phone} label="Emergency Number" value={applicant.emergency_contact_num ?? "—"} />
            <InfoRow icon={MapPin} label="Province Address" value={applicant.province_address ?? "—"} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Education */}
        <section className="bg-white rounded-3xl border shadow-sm p-6 xl:col-span-2">
          <div className="text-lg font-bold text-gray-900">Education Attainment / Training</div>
          <div className="mt-3 text-sm text-gray-700">
            <div className="font-semibold">Education Attainment:</div>
            <div className="mt-1 text-gray-600">{applicant.education_attainment ?? "—"}</div>

            <div className="mt-4 font-semibold">Course / Title / Degree:</div>
            <div className="mt-1 text-gray-600">{certs?.course_title_degree ?? "—"}</div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="font-semibold">High School (When/Where)</div>
                <div className="mt-1 text-gray-600">{certs?.highschool_when_where ?? "—"}</div>
              </div>
              <div>
                <div className="font-semibold">College (When/Where)</div>
                <div className="mt-1 text-gray-600">{certs?.college_when_where ?? "—"}</div>
              </div>
              <div>
                <div className="font-semibold">Vocational (When/Where)</div>
                <div className="mt-1 text-gray-600">{certs?.vocational_when_where ?? "—"}</div>
              </div>
              <div>
                <div className="font-semibold">Course/Degree (When/Where)</div>
                <div className="mt-1 text-gray-600">{certs?.course_when_where ?? "—"}</div>
              </div>
              <div>
                <div className="font-semibold">Training (When/Where)</div>
                <div className="mt-1 text-gray-600">{certs?.training_when_where ?? "—"}</div>
              </div>
              <div>
                <div className="font-semibold">Seminar (When/Where)</div>
                <div className="mt-1 text-gray-600">{certs?.seminar_when_where ?? "—"}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Social Welfare */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="text-lg font-bold text-gray-900">Social Welfare</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-gray-500">SSS No.</div>
              <div className="font-semibold text-black">{applicant.sss_number ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-500">Pag-ibig No.</div>
              <div className="font-semibold text-black">{applicant.pagibig_number ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-500">Philhealth No.</div>
              <div className="font-semibold text-black">{applicant.philhealth_number ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-500">TIN</div>
              <div className="font-semibold text-black">{applicant.tin_number ?? "—"}</div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Licensure */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="text-lg font-bold text-gray-900">Licensure</div>
          <div className="mt-4 space-y-4 text-sm">
            <InfoRow
              icon={ShieldCheck}
              label="Security License"
              value={lic?.security_license_number ?? applicant.security_licensed_num ?? "—"}
            />
            <InfoRow icon={CalendarDays} label="Security Expiration" value={formatDate(lic?.security_expiration ?? null)} />
            <InfoRow icon={FileText} label="Driver License" value={lic?.driver_license_number ?? "—"} />
            <InfoRow icon={CalendarDays} label="Driver Expiration" value={formatDate(lic?.driver_expiration ?? null)} />
          </div>
        </section>

        {/* Previous Employment */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="text-lg font-bold text-gray-900">Previous Employment</div>
          {employment.length === 0 ? (
            <div className="mt-4 text-sm text-gray-500">—</div>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              {employment.map((job, idx) => (
                <div key={job.employment_id ?? idx} className="rounded-2xl border p-4">
                  <div className="text-xs font-semibold text-gray-500">Record #{idx + 1}</div>
                  <div className="mt-3 space-y-3">
                    <InfoRow icon={Briefcase} label="Company Name" value={job.company_name ?? "—"} />
                    <InfoRow icon={Briefcase} label="Position" value={job.position ?? "—"} />
                    <InfoRow icon={Phone} label="Telephone" value={job.telephone ?? "—"} />
                    <InfoRow icon={CalendarDays} label="Incl. Dates" value={job.inclusive_dates ?? "—"} />
                    <InfoRow icon={FileText} label="Leave Reason" value={job.leave_reason ?? "—"} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Scanned Documents */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="text-lg font-bold text-gray-900">Scanned Documents</div>
          <div className="mt-4 divide-y">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-yellow-700" />
                <div className="text-sm font-medium text-gray-900 truncate">Profile Image</div>
              </div>
              {profile ? (
                canEdit && isImageUrl(profile) ? (
                  <button
                    type="button"
                    onClick={() => openImageViewerFromKey("profile")}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    Open <ExternalLink className="w-4 h-4" />
                  </button>
                ) : (
                  <a
                    href={profile}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    Open <ExternalLink className="w-4 h-4" />
                  </a>
                )
              ) : (
                <div className="text-xs text-gray-400">Not uploaded</div>
              )}
            </div>

            {[
              { key: "applicationForm", title: "Application Form", url: docUrls?.applicationForm ?? null },
              { key: "sss", title: "SSS Certain", url: docUrls?.sss ?? null },
              { key: "tin", title: "TIN ID", url: docUrls?.tin ?? null },
              { key: "pagibig", title: "PAG-IBIG ID", url: docUrls?.pagibig ?? null },
              { key: "philhealth", title: "PHILHEALTH ID", url: docUrls?.philhealth ?? null },
              { key: "securityLicense", title: "Security License", url: docUrls?.securityLicense ?? null },
              { key: "gunSafety", title: "Gun Safety Certificate", url: docUrls?.gunSafety ?? null },
              { key: "training", title: "Training Certificate", url: docUrls?.training ?? null },
              { key: "seminar", title: "Seminar Certificate", url: docUrls?.seminar ?? null },
              { key: "hs", title: "Highschool Diploma", url: docUrls?.hs ?? null },
              { key: "college", title: "College Diploma", url: docUrls?.college ?? null },
              { key: "vocational", title: "Vocational", url: docUrls?.vocational ?? null },
            ].map((doc) => (
              <div key={doc.key} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-yellow-700" />
                  <div className="text-sm font-medium text-gray-900 truncate">{doc.title}</div>
                </div>
                {doc.url ? (
                  canEdit && isImageUrl(doc.url) ? (
                    <button
                      type="button"
                      onClick={() => openImageViewerFromKey(doc.key)}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      Open <ExternalLink className="w-4 h-4" />
                    </button>
                  ) : (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      Open <ExternalLink className="w-4 h-4" />
                    </a>
                  )
                ) : (
                  <div className="text-xs text-gray-400">Not uploaded</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <ImageViewerModal
        open={viewerOpen}
        items={viewerItems}
        index={viewerIndex}
        zoom={viewerZoom}
        onClose={() => setViewerOpen(false)}
        onChangeIndex={(next) => {
          setViewerIndex(next);
          setViewerZoom(1);
        }}
        onZoomIn={() => setViewerZoom((z) => Math.min(4, Math.round((z + 0.2) * 10) / 10))}
        onZoomOut={() => setViewerZoom((z) => Math.max(0.4, Math.round((z - 0.2) * 10) / 10))}
        onResetZoom={() => setViewerZoom(1)}
        onWheelZoom={(deltaY) => {
          if (deltaY < 0) setViewerZoom((z) => Math.min(4, Math.round((z + 0.1) * 10) / 10));
          else setViewerZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10));
        }}
      />

      <EmployeeEditorModal
        open={editorOpen}
        mode="edit"
        applicantId={id}
        title="Edit Employee"
        subtitle={name}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          // After save, the realtime channel will refresh; close is already handled.
        }}
      />
    </div>
  );
}

export default function EmployeeDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-3xl border shadow-sm p-8 text-center text-gray-500">
          Loading employee details...
        </div>
      }
    >
      <EmployeeDetailsInner />
    </Suspense>
  );
}
