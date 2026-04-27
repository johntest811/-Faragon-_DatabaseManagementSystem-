"use client";

import { supabase } from "../../Client/SupabaseClients";

export type PersonnelExportSourceRow = {
  applicant_id: string;
};

export type PersonnelExportOptions = {
  codePrefix?: string;
  codeLabel?: string;
};

type ApplicantDetailRow = {
  applicant_id: string;
  created_at: string;
  custom_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  client_position: string | null;
  detachment: string | null;
  status: string | null;
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
  date_resigned: string | null;
  last_duty: string | null;
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
  applicant_id: string;
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
  applicant_id: string;
  driver_license_number: string | null;
  driver_expiration: string | null;
  security_license_number: string | null;
  security_expiration: string | null;
  insurance: string | null;
  insurance_expiration: string | null;
};

type BiodataRow = {
  applicant_id: string;
  applicant_form_path: string | null;
};

type EmploymentHistoryRow = {
  applicant_id: string;
  company_name: string | null;
  position: string | null;
  telephone: string | null;
  inclusive_dates: string | null;
  leave_reason: string | null;
};

type EmploymentRecordRow = {
  applicant_id: string;
  company_name: string | null;
  position: string | null;
  leave_reason: string | null;
};

type OtherDocumentRow = {
  applicant_id: string;
  label: string | null;
  bucket: string | null;
  file_path: string | null;
};

function safeText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value);
}

function shortCode(id: string, prefix = "EMP") {
  return `${prefix}-${id.slice(0, 2).toUpperCase()}-${id.slice(2, 5).toUpperCase()}`;
}

function getFullName(row: Partial<ApplicantDetailRow>) {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ").trim() || "(No name)";
}

function isMissingRelationError(error: unknown, relationName: string) {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return message.includes(relationName.toLowerCase()) && message.includes("does not exist");
}

export async function buildPersonnelDetailExportRows(
  sourceRows: PersonnelExportSourceRow[],
  options: PersonnelExportOptions = {}
) {
  const codePrefix = options.codePrefix ?? "EMP";
  const codeLabel = options.codeLabel ?? "Applicant Code";
  const ids = sourceRows.map((row) => String(row.applicant_id ?? "").trim()).filter(Boolean);
  if (!ids.length) return [] as Record<string, string>[];

  const [appRes, certRes, licRes, bioRes, employmentRes, legacyEmploymentRes, otherDocRes] = await Promise.all([
    supabase
      .from("applicants")
      .select(
        "applicant_id, created_at, custom_id, first_name, middle_name, last_name, client_position, detachment, status, gender, birth_date, age, client_contact_num, client_email, present_address, province_address, emergency_contact_person, emergency_contact_num, education_attainment, date_hired_fsai, date_resigned, last_duty, security_licensed_num, sss_number, pagibig_number, philhealth_number, tin_number, profile_image_path, sss_certain_path, tin_id_path, pag_ibig_id_path, philhealth_id_path, security_license_path"
      )
      .in("applicant_id", ids),
    supabase
      .from("certificates")
      .select(
        "applicant_id, course_title_degree, training_path, seminar_path, gun_safety_certificate_path, highschool_diploma_path, college_diploma_path, vocational_path, training_when_where, seminar_when_where, highschool_when_where, college_when_where, vocational_when_where, course_when_where"
      )
      .in("applicant_id", ids),
    supabase
      .from("licensure")
      .select(
        "applicant_id, driver_license_number, driver_expiration, security_license_number, security_expiration, insurance, insurance_expiration"
      )
      .in("applicant_id", ids),
    supabase.from("biodata").select("applicant_id, applicant_form_path").in("applicant_id", ids),
    supabase
      .from("employment_history")
      .select("applicant_id, company_name, position, telephone, inclusive_dates, leave_reason")
      .in("applicant_id", ids)
      .order("created_at", { ascending: true }),
    supabase.from("employment_record").select("applicant_id, company_name, position, leave_reason").in("applicant_id", ids),
    supabase.from("applicant_other_documents").select("applicant_id, label, bucket, file_path").in("applicant_id", ids),
  ]);

  if (appRes.error) throw appRes.error;

  const applicantMap = new Map<string, ApplicantDetailRow>(
    ((appRes.data as ApplicantDetailRow[]) ?? []).map((row) => [row.applicant_id, row])
  );
  const certMap = new Map<string, CertificatesRow>(
    ((certRes.data as CertificatesRow[]) ?? []).map((row) => [row.applicant_id, row])
  );
  const licMap = new Map<string, LicensureRow>(
    ((licRes.data as LicensureRow[]) ?? []).map((row) => [row.applicant_id, row])
  );
  const bioMap = new Map<string, BiodataRow>(
    ((bioRes.data as BiodataRow[]) ?? []).map((row) => [row.applicant_id, row])
  );

  const employmentMap = new Map<string, EmploymentHistoryRow[]>();
  if (!employmentRes.error) {
    for (const row of ((employmentRes.data as EmploymentHistoryRow[]) ?? [])) {
      const current = employmentMap.get(row.applicant_id) ?? [];
      current.push(row);
      employmentMap.set(row.applicant_id, current);
    }
  } else {
    console.warn(employmentRes.error);
  }

  if (employmentMap.size === 0 && !legacyEmploymentRes.error) {
    for (const legacyRow of ((legacyEmploymentRes.data as EmploymentRecordRow[]) ?? [])) {
      const current = employmentMap.get(legacyRow.applicant_id) ?? [];
      current.push({
        applicant_id: legacyRow.applicant_id,
        company_name: legacyRow.company_name,
        position: legacyRow.position,
        telephone: null,
        inclusive_dates: null,
        leave_reason: legacyRow.leave_reason,
      });
      employmentMap.set(legacyRow.applicant_id, current);
    }
  }

  const otherDocMap = new Map<string, OtherDocumentRow[]>();
  if (!otherDocRes.error) {
    for (const row of ((otherDocRes.data as OtherDocumentRow[]) ?? [])) {
      const current = otherDocMap.get(row.applicant_id) ?? [];
      current.push(row);
      otherDocMap.set(row.applicant_id, current);
    }
  } else if (!isMissingRelationError(otherDocRes.error, "applicant_other_documents")) {
    console.warn(otherDocRes.error);
  }

  return sourceRows.map((sourceRow) => {
    const applicantId = String(sourceRow.applicant_id ?? "").trim();
    const applicant = applicantMap.get(applicantId) ?? ({} as ApplicantDetailRow);
    const cert = certMap.get(applicantId);
    const lic = licMap.get(applicantId);
    const bio = bioMap.get(applicantId);
    const jobs = employmentMap.get(applicantId) ?? [];
    const otherDocs = otherDocMap.get(applicantId) ?? [];

    return {
      "Applicant ID": applicantId,
      [codeLabel]: shortCode(applicantId, codePrefix),
      "Custom ID": safeText(applicant.custom_id),
      Name: getFullName(applicant),
      Position: safeText(applicant.client_position),
      Detachment: safeText(applicant.detachment),
      Status: safeText(applicant.status),
      Gender: safeText(applicant.gender),
      "Birth Date": safeText(applicant.birth_date),
      Age: safeText(applicant.age),
      "Contact Number": safeText(applicant.client_contact_num),
      Email: safeText(applicant.client_email),
      "Present Address": safeText(applicant.present_address),
      "Province Address": safeText(applicant.province_address),
      "Emergency Contact": safeText(applicant.emergency_contact_person),
      "Emergency Number": safeText(applicant.emergency_contact_num),
      "Education Attainment": safeText(applicant.education_attainment),
      "Date Hired": safeText(applicant.date_hired_fsai),
      "Date Resigned": safeText(applicant.date_resigned),
      "Last Duty": safeText(applicant.last_duty),
      "Security Licensed No.": safeText(applicant.security_licensed_num),
      "SSS Number": safeText(applicant.sss_number),
      "Pag-IBIG Number": safeText(applicant.pagibig_number),
      "Philhealth Number": safeText(applicant.philhealth_number),
      "TIN Number": safeText(applicant.tin_number),
      "Driver License Number": safeText(lic?.driver_license_number),
      "Driver Expiration": safeText(lic?.driver_expiration),
      "Security License Number": safeText(lic?.security_license_number),
      "Security Expiration": safeText(lic?.security_expiration),
      Insurance: safeText(lic?.insurance),
      "Insurance Expiration": safeText(lic?.insurance_expiration),
      "Course Title Degree": safeText(cert?.course_title_degree),
      "Training When/Where": safeText(cert?.training_when_where),
      "Seminar When/Where": safeText(cert?.seminar_when_where),
      "Highschool When/Where": safeText(cert?.highschool_when_where),
      "College When/Where": safeText(cert?.college_when_where),
      "Vocational When/Where": safeText(cert?.vocational_when_where),
      "Course When/Where": safeText(cert?.course_when_where),
      "Application Form Path": safeText(bio?.applicant_form_path),
      "Profile Image Path": safeText(applicant.profile_image_path),
      "SSS Certain Path": safeText(applicant.sss_certain_path),
      "TIN ID Path": safeText(applicant.tin_id_path),
      "PAG-IBIG ID Path": safeText(applicant.pag_ibig_id_path),
      "Philhealth ID Path": safeText(applicant.philhealth_id_path),
      "Security License Path": safeText(applicant.security_license_path),
      "Training Certificate Path": safeText(cert?.training_path),
      "Seminar Certificate Path": safeText(cert?.seminar_path),
      "Gun Safety Certificate Path": safeText(cert?.gun_safety_certificate_path),
      "Highschool Diploma Path": safeText(cert?.highschool_diploma_path),
      "College Diploma Path": safeText(cert?.college_diploma_path),
      "Vocational Path": safeText(cert?.vocational_path),
      "Employment History": jobs
        .map(
          (job, idx) =>
            `${idx + 1}) ${safeText(job.company_name)} | ${safeText(job.position)} | ${safeText(job.telephone)} | ${safeText(job.inclusive_dates)} | ${safeText(job.leave_reason)}`
        )
        .join(" ; "),
      "Other Documents": otherDocs
        .map((doc, idx) => `${idx + 1}) ${safeText(doc.label) || `Other Document ${idx + 1}`} [${safeText(doc.bucket)}] ${safeText(doc.file_path)}`)
        .join(" ; "),
      "Created At": safeText(applicant.created_at),
    };
  });
}
