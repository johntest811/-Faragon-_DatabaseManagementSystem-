"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../Client/SupabaseClients";

type Mode = "create" | "edit";

export type EmployeeEditorModalProps = {
  open: boolean;
  mode: Mode;
  applicantId?: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSaved?: (applicantId: string) => void;
};

type ApplicantDraft = {
  custom_id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  birth_date: string;
  age: string;
  client_contact_num: string;
  client_email: string;
  present_address: string;
  province_address: string;
  emergency_contact_person: string;
  emergency_contact_num: string;
  education_attainment: string;
  date_hired_fsai: string;
  client_position: string;
  detachment: string;
  status: string;

  security_licensed_num: string;
  sss_number: string;
  pagibig_number: string;
  philhealth_number: string;
  tin_number: string;

  profile_image_path: string;
  sss_certain_path: string;
  tin_id_path: string;
  pag_ibig_id_path: string;
  philhealth_id_path: string;
  security_license_path: string;
};

type CertificatesDraft = {
  course_title_degree: string;

  training_path: string;
  seminar_path: string;
  gun_safety_certificate_path: string;
  highschool_diploma_path: string;
  college_diploma_path: string;
  vocational_path: string;

  training_when_where: string;
  seminar_when_where: string;
  highschool_when_where: string;
  college_when_where: string;
  vocational_when_where: string;
  course_when_where: string;
};

type LicensureDraft = {
  driver_license_number: string;
  driver_expiration: string;
  security_license_number: string;
  security_expiration: string;
};

type BiodataDraft = {
  applicant_form_path: string;
};

type EmploymentItem = {
  employment_id?: string;
  company_name: string;
  position: string;
  telephone: string;
  inclusive_dates: string;
  leave_reason: string;
};

type ApplicantRow = {
  custom_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  gender: string | null;
  birth_date: string | null;
  age: number | null;
  client_contact_num: string | null;
  client_email: string | null;
  present_address: string | null;
  province_address: string | null;
  emergency_contact_person: string | null;
  emergency_contact_num: string | null;
  education_attainment: string | null;
  date_hired_fsai: string | null;
  client_position: string | null;
  detachment: string | null;
  status: string | null;
  security_licensed_num: string | null;
  sss_number: string | null;
  pagibig_number: string | null;
  philhealth_number: string | null;
  tin_number: string | null;
  profile_image_path: string | null;
  sss_certain_path: string | null;
  tin_id_path: string | null;
  pag_ibig_id_path: string | null;
  philhealth_id_path: string | null;
  security_license_path: string | null;
};

type CertificatesRow = {
  course_title_degree: string | null;
  training_path: string | null;
  seminar_path: string | null;
  gun_safety_certificate_path: string | null;
  highschool_diploma_path: string | null;
  college_diploma_path: string | null;
  vocational_path: string | null;
  training_when_where: string | null;
  seminar_when_where: string | null;
  highschool_when_where: string | null;
  college_when_where: string | null;
  vocational_when_where: string | null;
  course_when_where: string | null;
};

type LicensureRow = {
  driver_license_number: string | null;
  driver_expiration: string | null;
  security_license_number: string | null;
  security_expiration: string | null;
};

type BiodataRow = {
  applicant_form_path: string | null;
};

type EmploymentHistoryRow = {
  employment_id: string;
  company_name: string | null;
  position: string | null;
  telephone: string | null;
  inclusive_dates: string | null;
  leave_reason: string | null;
};

type EmploymentRecordRow = {
  company_name: string | null;
  position: string | null;
  leave_reason: string | null;
};

type JobTitleRow = {
  title_id: string;
  title: string;
};

const BUCKETS = {
  applicants: "applicants",
  certificates: "certificates",
  licensure: "licensure",
} as const;

function emptyApplicantDraft(): ApplicantDraft {
  return {
    custom_id: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    gender: "",
    birth_date: "",
    age: "",
    client_contact_num: "",
    client_email: "",
    present_address: "",
    province_address: "",
    emergency_contact_person: "",
    emergency_contact_num: "",
    education_attainment: "",
    date_hired_fsai: "",
    client_position: "",
    detachment: "",
    status: "ACTIVE",

    security_licensed_num: "",
    sss_number: "",
    pagibig_number: "",
    philhealth_number: "",
    tin_number: "",

    profile_image_path: "",
    sss_certain_path: "",
    tin_id_path: "",
    pag_ibig_id_path: "",
    philhealth_id_path: "",
    security_license_path: "",
  };
}

function emptyCertificatesDraft(): CertificatesDraft {
  return {
    course_title_degree: "",

    training_path: "",
    seminar_path: "",
    gun_safety_certificate_path: "",
    highschool_diploma_path: "",
    college_diploma_path: "",
    vocational_path: "",

    training_when_where: "",
    seminar_when_where: "",
    highschool_when_where: "",
    college_when_where: "",
    vocational_when_where: "",
    course_when_where: "",
  };
}

function emptyLicensureDraft(): LicensureDraft {
  return {
    driver_license_number: "",
    driver_expiration: "",
    security_license_number: "",
    security_expiration: "",
  };
}

function emptyBiodataDraft(): BiodataDraft {
  return { applicant_form_path: "" };
}

function normalizeDateInput(value: string | null | undefined) {
  if (!value) return "";
  // Accept ISO or yyyy-mm-dd
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(value);
}

function normalizeStatus(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "INACTIVE") return "INACTIVE";
  if (v === "REASSIGN") return "REASSIGN";
  if (v === "RETIRED") return "RETIRED";
  return "ACTIVE";
}

function generateCustomId() {
  // Compact, human-friendly: e.g. EMP-7K3Q9D2H
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `EMP-${out}`;
}

function generateUuidV4(): string {
  try {
    type CryptoLike = {
      randomUUID?: () => string;
      getRandomValues?: (arr: Uint8Array) => Uint8Array;
    };
    const cryptoLike = (globalThis as unknown as { crypto?: CryptoLike }).crypto;
    if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();

    const bytes = new Uint8Array(16);
    if (cryptoLike?.getRandomValues) cryptoLike.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);

    // RFC 4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    // Very unlikely; last resort.
    const s = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return `${s()}${s()}-${s()}-${s()}-${s()}-${s()}${s()}${s()}`;
  }
}

function publicUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || null;
}

function toNullableText(value: string) {
  const v = value.trim();
  return v.length ? v : null;
}

function toNullableInt(value: string) {
  const v = value.trim();
  if (!v) return null;
  const num = Number(v);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function sectionButton(active: boolean) {
  return `px-3 py-2 rounded-xl border text-sm ${active ? "bg-[#FFDA03] text-black border-[#FFDA03]" : "bg-white text-black"}`;
}

export default function EmployeeEditorModal({
  open,
  mode,
  applicantId,
  title,
  subtitle,
  onClose,
  onSaved,
}: EmployeeEditorModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const STEPS = useMemo(
    () => ["personal", "education", "social", "licensure", "employment", "documents"] as const,
    []
  );
  type Step = (typeof STEPS)[number];

  const [tab, setTab] = useState<
    "personal" | "education" | "social" | "licensure" | "employment" | "documents"
  >("personal");

  const [maxStepIndex, setMaxStepIndex] = useState(0);
  const [draftApplicantId, setDraftApplicantId] = useState<string | null>(null);

  const [app, setApp] = useState<ApplicantDraft>(emptyApplicantDraft);
  const [certs, setCerts] = useState<CertificatesDraft>(emptyCertificatesDraft);
  const [lic, setLic] = useState<LicensureDraft>(emptyLicensureDraft);
  const [bio, setBio] = useState<BiodataDraft>(emptyBiodataDraft);
  const [jobs, setJobs] = useState<EmploymentItem[]>([]);
  const [jobTitleOptions, setJobTitleOptions] = useState<JobTitleRow[]>([]);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [jobTitlesSource, setJobTitlesSource] = useState<"table" | "applicants">("table");


  const effectiveId = mode === "edit" ? applicantId ?? null : draftApplicantId;

  const currentStepIndex = useMemo(() => STEPS.indexOf(tab as Step), [STEPS, tab]);
  const isLastStep = currentStepIndex === STEPS.length - 1;

  function canNavigateTo(step: Step) {
    if (mode === "edit") return true;
    const idx = STEPS.indexOf(step);
    return idx <= maxStepIndex;
  }

  function goToStep(step: Step) {
    if (canNavigateTo(step)) {
      setTab(step);
      // setError("");
      return;
    }
    setError("Please use Next to proceed chronologically. You can go back anytime.");
  }

  function goNext() {
    const next = Math.min(currentStepIndex + 1, STEPS.length - 1);
    setMaxStepIndex((v) => Math.max(v, next));
    setTab(STEPS[next]);
    setError("");
  }

  function goBack() {
    const prev = Math.max(currentStepIndex - 1, 0);
    setTab(STEPS[prev]);
    setError("");
  }

  function normalizeJobTitle(value: string) {
    return value.trim().replace(/\s+/g, " ");
  }

  async function addJobTitleOption() {
    const title = normalizeJobTitle(newJobTitle);
    if (!title) {
      setNewJobTitle("");
      return;
    }

    const exists = jobTitleOptions.some((x) => x.title.toLowerCase() === title.toLowerCase());
    if (exists) {
      setApp((d) => ({ ...d, client_position: title }));
      setNewJobTitle("");
      return;
    }

    if (jobTitlesSource !== "table") {
      setJobTitleOptions((prev) => {
        const next = [...prev, { title_id: title, title }];
        return next.sort((a, b) => a.title.localeCompare(b.title));
      });
      setApp((d) => ({ ...d, client_position: title }));
      setNewJobTitle("");
      setError("");
      return;
    }

    const insertRes = await supabase
      .from("job_titles")
      .insert({ title })
      .select("title_id, title")
      .single();

    if (insertRes.error) {
      setError(insertRes.error.message || "Failed to save new job title");
      return;
    }

    setJobTitleOptions((prev) => {
      const next = [...prev, insertRes.data as JobTitleRow];
      return next.sort((a, b) => a.title.localeCompare(b.title));
    });
    setApp((d) => ({ ...d, client_position: title }));
    setNewJobTitle("");
    setError("");
  }

  async function deleteSelectedJobTitle() {
    const title = normalizeJobTitle(app.client_position);
    if (!title) return;

    const target = jobTitleOptions.find((x) => x.title.toLowerCase() === title.toLowerCase());
    if (!target) {
      setApp((d) => ({ ...d, client_position: "" }));
      return;
    }

    if (jobTitlesSource !== "table") {
      setJobTitleOptions((prev) => prev.filter((x) => x.title.toLowerCase() !== title.toLowerCase()));
      setApp((d) => ({ ...d, client_position: "" }));
      setError("");
      return;
    }

    const delRes = await supabase.from("job_titles").delete().eq("title_id", target.title_id);
    if (delRes.error) {
      setError(delRes.error.message || "Failed to delete job title");
      return;
    }

    setJobTitleOptions((prev) => prev.filter((x) => x.title_id !== target.title_id));
    setApp((d) => ({ ...d, client_position: "" }));
    setError("");
  }

  const docPreview = useMemo(() => {
    return {
      profile: publicUrl(BUCKETS.applicants, app.profile_image_path || null),
      applicationForm: publicUrl(BUCKETS.certificates, bio.applicant_form_path || null),
      sss: publicUrl(BUCKETS.applicants, app.sss_certain_path || null),
      tin: publicUrl(BUCKETS.applicants, app.tin_id_path || null),
      pagibig: publicUrl(BUCKETS.applicants, app.pag_ibig_id_path || null),
      philhealth: publicUrl(BUCKETS.applicants, app.philhealth_id_path || null),
      securityLicense: publicUrl(BUCKETS.licensure, app.security_license_path || null),

      training: publicUrl(BUCKETS.certificates, certs.training_path || null),
      seminar: publicUrl(BUCKETS.certificates, certs.seminar_path || null),
      gunSafety: publicUrl(BUCKETS.certificates, certs.gun_safety_certificate_path || null),
      hs: publicUrl(BUCKETS.certificates, certs.highschool_diploma_path || null),
      college: publicUrl(BUCKETS.certificates, certs.college_diploma_path || null),
      vocational: publicUrl(BUCKETS.certificates, certs.vocational_path || null),
    };
  }, [app, bio, certs]);

  useEffect(() => {
    if (!open) return;

    setError("");
    setTab("personal");

    if (mode === "create") {
      setMaxStepIndex(0);
      setDraftApplicantId(generateUuidV4());
    } else {
      // In edit mode, all sections should be accessible.
      setMaxStepIndex(999);
      setDraftApplicantId(null);
    }

    if (mode === "create") {
      setApp(emptyApplicantDraft());
      setCerts(emptyCertificatesDraft());
      setLic(emptyLicensureDraft());
      setBio(emptyBiodataDraft());
      setJobs([]);
      return;
    }

    const idToLoad = mode === "edit" ? applicantId ?? null : null;
    if (!idToLoad) return;

    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const aRes = await supabase
          .from("applicants")
          .select(
            "applicant_id, custom_id, first_name, middle_name, last_name, gender, birth_date, age, client_contact_num, client_email, present_address, province_address, emergency_contact_person, emergency_contact_num, education_attainment, date_hired_fsai, client_position, detachment, status, security_licensed_num, sss_number, pagibig_number, philhealth_number, tin_number, profile_image_path, sss_certain_path, tin_id_path, pag_ibig_id_path, philhealth_id_path, security_license_path"
          )
          .eq("applicant_id", idToLoad)
          .maybeSingle();

        if (aRes.error) throw aRes.error;

        const cRes = await supabase
          .from("certificates")
          .select(
            "course_title_degree, training_path, seminar_path, gun_safety_certificate_path, highschool_diploma_path, college_diploma_path, vocational_path, training_when_where, seminar_when_where, highschool_when_where, college_when_where, vocational_when_where, course_when_where"
          )
          .eq("applicant_id", idToLoad)
          .maybeSingle();

        const lRes = await supabase
          .from("licensure")
          .select("driver_license_number, driver_expiration, security_license_number, security_expiration")
          .eq("applicant_id", idToLoad)
          .maybeSingle();

        const bRes = await supabase
          .from("biodata")
          .select("applicant_form_path")
          .eq("applicant_id", idToLoad)
          .maybeSingle();

        // Employment: prefer employment_history (multi-row); fall back to employment_record.
        const hRes = await supabase
          .from("employment_history")
          .select("employment_id, company_name, position, telephone, inclusive_dates, leave_reason")
          .eq("applicant_id", idToLoad)
          .order("created_at", { ascending: true });

        let employmentItems: EmploymentItem[] = [];
        if (!hRes.error) {
          const rows = ((hRes.data ?? []) as unknown as EmploymentHistoryRow[]).filter(
            (r): r is EmploymentHistoryRow => !!r
          );
          employmentItems = rows.map((r) => ({
            employment_id: r.employment_id,
            company_name: r.company_name ?? "",
            position: r.position ?? "",
            telephone: r.telephone ?? "",
            inclusive_dates: r.inclusive_dates ?? "",
            leave_reason: r.leave_reason ?? "",
          }));
        } else {
          const legacy = await supabase
            .from("employment_record")
            .select("company_name, position, leave_reason")
            .eq("applicant_id", idToLoad)
            .maybeSingle();
          if (!legacy.error && legacy.data) {
            const legacyRow = legacy.data as unknown as EmploymentRecordRow;
            employmentItems = [
              {
                company_name: legacyRow.company_name ?? "",
                position: legacyRow.position ?? "",
                telephone: "",
                inclusive_dates: "",
                leave_reason: legacyRow.leave_reason ?? "",
              },
            ];
          }
        }

        if (cancelled) return;

        const a = aRes.data as unknown as Partial<ApplicantRow> | null;
        setApp({
          custom_id: a?.custom_id ?? "",
          first_name: a?.first_name ?? "",
          middle_name: a?.middle_name ?? "",
          last_name: a?.last_name ?? "",
          gender: a?.gender ?? "",
          birth_date: normalizeDateInput(a?.birth_date ?? null),
          age: a?.age != null ? String(a.age) : "",
          client_contact_num: a?.client_contact_num ?? "",
          client_email: a?.client_email ?? "",
          present_address: a?.present_address ?? "",
          province_address: a?.province_address ?? "",
          emergency_contact_person: a?.emergency_contact_person ?? "",
          emergency_contact_num: a?.emergency_contact_num ?? "",
          education_attainment: a?.education_attainment ?? "",
          date_hired_fsai: normalizeDateInput(a?.date_hired_fsai ?? null),
          client_position: a?.client_position ?? "",
          detachment: a?.detachment ?? "",
          status: normalizeStatus(a?.status),

          security_licensed_num: a?.security_licensed_num ?? "",
          sss_number: a?.sss_number ?? "",
          pagibig_number: a?.pagibig_number ?? "",
          philhealth_number: a?.philhealth_number ?? "",
          tin_number: a?.tin_number ?? "",

          profile_image_path: a?.profile_image_path ?? "",
          sss_certain_path: a?.sss_certain_path ?? "",
          tin_id_path: a?.tin_id_path ?? "",
          pag_ibig_id_path: a?.pag_ibig_id_path ?? "",
          philhealth_id_path: a?.philhealth_id_path ?? "",
          security_license_path: a?.security_license_path ?? "",
        });

        const c = ((cRes.data ?? {}) as unknown as Partial<CertificatesRow>) || {};
        setCerts({
          course_title_degree: c.course_title_degree ?? "",
          training_path: c.training_path ?? "",
          seminar_path: c.seminar_path ?? "",
          gun_safety_certificate_path: c.gun_safety_certificate_path ?? "",
          highschool_diploma_path: c.highschool_diploma_path ?? "",
          college_diploma_path: c.college_diploma_path ?? "",
          vocational_path: c.vocational_path ?? "",
          training_when_where: c.training_when_where ?? "",
          seminar_when_where: c.seminar_when_where ?? "",
          highschool_when_where: c.highschool_when_where ?? "",
          college_when_where: c.college_when_where ?? "",
          vocational_when_where: c.vocational_when_where ?? "",
          course_when_where: c.course_when_where ?? "",
        });

        const l = ((lRes.data ?? {}) as unknown as Partial<LicensureRow>) || {};
        setLic({
          driver_license_number: l.driver_license_number ?? "",
          driver_expiration: normalizeDateInput(l.driver_expiration ?? null),
          security_license_number: l.security_license_number ?? "",
          security_expiration: normalizeDateInput(l.security_expiration ?? null),
        });

        const b = ((bRes.data ?? {}) as unknown as Partial<BiodataRow>) || {};
        setBio({ applicant_form_path: b.applicant_form_path ?? "" });

        setJobs(employmentItems);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load employee");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [open, mode, applicantId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadJobTitles() {
      const tableRes = await supabase
        .from("job_titles")
        .select("title_id, title")
        .order("title", { ascending: true })
        .limit(1000);

      if (!tableRes.error) {
        if (!cancelled) {
          setJobTitlesSource("table");
          setJobTitleOptions((tableRes.data as JobTitleRow[]) ?? []);
        }
        return;
      }

      const fallbackRes = await supabase
        .from("applicants")
        .select("client_position")
        .not("client_position", "is", null)
        .limit(1000);

      if (fallbackRes.error || cancelled) return;
      const rows = (fallbackRes.data ?? []) as Array<{ client_position: string | null }>;
      const titles = Array.from(
        new Set(rows.map((r) => normalizeJobTitle(r.client_position ?? "")).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));

      if (!cancelled) {
        setJobTitlesSource("applicants");
        setJobTitleOptions(titles.map((title) => ({ title_id: title, title })));
      }
    }

    loadJobTitles();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const current = normalizeJobTitle(app.client_position);
    if (!current) return;

    setJobTitleOptions((prev) => {
      const exists = prev.some((x) => x.title.toLowerCase() === current.toLowerCase());
      if (exists) return prev;
      return [...prev, { title_id: current, title: current }].sort((a, b) => a.title.localeCompare(b.title));
    });
  }, [app.client_position]);

  async function uploadToBucket(bucket: string, id: string, file: File, prefix: string) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${id}/${prefix}-${Date.now()}-${safeName}`;
    const upRes = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (upRes.error) throw upRes.error;
    return path;
  }

  async function onPickFile(
    bucket: string,
    prefix: string,
    setter: (path: string) => void,
    file?: File | null
  ) {
    if (!file) return;
    const id = effectiveId;
    if (!id) {
      setError("Missing employee id; please try reopening the modal.");
      return;
    }
    setError("");
    try {
      const path = await uploadToBucket(bucket, id, file, prefix);
      setter(path);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function save() {
    setError("");
    setSaving(true);

    try {
      if (mode === "create") {
        if (!app.first_name.trim() || !app.last_name.trim()) {
          setError("First Name and Last Name are required");
          setSaving(false);
          return;
        }

        const createId =
          draftApplicantId || generateUuidV4();

        const aPayload: Record<string, string | number | null> = {
          applicant_id: createId,
          custom_id: toNullableText(app.custom_id),
          first_name: toNullableText(app.first_name),
          middle_name: toNullableText(app.middle_name),
          last_name: toNullableText(app.last_name),
          gender: toNullableText(app.gender),
          birth_date: toNullableText(app.birth_date),
          age: toNullableInt(app.age),
          client_contact_num: toNullableText(app.client_contact_num),
          client_email: toNullableText(app.client_email),
          present_address: toNullableText(app.present_address),
          province_address: toNullableText(app.province_address),
          emergency_contact_person: toNullableText(app.emergency_contact_person),
          emergency_contact_num: toNullableText(app.emergency_contact_num),
          education_attainment: toNullableText(app.education_attainment),
          date_hired_fsai: toNullableText(app.date_hired_fsai),
          client_position: toNullableText(app.client_position),
          detachment: toNullableText(app.detachment),
          status: normalizeStatus(app.status),

          security_licensed_num: toNullableText(app.security_licensed_num),
          sss_number: toNullableText(app.sss_number),
          pagibig_number: toNullableText(app.pagibig_number),
          philhealth_number: toNullableText(app.philhealth_number),
          tin_number: toNullableText(app.tin_number),

          profile_image_path: toNullableText(app.profile_image_path),
          sss_certain_path: toNullableText(app.sss_certain_path),
          tin_id_path: toNullableText(app.tin_id_path),
          pag_ibig_id_path: toNullableText(app.pag_ibig_id_path),
          philhealth_id_path: toNullableText(app.philhealth_id_path),
          security_license_path: toNullableText(app.security_license_path),
        };

        const ins = await supabase
          .from("applicants")
          .insert(aPayload)
          .select("applicant_id")
          .single();
        if (ins.error) throw ins.error;

        const newId = (ins.data as { applicant_id: string }).applicant_id;
        setDraftApplicantId(newId);

        // Related tables (best-effort)
        await supabase.from("certificates").upsert({
          applicant_id: newId,
          course_title_degree: toNullableText(certs.course_title_degree),
          training_path: toNullableText(certs.training_path),
          seminar_path: toNullableText(certs.seminar_path),
          gun_safety_certificate_path: toNullableText(certs.gun_safety_certificate_path),
          highschool_diploma_path: toNullableText(certs.highschool_diploma_path),
          college_diploma_path: toNullableText(certs.college_diploma_path),
          vocational_path: toNullableText(certs.vocational_path),
          training_when_where: toNullableText(certs.training_when_where),
          seminar_when_where: toNullableText(certs.seminar_when_where),
          highschool_when_where: toNullableText(certs.highschool_when_where),
          college_when_where: toNullableText(certs.college_when_where),
          vocational_when_where: toNullableText(certs.vocational_when_where),
          course_when_where: toNullableText(certs.course_when_where),
        });

        await supabase.from("licensure").upsert({
          applicant_id: newId,
          driver_license_number: toNullableText(lic.driver_license_number),
          driver_expiration: toNullableText(lic.driver_expiration),
          security_license_number: toNullableText(lic.security_license_number),
          security_expiration: toNullableText(lic.security_expiration),
        });

        await supabase.from("biodata").upsert({
          applicant_id: newId,
          applicant_form_path: toNullableText(bio.applicant_form_path),
        });

        const cleanJobs = jobs
          .map((j) => ({
            applicant_id: newId,
            company_name: toNullableText(j.company_name),
            position: toNullableText(j.position),
            telephone: toNullableText(j.telephone),
            inclusive_dates: toNullableText(j.inclusive_dates),
            leave_reason: toNullableText(j.leave_reason),
          }))
          .filter((j) => j.company_name || j.position || j.leave_reason || j.telephone || j.inclusive_dates);

        if (cleanJobs.length) {
          await supabase.from("employment_history").insert(cleanJobs);
        }

        const nextStatus = normalizeStatus(app.status);
        onSaved?.(newId);
        onClose();

        if (nextStatus === "REASSIGN") {
          router.push("/Main_Modules/Reassign/");
        } else if (nextStatus === "RETIRED") {
          router.push("/Main_Modules/Retired/");
        }
        return;
      }

      if (!effectiveId) {
        setError("Missing applicant id");
        setSaving(false);
        return;
      }

      const up = await supabase
        .from("applicants")
        .update({
          custom_id: toNullableText(app.custom_id),
          first_name: toNullableText(app.first_name),
          middle_name: toNullableText(app.middle_name),
          last_name: toNullableText(app.last_name),
          gender: toNullableText(app.gender),
          birth_date: toNullableText(app.birth_date),
          age: toNullableInt(app.age),
          client_contact_num: toNullableText(app.client_contact_num),
          client_email: toNullableText(app.client_email),
          present_address: toNullableText(app.present_address),
          province_address: toNullableText(app.province_address),
          emergency_contact_person: toNullableText(app.emergency_contact_person),
          emergency_contact_num: toNullableText(app.emergency_contact_num),
          education_attainment: toNullableText(app.education_attainment),
          date_hired_fsai: toNullableText(app.date_hired_fsai),
          client_position: toNullableText(app.client_position),
          detachment: toNullableText(app.detachment),
          status: normalizeStatus(app.status),

          security_licensed_num: toNullableText(app.security_licensed_num),
          sss_number: toNullableText(app.sss_number),
          pagibig_number: toNullableText(app.pagibig_number),
          philhealth_number: toNullableText(app.philhealth_number),
          tin_number: toNullableText(app.tin_number),

          profile_image_path: toNullableText(app.profile_image_path),
          sss_certain_path: toNullableText(app.sss_certain_path),
          tin_id_path: toNullableText(app.tin_id_path),
          pag_ibig_id_path: toNullableText(app.pag_ibig_id_path),
          philhealth_id_path: toNullableText(app.philhealth_id_path),
          security_license_path: toNullableText(app.security_license_path),
        })
        .eq("applicant_id", effectiveId);

      if (up.error) throw up.error;

      const cUp = await supabase.from("certificates").upsert({
        applicant_id: effectiveId,
        course_title_degree: toNullableText(certs.course_title_degree),
        training_path: toNullableText(certs.training_path),
        seminar_path: toNullableText(certs.seminar_path),
        gun_safety_certificate_path: toNullableText(certs.gun_safety_certificate_path),
        highschool_diploma_path: toNullableText(certs.highschool_diploma_path),
        college_diploma_path: toNullableText(certs.college_diploma_path),
        vocational_path: toNullableText(certs.vocational_path),
        training_when_where: toNullableText(certs.training_when_where),
        seminar_when_where: toNullableText(certs.seminar_when_where),
        highschool_when_where: toNullableText(certs.highschool_when_where),
        college_when_where: toNullableText(certs.college_when_where),
        vocational_when_where: toNullableText(certs.vocational_when_where),
        course_when_where: toNullableText(certs.course_when_where),
      });
      if (cUp.error) throw cUp.error;

      const lUp = await supabase.from("licensure").upsert({
        applicant_id: effectiveId,
        driver_license_number: toNullableText(lic.driver_license_number),
        driver_expiration: toNullableText(lic.driver_expiration),
        security_license_number: toNullableText(lic.security_license_number),
        security_expiration: toNullableText(lic.security_expiration),
      });
      if (lUp.error) throw lUp.error;

      const bUp = await supabase.from("biodata").upsert({
        applicant_id: effectiveId,
        applicant_form_path: toNullableText(bio.applicant_form_path),
      });
      if (bUp.error) throw bUp.error;

      // Employment history: replace all for simplicity.
      const del = await supabase.from("employment_history").delete().eq("applicant_id", effectiveId);
      if (del.error) {
        // Ignore if table doesn't exist.
      } else {
        const cleanJobs = jobs
          .map((j) => ({
            applicant_id: effectiveId,
            company_name: toNullableText(j.company_name),
            position: toNullableText(j.position),
            telephone: toNullableText(j.telephone),
            inclusive_dates: toNullableText(j.inclusive_dates),
            leave_reason: toNullableText(j.leave_reason),
          }))
          .filter((j) => j.company_name || j.position || j.leave_reason || j.telephone || j.inclusive_dates);

        if (cleanJobs.length) {
          const ins = await supabase.from("employment_history").insert(cleanJobs);
          if (ins.error) throw ins.error;
        }
      }

      const nextStatus = normalizeStatus(app.status);
      onSaved?.(effectiveId);
      onClose();

      if (nextStatus === "REASSIGN") {
        router.push("/Main_Modules/Reassign/");
      } else if (nextStatus === "RETIRED") {
        router.push("/Main_Modules/Retired/");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl bg-white rounded-3xl border shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-black">
              {title ?? (mode === "create" ? "New Employee" : "Edit Employee")}
            </div>
            {subtitle ? <div className="text-xs text-gray-500 truncate">{subtitle}</div> : null}
            {mode === "create" ? (
              <div className="mt-1 text-[11px] text-gray-500">
                Step {currentStepIndex + 1}/{STEPS.length} • You can enter “N/A” when information is not available.
              </div>
            ) : null}
          </div>
          <button onClick={onClose} className="px-3 py-2 rounded-xl border bg-white text-black">
            Close
          </button>
        </div>

        <div className="px-6 py-3 border-b flex flex-wrap gap-2">
          <button className={sectionButton(tab === "personal")} onClick={() => goToStep("personal")}
            type="button">
            Personal
          </button>
          <button className={sectionButton(tab === "education")} onClick={() => goToStep("education")}
            type="button">
            Education
          </button>
          <button className={sectionButton(tab === "social")} onClick={() => goToStep("social")}
            type="button">
            Social Welfare
          </button>
          <button className={sectionButton(tab === "licensure")} onClick={() => goToStep("licensure")}
            type="button">
            Licensure
          </button>
          <button className={sectionButton(tab === "employment")} onClick={() => goToStep("employment")}
            type="button">
            Employment
          </button>
          <button className={sectionButton(tab === "documents")} onClick={() => goToStep("documents")}
            type="button">
            Documents
          </button>
        </div>

        {error ? <div className="px-6 pt-4 text-sm text-red-600">{error}</div> : null}

        <div className="p-6 max-h-[70vh] overflow-auto">
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : tab === "personal" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Profile Image</div>
                <div className="mt-3 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-20 w-20 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
                      {docPreview.profile ? (
                        <img src={docPreview.profile} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-xs text-gray-500">No Photo</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 break-all">{app.profile_image_path || "Not uploaded"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {docPreview.profile ? (
                      <a
                        className="px-3 py-2 rounded-xl border bg-white text-sm text-blue-600"
                        href={docPreview.profile}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    ) : null}
                    <label className="px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold cursor-pointer">
                      Upload
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) =>
                          onPickFile(
                            BUCKETS.applicants,
                            "profile",
                            (path) => setApp((d) => ({ ...d, profile_image_path: path })),
                            e.target.files?.[0]
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setApp((d) => ({ ...d, profile_image_path: "" }))}
                      className="px-3 py-2 rounded-xl border bg-white text-black text-sm"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black md:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 mb-1">Custom ID</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setApp((d) => ({ ...d, custom_id: generateCustomId() }))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        onClick={() => setApp((d) => ({ ...d, custom_id: "" }))}
                        className="text-xs text-gray-600 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <input
                    value={app.custom_id}
                    onChange={(e) => setApp((d) => ({ ...d, custom_id: e.target.value }))}
                    placeholder="EMP-XXXXXXXX"
                    className="w-full border rounded-xl px-3 py-2"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">First Name</div>
                  <input value={app.first_name} onChange={(e) => setApp((d) => ({ ...d, first_name: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Middle Name</div>
                  <input value={app.middle_name} onChange={(e) => setApp((d) => ({ ...d, middle_name: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Last Name</div>
                  <input value={app.last_name} onChange={(e) => setApp((d) => ({ ...d, last_name: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Gender</div>
                  <select
                    value={(app.gender || "").trim().toUpperCase()}
                    onChange={(e) => setApp((d) => ({ ...d, gender: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="">—</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Birth Date</div>
                  <input type="date" value={app.birth_date}
                    onChange={(e) => setApp((d) => ({ ...d, birth_date: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Age</div>
                  <input value={app.age} onChange={(e) => setApp((d) => ({ ...d, age: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Phone Number</div>
                  <input value={app.client_contact_num}
                    onChange={(e) => setApp((d) => ({ ...d, client_contact_num: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black md:col-span-2">
                  <div className="text-gray-600 mb-1">Email Address</div>
                  <input value={app.client_email} onChange={(e) => setApp((d) => ({ ...d, client_email: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Emergency Contact</div>
                  <input value={app.emergency_contact_person}
                    onChange={(e) => setApp((d) => ({ ...d, emergency_contact_person: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Emergency Number</div>
                  <input value={app.emergency_contact_num}
                    onChange={(e) => setApp((d) => ({ ...d, emergency_contact_num: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Present Address</div>
                  <input value={app.present_address}
                    onChange={(e) => setApp((d) => ({ ...d, present_address: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Province Address</div>
                  <input value={app.province_address}
                    onChange={(e) => setApp((d) => ({ ...d, province_address: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Job Title</div>
                  <select
                    value={app.client_position}
                    onChange={(e) => setApp((d) => ({ ...d, client_position: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="">— Select Job Title —</option>
                    {jobTitleOptions.map((row) => (
                      <option key={row.title_id} value={row.title}>
                        {row.title}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={newJobTitle}
                      onChange={(e) => setNewJobTitle(e.target.value)}
                      placeholder="Add new job title"
                      className="w-full border rounded-xl px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={addJobTitleOption}
                      className="px-3 py-2 rounded-xl border bg-white text-black text-sm"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedJobTitle}
                      disabled={!normalizeJobTitle(app.client_position)}
                      className={`px-3 py-2 rounded-xl border bg-white text-black text-sm ${
                        !normalizeJobTitle(app.client_position) ? "opacity-60" : ""
                      }`}
                    >
                      Delete
                    </button>
                  </div>
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Detachment</div>
                  <input value={app.detachment}
                    onChange={(e) => setApp((d) => ({ ...d, detachment: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Hire Date</div>
                  <input
                    type="date"
                    value={app.date_hired_fsai}
                    onChange={(e) => setApp((d) => ({ ...d, date_hired_fsai: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2"
                  />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Status</div>
                  <div className="relative">
                    <select
                      value={normalizeStatus(app.status)}
                      onChange={(e) => setApp((d) => ({ ...d, status: normalizeStatus(e.target.value) }))}
                      className={`w-full border rounded-xl pl-9 pr-3 py-2 appearance-none bg-white ${
                        normalizeStatus(app.status) === "ACTIVE"
                          ? "border-emerald-300"
                          : normalizeStatus(app.status) === "INACTIVE"
                          ? "border-red-300"
                          : normalizeStatus(app.status) === "REASSIGN"
                          ? "border-orange-300"
                          : "border-gray-300"
                      }`}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="REASSIGN">REASSIGN</option>
                      <option value="RETIRED">RETIRED</option>
                    </select>
                    <span
                      className={`absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ${
                        normalizeStatus(app.status) === "ACTIVE"
                          ? "bg-emerald-500"
                          : normalizeStatus(app.status) === "INACTIVE"
                          ? "bg-red-500"
                          : normalizeStatus(app.status) === "REASSIGN"
                          ? "bg-orange-500"
                          : "bg-gray-500"
                      }`}
                    />
                  </div>
                </label>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Application Form Image</div>
                <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="text-xs text-gray-500 break-all">
                    {bio.applicant_form_path ? bio.applicant_form_path : "Not uploaded"}
                  </div>
                  <div className="flex items-center gap-2">
                    {docPreview.applicationForm ? (
                      <a className="px-3 py-2 rounded-xl border bg-white text-sm text-blue-600" href={docPreview.applicationForm} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : null}
                    <label className="px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold cursor-pointer">
                      Upload
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={(e) =>
                          onPickFile(
                            BUCKETS.certificates,
                            "application_form",
                            (path) => setBio((d) => ({ ...d, applicant_form_path: path })),
                            e.target.files?.[0]
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : tab === "education" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Education Attainment</div>
                  <input value={app.education_attainment}
                    onChange={(e) => setApp((d) => ({ ...d, education_attainment: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Course / Title / Degree</div>
                  <input value={certs.course_title_degree}
                    onChange={(e) => setCerts((d) => ({ ...d, course_title_degree: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">High School (When/Where)</div>
                  <input value={certs.highschool_when_where}
                    onChange={(e) => setCerts((d) => ({ ...d, highschool_when_where: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" placeholder="e.g. 2012-2016 • ABC High School" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">College (When/Where)</div>
                  <input value={certs.college_when_where}
                    onChange={(e) => setCerts((d) => ({ ...d, college_when_where: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" placeholder="e.g. 2016-2020 • XYZ University" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Vocational (When/Where)</div>
                  <input value={certs.vocational_when_where}
                    onChange={(e) => setCerts((d) => ({ ...d, vocational_when_where: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Course/Degree (When/Where)</div>
                  <input value={certs.course_when_where}
                    onChange={(e) => setCerts((d) => ({ ...d, course_when_where: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Training (When/Where)</div>
                  <input value={certs.training_when_where}
                    onChange={(e) => setCerts((d) => ({ ...d, training_when_where: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Seminar (When/Where)</div>
                  <input value={certs.seminar_when_where}
                    onChange={(e) => setCerts((d) => ({ ...d, seminar_when_where: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>
            </div>
          ) : tab === "social" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">SSS No.</div>
                <input value={app.sss_number}
                  onChange={(e) => setApp((d) => ({ ...d, sss_number: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Pag-ibig No.</div>
                <input value={app.pagibig_number}
                  onChange={(e) => setApp((d) => ({ ...d, pagibig_number: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Philhealth No.</div>
                <input value={app.philhealth_number}
                  onChange={(e) => setApp((d) => ({ ...d, philhealth_number: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">TIN</div>
                <input value={app.tin_number}
                  onChange={(e) => setApp((d) => ({ ...d, tin_number: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
            </div>
          ) : tab === "licensure" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Security License</div>
                  <input value={lic.security_license_number}
                    onChange={(e) => setLic((d) => ({ ...d, security_license_number: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Security Expiration</div>
                  <input type="date" value={lic.security_expiration}
                    onChange={(e) => setLic((d) => ({ ...d, security_expiration: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Driver License</div>
                  <input value={lic.driver_license_number}
                    onChange={(e) => setLic((d) => ({ ...d, driver_license_number: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Driver Expiration</div>
                  <input type="date" value={lic.driver_expiration}
                    onChange={(e) => setLic((d) => ({ ...d, driver_expiration: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Security License Number (Applicants)</div>
                <div className="text-xs text-gray-500 mt-1">Stored in applicants.security_licensed_num as well</div>
                <input value={app.security_licensed_num}
                  onChange={(e) => setApp((d) => ({ ...d, security_licensed_num: e.target.value }))}
                  className="mt-2 w-full border rounded-xl px-3 py-2" />
              </div>
            </div>
          ) : tab === "employment" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-black">Previous Employment</div>
                  <div className="text-xs text-gray-500">Add as many as needed.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setJobs((prev) => [...prev, { company_name: "", position: "", telephone: "", inclusive_dates: "", leave_reason: "" }])}
                  className="px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold"
                >
                  + Add
                </button>
              </div>

              {jobs.length === 0 ? (
                <div className="text-sm text-gray-500">No employment records yet.</div>
              ) : (
                <div className="space-y-4">
                  {jobs.map((j, idx) => (
                    <div key={j.employment_id ?? idx} className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-black">Record #{idx + 1}</div>
                        <button
                          type="button"
                          onClick={() => setJobs((prev) => prev.filter((_, i) => i !== idx))}
                          className="px-3 py-2 rounded-xl border bg-white text-black"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="text-sm text-black">
                          <div className="text-gray-600 mb-1">Company Name</div>
                          <input value={j.company_name}
                            onChange={(e) => setJobs((prev) => prev.map((p, i) => (i === idx ? { ...p, company_name: e.target.value } : p)))}
                            className="w-full border rounded-xl px-3 py-2" />
                        </label>
                        <label className="text-sm text-black">
                          <div className="text-gray-600 mb-1">Position</div>
                          <input value={j.position}
                            onChange={(e) => setJobs((prev) => prev.map((p, i) => (i === idx ? { ...p, position: e.target.value } : p)))}
                            className="w-full border rounded-xl px-3 py-2" />
                        </label>
                        <label className="text-sm text-black">
                          <div className="text-gray-600 mb-1">Telephone</div>
                          <input value={j.telephone}
                            onChange={(e) => setJobs((prev) => prev.map((p, i) => (i === idx ? { ...p, telephone: e.target.value } : p)))}
                            className="w-full border rounded-xl px-3 py-2" />
                        </label>
                        <label className="text-sm text-black">
                          <div className="text-gray-600 mb-1">Incl. Dates</div>
                          <input value={j.inclusive_dates}
                            onChange={(e) => setJobs((prev) => prev.map((p, i) => (i === idx ? { ...p, inclusive_dates: e.target.value } : p)))}
                            className="w-full border rounded-xl px-3 py-2" placeholder="e.g. Jan 2020 - Dec 2021" />
                        </label>
                        <label className="text-sm text-black md:col-span-2">
                          <div className="text-gray-600 mb-1">Leave Reason</div>
                          <input value={j.leave_reason}
                            onChange={(e) => setJobs((prev) => prev.map((p, i) => (i === idx ? { ...p, leave_reason: e.target.value } : p)))}
                            className="w-full border rounded-xl px-3 py-2" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Scanned Documents</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DocUploadRow
                    label="SSS Certain"
                    path={app.sss_certain_path}
                    url={docPreview.sss}
                    onSet={(path) => setApp((d) => ({ ...d, sss_certain_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "sss_certain", (p) => setApp((d) => ({ ...d, sss_certain_path: p })), file)}
                  />
                  <DocUploadRow
                    label="TIN ID"
                    path={app.tin_id_path}
                    url={docPreview.tin}
                    onSet={(path) => setApp((d) => ({ ...d, tin_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "tin_id", (p) => setApp((d) => ({ ...d, tin_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="PAG-IBIG ID"
                    path={app.pag_ibig_id_path}
                    url={docPreview.pagibig}
                    onSet={(path) => setApp((d) => ({ ...d, pag_ibig_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "pag_ibig", (p) => setApp((d) => ({ ...d, pag_ibig_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="PHILHEALTH ID"
                    path={app.philhealth_id_path}
                    url={docPreview.philhealth}
                    onSet={(path) => setApp((d) => ({ ...d, philhealth_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "philhealth", (p) => setApp((d) => ({ ...d, philhealth_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Security License"
                    path={app.security_license_path}
                    url={docPreview.securityLicense}
                    onSet={(path) => setApp((d) => ({ ...d, security_license_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.licensure, "security_license", (p) => setApp((d) => ({ ...d, security_license_path: p })), file)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Certificates</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DocUploadRow
                    label="Gun Safety Certificate"
                    path={certs.gun_safety_certificate_path}
                    url={docPreview.gunSafety}
                    onSet={(path) => setCerts((d) => ({ ...d, gun_safety_certificate_path: path }))}
                    onPick={(file) =>
                      onPickFile(
                        BUCKETS.certificates,
                        "gun_safety_certificate",
                        (p) => setCerts((d) => ({ ...d, gun_safety_certificate_path: p })),
                        file
                      )
                    }
                  />
                  <DocUploadRow
                    label="Training Certificate"
                    path={certs.training_path}
                    url={docPreview.training}
                    onSet={(path) => setCerts((d) => ({ ...d, training_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "training", (p) => setCerts((d) => ({ ...d, training_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Seminar Certificate"
                    path={certs.seminar_path}
                    url={docPreview.seminar}
                    onSet={(path) => setCerts((d) => ({ ...d, seminar_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "seminar", (p) => setCerts((d) => ({ ...d, seminar_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Highschool Diploma"
                    path={certs.highschool_diploma_path}
                    url={docPreview.hs}
                    onSet={(path) => setCerts((d) => ({ ...d, highschool_diploma_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "highschool_diploma", (p) => setCerts((d) => ({ ...d, highschool_diploma_path: p })), file)}
                  />
                  <DocUploadRow
                    label="College Diploma"
                    path={certs.college_diploma_path}
                    url={docPreview.college}
                    onSet={(path) => setCerts((d) => ({ ...d, college_diploma_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "college_diploma", (p) => setCerts((d) => ({ ...d, college_diploma_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Vocational"
                    path={certs.vocational_path}
                    url={docPreview.vocational}
                    onSet={(path) => setCerts((d) => ({ ...d, vocational_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "vocational", (p) => setCerts((d) => ({ ...d, vocational_path: p })), file)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {mode === "create" ? (
              <button
                type="button"
                disabled={saving || currentStepIndex === 0}
                onClick={goBack}
                className={`px-4 py-2 rounded-xl border bg-white text-black ${
                  saving || currentStepIndex === 0 ? "opacity-60" : ""
                }`}
              >
                Back
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-black">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={() => {
              if (mode === "create" && !isLastStep) {
                goNext();
                return;
              }
              save();
            }}
            className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${saving ? "opacity-70" : ""}`}
          >
            {saving ? "Saving…" : mode === "create" && !isLastStep ? "Next" : "Save"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocUploadRow({
  label,
  path,
  url,
  onSet,
  onPick,
}: {
  label: string;
  path: string;
  url: string | null;
  onSet: (path: string) => void;
  onPick: (file?: File | null) => void;
}) {
  return (
    <div className="rounded-2xl border p-3">
      <div className="text-sm font-semibold text-black">{label}</div>
      <div className="mt-1 text-xs text-gray-500 break-all">{path || "Not uploaded"}</div>
      <div className="mt-3 flex items-center gap-2">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl border bg-white text-sm text-blue-600"
          >
            View
          </a>
        ) : null}
        <label className="px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold cursor-pointer">
          Upload
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          onClick={() => onSet("")}
          className="px-3 py-2 rounded-xl border bg-white text-black text-sm"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
