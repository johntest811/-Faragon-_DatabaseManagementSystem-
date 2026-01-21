"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  first_name: string;
  middle_name: string;
  last_name: string;
  extn_name: string;
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
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  extn_name: string | null;
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

const BUCKETS = {
  profile: "Profile_Images",
  certificates: "certificates",
  sss: "SSS_CERTAIN",
  tin: "TIN_ID",
  pagibig: "PAG_IBIG_ID",
  philhealth: "PHILHEALTH_ID",
  securityLicense: "SECURITY_LICENSE",
} as const;

function emptyApplicantDraft(): ApplicantDraft {
  return {
    first_name: "",
    middle_name: "",
    last_name: "",
    extn_name: "",
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
  return v === "INACTIVE" ? "INACTIVE" : "ACTIVE";
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const [tab, setTab] = useState<
    "personal" | "education" | "social" | "licensure" | "employment" | "documents"
  >("personal");

  const [app, setApp] = useState<ApplicantDraft>(emptyApplicantDraft);
  const [certs, setCerts] = useState<CertificatesDraft>(emptyCertificatesDraft);
  const [lic, setLic] = useState<LicensureDraft>(emptyLicensureDraft);
  const [bio, setBio] = useState<BiodataDraft>(emptyBiodataDraft);
  const [jobs, setJobs] = useState<EmploymentItem[]>([]);

  const effectiveId = mode === "edit" ? applicantId ?? null : null;

  const docPreview = useMemo(() => {
    return {
      profile: publicUrl(BUCKETS.profile, app.profile_image_path || null),
      applicationForm: publicUrl(BUCKETS.certificates, bio.applicant_form_path || null),
      sss: publicUrl(BUCKETS.sss, app.sss_certain_path || null),
      tin: publicUrl(BUCKETS.tin, app.tin_id_path || null),
      pagibig: publicUrl(BUCKETS.pagibig, app.pag_ibig_id_path || null),
      philhealth: publicUrl(BUCKETS.philhealth, app.philhealth_id_path || null),
      securityLicense: publicUrl(BUCKETS.securityLicense, app.security_license_path || null),

      training: publicUrl(BUCKETS.certificates, certs.training_path || null),
      seminar: publicUrl(BUCKETS.certificates, certs.seminar_path || null),
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
      setApp(emptyApplicantDraft());
      setCerts(emptyCertificatesDraft());
      setLic(emptyLicensureDraft());
      setBio(emptyBiodataDraft());
      setJobs([]);
      return;
    }

    if (!effectiveId) return;

    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const aRes = await supabase
          .from("applicants")
          .select(
            "applicant_id, first_name, middle_name, last_name, extn_name, gender, birth_date, age, client_contact_num, client_email, present_address, province_address, emergency_contact_person, emergency_contact_num, education_attainment, date_hired_fsai, client_position, detachment, status, security_licensed_num, sss_number, pagibig_number, philhealth_number, tin_number, profile_image_path, sss_certain_path, tin_id_path, pag_ibig_id_path, philhealth_id_path, security_license_path"
          )
          .eq("applicant_id", effectiveId)
          .maybeSingle();

        if (aRes.error) throw aRes.error;

        const cRes = await supabase
          .from("certificates")
          .select(
            "course_title_degree, training_path, seminar_path, highschool_diploma_path, college_diploma_path, vocational_path, training_when_where, seminar_when_where, highschool_when_where, college_when_where, vocational_when_where, course_when_where"
          )
          .eq("applicant_id", effectiveId)
          .maybeSingle();

        const lRes = await supabase
          .from("licensure")
          .select("driver_license_number, driver_expiration, security_license_number, security_expiration")
          .eq("applicant_id", effectiveId)
          .maybeSingle();

        const bRes = await supabase
          .from("biodata")
          .select("applicant_form_path")
          .eq("applicant_id", effectiveId)
          .maybeSingle();

        // Employment: prefer employment_history (multi-row); fall back to employment_record.
        const hRes = await supabase
          .from("employment_history")
          .select("employment_id, company_name, position, telephone, inclusive_dates, leave_reason")
          .eq("applicant_id", effectiveId)
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
            .eq("applicant_id", effectiveId)
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
          first_name: a?.first_name ?? "",
          middle_name: a?.middle_name ?? "",
          last_name: a?.last_name ?? "",
          extn_name: a?.extn_name ?? "",
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
  }, [open, mode, effectiveId]);

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
    const id = mode === "edit" ? effectiveId : null;
    if (!id) {
      setError("Save the employee first before uploading documents.");
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
      // Required: Social Welfare
      if (
        !app.sss_number.trim() ||
        !app.pagibig_number.trim() ||
        !app.philhealth_number.trim() ||
        !app.tin_number.trim()
      ) {
        setTab("social");
        setError("Social Welfare fields are required: SSS No., Pag-ibig No., Philhealth No., and TIN.");
        setSaving(false);
        return;
      }

      // Required: at least one Education / Training field
      const hasAnyEducation = [
        app.education_attainment,
        certs.highschool_when_where,
        certs.college_when_where,
        certs.vocational_when_where,
        certs.course_title_degree,
        certs.course_when_where,
      ].some((v) => v.trim().length > 0);

      if (!hasAnyEducation) {
        setTab("education");
        setError(
          "At least one Education/Training field is required (High School, College, Vocational, or Course/Title/Degree)."
        );
        setSaving(false);
        return;
      }

      if (mode === "create") {
        if (!app.first_name.trim() || !app.last_name.trim()) {
          setError("First Name and Last Name are required");
          setSaving(false);
          return;
        }

        const aPayload: Record<string, string | number | null> = {
          first_name: toNullableText(app.first_name),
          middle_name: toNullableText(app.middle_name),
          last_name: toNullableText(app.last_name),
          extn_name: toNullableText(app.extn_name),
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

        const ins = await supabase.from("applicants").insert(aPayload).select("applicant_id").single();
        if (ins.error) throw ins.error;

        const newId = (ins.data as { applicant_id: string }).applicant_id;

        // Related tables (best-effort)
        await supabase.from("certificates").upsert({
          applicant_id: newId,
          course_title_degree: toNullableText(certs.course_title_degree),
          training_path: toNullableText(certs.training_path),
          seminar_path: toNullableText(certs.seminar_path),
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

        onSaved?.(newId);
        onClose();
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
          first_name: toNullableText(app.first_name),
          middle_name: toNullableText(app.middle_name),
          last_name: toNullableText(app.last_name),
          extn_name: toNullableText(app.extn_name),
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

      onSaved?.(effectiveId);
      onClose();
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
          </div>
          <button onClick={onClose} className="px-3 py-2 rounded-xl border bg-white text-black">
            Close
          </button>
        </div>

        <div className="px-6 py-3 border-b flex flex-wrap gap-2">
          <button className={sectionButton(tab === "personal")} onClick={() => setTab("personal")}
            type="button">
            Personal
          </button>
          <button className={sectionButton(tab === "education")} onClick={() => setTab("education")}
            type="button">
            Education
          </button>
          <button className={sectionButton(tab === "social")} onClick={() => setTab("social")}
            type="button">
            Social Welfare
          </button>
          <button className={sectionButton(tab === "licensure")} onClick={() => setTab("licensure")}
            type="button">
            Licensure
          </button>
          <button className={sectionButton(tab === "employment")} onClick={() => setTab("employment")}
            type="button">
            Employment
          </button>
          <button className={sectionButton(tab === "documents")} onClick={() => setTab("documents")}
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Extn</div>
                  <input value={app.extn_name} onChange={(e) => setApp((d) => ({ ...d, extn_name: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Gender</div>
                  <input value={app.gender} onChange={(e) => setApp((d) => ({ ...d, gender: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
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
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Email Address</div>
                  <input value={app.client_email} onChange={(e) => setApp((d) => ({ ...d, client_email: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Job Title</div>
                  <input value={app.client_position}
                    onChange={(e) => setApp((d) => ({ ...d, client_position: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Detachment</div>
                  <input value={app.detachment}
                    onChange={(e) => setApp((d) => ({ ...d, detachment: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
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
                          : "border-red-300"
                      }`}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                    <span
                      className={`absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ${
                        normalizeStatus(app.status) === "ACTIVE" ? "bg-emerald-500" : "bg-red-500"
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
                <div className="text-sm font-semibold text-black">Profile Image</div>
                <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="text-xs text-gray-500 break-all">{app.profile_image_path || "Not uploaded"}</div>
                  <div className="flex items-center gap-2">
                    {docPreview.profile ? (
                      <a className="px-3 py-2 rounded-xl border bg-white text-sm text-blue-600" href={docPreview.profile} target="_blank" rel="noreferrer">
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
                            BUCKETS.profile,
                            "profile",
                            (path) => setApp((d) => ({ ...d, profile_image_path: path })),
                            e.target.files?.[0]
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Scanned Documents</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DocUploadRow
                    label="SSS Certain"
                    path={app.sss_certain_path}
                    url={docPreview.sss}
                    onSet={(path) => setApp((d) => ({ ...d, sss_certain_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.sss, "sss_certain", (p) => setApp((d) => ({ ...d, sss_certain_path: p })), file)}
                  />
                  <DocUploadRow
                    label="TIN ID"
                    path={app.tin_id_path}
                    url={docPreview.tin}
                    onSet={(path) => setApp((d) => ({ ...d, tin_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.tin, "tin_id", (p) => setApp((d) => ({ ...d, tin_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="PAG-IBIG ID"
                    path={app.pag_ibig_id_path}
                    url={docPreview.pagibig}
                    onSet={(path) => setApp((d) => ({ ...d, pag_ibig_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.pagibig, "pag_ibig", (p) => setApp((d) => ({ ...d, pag_ibig_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="PHILHEALTH ID"
                    path={app.philhealth_id_path}
                    url={docPreview.philhealth}
                    onSet={(path) => setApp((d) => ({ ...d, philhealth_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.philhealth, "philhealth", (p) => setApp((d) => ({ ...d, philhealth_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Security License"
                    path={app.security_license_path}
                    url={docPreview.securityLicense}
                    onSet={(path) => setApp((d) => ({ ...d, security_license_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.securityLicense, "security_license", (p) => setApp((d) => ({ ...d, security_license_path: p })), file)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Certificates</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div className="px-6 pb-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-black">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={save}
            className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${saving ? "opacity-70" : ""}`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
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
