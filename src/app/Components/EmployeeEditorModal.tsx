"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { supabase } from "../Client/SupabaseClients";
import * as XLSX from "xlsx";
import LoadingCircle from "./LoadingCircle";

type Mode = "create" | "edit";

export type EmployeeEditorModalProps = {
  open: boolean;
  mode: Mode;
  applicantId?: string | null;
  defaultStatus?: string;
  title?: string;
  subtitle?: string;
  idNumberLabel?: string;
  showIdGenerate?: boolean;
  onClose: () => void;
  onSaved?: (applicantId: string, status: string) => void;
  onDeleted?: (applicantId: string) => void;
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

  date_resigned: string;
  last_duty: string;

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

type OtherDocumentItem = {
  document_id?: string;
  label: string;
  bucket: string;
  path: string;
};

type OtherDocumentRow = {
  document_id: string;
  label: string | null;
  bucket: string | null;
  file_path: string | null;
};

type JobTitleRow = {
  title_id: string;
  title: string;
};

type DetachmentOption = {
  area: string;
  clientName: string | null;
  projectName: string | null;
  contractNo: string | null;
};

const BUCKETS = {
  applicants: "applicants",
  certificates: "certificates",
  licensure: "licensure",
} as const;

const GENERAL_DOCUMENT_ACCEPT =
  "image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,application/zip,application/x-rar-compressed,application/vnd.rar";

function emptyApplicantDraft(defaultStatus = "ACTIVE"): ApplicantDraft {
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
    status: normalizeStatus(defaultStatus),

    date_resigned: "",
    last_duty: "",

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

function calculateAgeFromBirthDate(value: string | null | undefined) {
  if (!value) return "";
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  const birthdayNotReached =
    monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate());

  if (birthdayNotReached) age -= 1;
  return age >= 0 && age < 130 ? String(age) : "";
}

function normalizeStatus(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "APPLICANT") return "APPLICANT";
  if (v === "AWOL" || v === "REASSIGN") return "AWOL";
  if (v === "RETIRED") return "RETIRED";
  if (v === "RESIGNED") return "RESIGNED";
  if (v === "FLOATING") return "FLOATING";
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

function toNullableUpperText(value: string) {
  const v = value.trim().replace(/\s+/g, " ").toUpperCase();
  return v.length ? v : null;
}

function formatPhilippineMobileNumber(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  let localDigits = digits;
  if (localDigits.startsWith("639")) {
    localDigits = `0${localDigits.slice(2)}`;
  } else if (localDigits.startsWith("9")) {
    localDigits = `0${localDigits}`;
  }

  localDigits = localDigits.slice(0, 11);
  if (localDigits.length <= 1) {
    return `+${localDigits}`;
  }

  if (!localDigits.startsWith("09")) {
    localDigits = `09${localDigits.replace(/^0+/, "").slice(0, 9)}`;
  }

  return `+${localDigits.slice(0, 11)}`;
}

type EducationWhenWhereKey = "highschool_when_where" | "college_when_where" | "vocational_when_where";

function splitEducationNameYear(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return { name: "", year: "" };

  const explicitParts = text
    .split(/\s*(?:\||\u2022|\s+-\s+)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (explicitParts.length >= 2) {
    const first = explicitParts[0];
    const rest = explicitParts.slice(1).join(" - ");
    if (/^\d{4}(?:\s*-\s*\d{4})?$/.test(first) && !/\b\d{4}\b/.test(rest)) return { name: rest, year: first };
    return { name: first, year: rest };
  }

  const yearFirst = text.match(/^(\d{4}(?:\s*-\s*\d{4})?)\s+(.+)$/);
  if (yearFirst) {
    return { name: yearFirst[2].replace(/^[^A-Za-z0-9]+/, "").trim(), year: yearFirst[1].trim() };
  }

  const parts = text
    .split(/\s*(?:\||-|•|â€¢)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const first = parts[0];
    const rest = parts.slice(1).join(" - ");
    if (/\b\d{4}\b/.test(first) && !/\b\d{4}\b/.test(rest)) return { name: rest, year: first };
    return { name: first, year: rest };
  }

  return { name: text, year: "" };
}

function joinEducationNameYear(name: string, year: string) {
  const cleanName = name.trim();
  const cleanYear = year.trim();
  if (cleanName && cleanYear) return `${cleanName} - ${cleanYear}`;
  return cleanName || cleanYear;
}

function collapseWhitespace(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeDocumentBucket(value: string | null | undefined) {
  return value === "applicants" || value === "licensure" || value === "certificates"
    ? value
    : "certificates";
}

function inferDocumentLabelFromFileName(fileName: string | null | undefined) {
  const trimmed = String(fileName ?? "").trim();
  if (!trimmed) return "";
  const withoutExtension = trimmed.replace(/\.[^/.]+$/, "");
  return collapseWhitespace(withoutExtension.replace(/[_-]+/g, " "));
}

function inferDocumentLabelFromPath(path: string | null | undefined) {
  const storagePath = String(path ?? "").trim();
  if (!storagePath) return "";
  const fileName = storagePath.split("/").filter(Boolean).pop() ?? "";
  if (!fileName) return "";
  const withoutGeneratedPrefix = fileName.replace(/^[A-Za-z0-9_]+-\d{10,}-/, "");
  return inferDocumentLabelFromFileName(withoutGeneratedPrefix);
}

function resolveOtherDocumentLabel(label: string | null | undefined, path: string | null | undefined, fallbackIndex?: number) {
  const manualLabel = collapseWhitespace(label);
  if (manualLabel) return manualLabel;
  const derivedLabel = inferDocumentLabelFromPath(path);
  if (derivedLabel) return derivedLabel;
  return fallbackIndex != null ? `Document ${fallbackIndex + 1}` : "Document";
}

function toNullableInt(value: string) {
  const v = value.trim();
  if (!v) return null;
  const num = Number(v);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatDigitGroups(value: string, groupSizes: number[]) {
  const maxDigits = groupSizes.reduce((sum, size) => sum + size, 0);
  const digits = onlyDigits(value).slice(0, maxDigits);
  const groups: string[] = [];
  let cursor = 0;

  for (const size of groupSizes) {
    const part = digits.slice(cursor, cursor + size);
    if (!part) break;
    groups.push(part);
    cursor += size;
  }

  return groups.join("-");
}

function formatSssNumber(value: string) {
  return formatDigitGroups(value, [2, 7, 1]);
}

function formatPhilhealthNumber(value: string) {
  return formatDigitGroups(value, [2, 9, 1]);
}

function formatPagibigNumber(value: string) {
  return formatDigitGroups(value, [4, 4, 4]);
}

function formatTinNumber(value: string) {
  const digits = onlyDigits(value).slice(0, 12);
  return formatDigitGroups(digits, digits.length > 9 ? [3, 3, 3, 3] : [3, 3, 3]);
}

function validateSocialWelfareValues(app: ApplicantDraft) {
  const checks = [
    { label: "SSS No.", digits: onlyDigits(app.sss_number), validLengths: [10], example: "12-3456789-0" },
    { label: "PhilHealth No.", digits: onlyDigits(app.philhealth_number), validLengths: [12], example: "12-345678901-2" },
    { label: "Pag-IBIG No.", digits: onlyDigits(app.pagibig_number), validLengths: [12], example: "1234-5678-9012" },
    { label: "TIN", digits: onlyDigits(app.tin_number), validLengths: [9, 12], example: "123-456-789 or 123-456-789-000" },
  ];

  const missing = checks.filter((item) => !item.digits).map((item) => item.label);
  if (missing.length) return `Please complete Social Welfare before continuing: ${missing.join(", ")}.`;

  const invalid = checks.filter((item) => !item.validLengths.includes(item.digits.length));
  if (invalid.length) {
    return invalid.map((item) => `${item.label} must match ${item.example}.`).join(" ");
  }

  return "";
}

function getLegacyAdminId(): string | null {
  try {
    const raw = localStorage.getItem("adminSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown };
    const id = String(parsed?.id ?? "").trim();
    return id || null;
  } catch {
    return null;
  }
}

function sectionButton(active: boolean) {
  return `px-3 py-2 rounded-xl border text-sm ${active ? "bg-[#FFDA03] text-black border-[#FFDA03]" : "bg-white text-black"}`;
}

function isMissingRelationError(error: unknown, relationName: string) {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return message.includes(relationName.toLowerCase()) && message.includes("does not exist");
}

function getFileExtension(fileName: string) {
  const trimmed = fileName.trim().toLowerCase();
  const parts = trimmed.split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const ext = nextExtension.replace(/^\./, "");
  return fileName.replace(/\.[^/.]+$/, "") + (ext ? `.${ext}` : "");
}

function mimeTypeForExtension(extension: string) {
  switch (extension) {
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    case "rar":
      return "application/vnd.rar";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "";
  }
}

function isAllowedGeneralDocument(file: File) {
  const extension = getFileExtension(file.name);
  if (file.type.startsWith("image/")) return true;
  return ["pdf", "doc", "docx", "xls", "xlsx", "zip", "rar"].includes(extension);
}

function canCompressImage(extension: string) {
  return ["jpg", "jpeg", "png", "webp", "bmp"].includes(extension);
}

function canRepackOfficeDocument(extension: string) {
  return ["docx", "docm", "dotx"].includes(extension);
}

function canRewriteSpreadsheet(extension: string) {
  return ["xlsx", "xlsm"].includes(extension);
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to process image upload."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImageUpload(file: File) {
  const extension = getFileExtension(file.name);
  if (!canCompressImage(extension)) return file;

  try {
    const image = await loadImageElement(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return file;

    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const nextWidth = Math.max(1, Math.round(width * scale));
    const nextHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, nextWidth, nextHeight);

    const targetMime = extension === "png" ? "image/webp" : extension === "webp" ? "image/webp" : "image/jpeg";
    const targetExtension = targetMime === "image/jpeg" ? "jpg" : "webp";
    const blob = await canvasToBlob(canvas, targetMime, 0.82);
    if (!blob || blob.size >= file.size * 0.98) return file;

    return new File([blob], replaceFileExtension(file.name, targetExtension), {
      type: targetMime,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

async function recompressOfficeDocument(file: File) {
  const extension = getFileExtension(file.name);
  if (!canRepackOfficeDocument(extension)) return file;

  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
    if (blob.size >= file.size * 0.98) return file;

    return new File([blob], file.name, {
      type: file.type || mimeTypeForExtension(extension),
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

async function recompressSpreadsheet(file: File) {
  const extension = getFileExtension(file.name);
  if (!canRewriteSpreadsheet(extension)) return file;

  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const output = XLSX.write(workbook, {
      type: "array",
      bookType: extension === "xlsm" ? "xlsm" : "xlsx",
      compression: true,
    });
    const blob = new Blob([output], {
      type: file.type || mimeTypeForExtension(extension),
    });
    if (blob.size >= file.size * 0.98) return file;

    return new File([blob], file.name, {
      type: file.type || mimeTypeForExtension(extension),
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

async function optimizeUploadFile(file: File) {
  const extension = getFileExtension(file.name);

  if (file.type.startsWith("image/")) {
    return compressImageUpload(file);
  }
  if (canRewriteSpreadsheet(extension)) {
    return recompressSpreadsheet(file);
  }
  if (canRepackOfficeDocument(extension)) {
    return recompressOfficeDocument(file);
  }
  return file;
}

export default function EmployeeEditorModal({
  open,
  mode,
  applicantId,
  defaultStatus = "ACTIVE",
  title,
  subtitle,
  idNumberLabel = "ID Number Employee",
  showIdGenerate = false,
  onClose,
  onSaved,
  onDeleted,
}: EmployeeEditorModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>("");
  const [uploadingFileKey, setUploadingFileKey] = useState<string | null>(null);

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

  const [app, setApp] = useState<ApplicantDraft>(() => emptyApplicantDraft(defaultStatus));
  const [certs, setCerts] = useState<CertificatesDraft>(emptyCertificatesDraft);
  const [lic, setLic] = useState<LicensureDraft>(emptyLicensureDraft);
  const [bio, setBio] = useState<BiodataDraft>(emptyBiodataDraft);
  const [jobs, setJobs] = useState<EmploymentItem[]>([]);
  const [otherDocs, setOtherDocs] = useState<OtherDocumentItem[]>([]);
  const [jobTitleOptions, setJobTitleOptions] = useState<JobTitleRow[]>([]);
  const [detachmentOptions, setDetachmentOptions] = useState<DetachmentOption[]>([]);
  const [detachmentOptionsLoading, setDetachmentOptionsLoading] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [jobTitlesSource, setJobTitlesSource] = useState<"table" | "applicants">("table");

  const highSchoolEducation = splitEducationNameYear(certs.highschool_when_where);
  const collegeEducation = splitEducationNameYear(certs.college_when_where);
  const vocationalEducation = splitEducationNameYear(certs.vocational_when_where);

  function updateEducationNameYearField(field: EducationWhenWhereKey, part: "name" | "year", value: string) {
    setCerts((draft) => {
      const current = splitEducationNameYear(draft[field]);
      const next = { ...current, [part]: value };
      return { ...draft, [field]: joinEducationNameYear(next.name, next.year) };
    });
  }


  const effectiveId = mode === "edit" ? applicantId ?? null : draftApplicantId;

  useEffect(() => {
    const computedAge = calculateAgeFromBirthDate(app.birth_date);
    setApp((draft) => (draft.age === computedAge ? draft : { ...draft, age: computedAge }));
  }, [app.birth_date]);

  const currentStepIndex = useMemo(() => STEPS.indexOf(tab as Step), [STEPS, tab]);
  const isLastStep = currentStepIndex === STEPS.length - 1;

  function canNavigateTo(step: Step) {
    if (mode === "edit") return true;
    const idx = STEPS.indexOf(step);
    return idx <= maxStepIndex;
  }

  function canAdvancePastSocial(nextStep?: Step) {
    const socialStepIndex = STEPS.indexOf("social");
    const targetIndex = nextStep ? STEPS.indexOf(nextStep) : currentStepIndex + 1;
    if (targetIndex <= socialStepIndex) return true;

    const socialError = validateSocialWelfareValues(app);
    if (!socialError) return true;

    setTab("social");
    setError(socialError);
    return false;
  }

  function goToStep(step: Step) {
    if (!canAdvancePastSocial(step)) return;

    if (canNavigateTo(step)) {
      setTab(step);
      // setError("");
      return;
    }
    setError("Please use Next to proceed chronologically. You can go back anytime.");
  }

  function goNext() {
    if (!canAdvancePastSocial(STEPS[Math.min(currentStepIndex + 1, STEPS.length - 1)])) return;

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
      setApp(emptyApplicantDraft(defaultStatus));
      setCerts(emptyCertificatesDraft());
      setLic(emptyLicensureDraft());
      setBio(emptyBiodataDraft());
      setJobs([]);
      setOtherDocs([]);
      return;
    }

    const idToLoad = mode === "edit" ? applicantId ?? null : null;
    if (!idToLoad) return;

    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const [aRes, cRes, lRes, bRes, odRes, hRes] = await Promise.all([
          supabase
            .from("applicants")
            .select(
              "applicant_id, custom_id, first_name, middle_name, last_name, gender, birth_date, age, client_contact_num, client_email, present_address, province_address, emergency_contact_person, emergency_contact_num, education_attainment, date_hired_fsai, client_position, detachment, status, date_resigned, last_duty, security_licensed_num, sss_number, pagibig_number, philhealth_number, tin_number, profile_image_path, sss_certain_path, tin_id_path, pag_ibig_id_path, philhealth_id_path, security_license_path"
            )
            .eq("applicant_id", idToLoad)
            .maybeSingle(),
          supabase
            .from("certificates")
            .select(
              "course_title_degree, training_path, seminar_path, gun_safety_certificate_path, highschool_diploma_path, college_diploma_path, vocational_path, training_when_where, seminar_when_where, highschool_when_where, college_when_where, vocational_when_where, course_when_where"
            )
            .eq("applicant_id", idToLoad)
            .maybeSingle(),
          supabase
            .from("licensure")
            .select("driver_license_number, driver_expiration, security_license_number, security_expiration")
            .eq("applicant_id", idToLoad)
            .maybeSingle(),
          supabase
            .from("biodata")
            .select("applicant_form_path")
            .eq("applicant_id", idToLoad)
            .maybeSingle(),
          supabase
            .from("applicant_other_documents")
            .select("document_id, label, bucket, file_path")
            .eq("applicant_id", idToLoad)
            .order("created_at", { ascending: true }),
          supabase
            .from("employment_history")
            .select("employment_id, company_name, position, telephone, inclusive_dates, leave_reason")
            .eq("applicant_id", idToLoad)
            .order("created_at", { ascending: true }),
        ]);

        if (aRes.error) throw aRes.error;

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
          age: calculateAgeFromBirthDate(a?.birth_date) || (a?.age != null ? String(a.age) : ""),
          client_contact_num: formatPhilippineMobileNumber(a?.client_contact_num ?? ""),
          client_email: a?.client_email ?? "",
          present_address: a?.present_address ?? "",
          province_address: a?.province_address ?? "",
          emergency_contact_person: a?.emergency_contact_person ?? "",
          emergency_contact_num: formatPhilippineMobileNumber(a?.emergency_contact_num ?? ""),
          education_attainment: a?.education_attainment ?? "",
          date_hired_fsai: normalizeDateInput(a?.date_hired_fsai ?? null),
          client_position: a?.client_position ?? "",
          detachment: a?.detachment ?? "",
          status: normalizeStatus(a?.status),

          date_resigned: normalizeDateInput(a?.date_resigned ?? null),
          last_duty: normalizeDateInput(a?.last_duty ?? null),

          security_licensed_num: a?.security_licensed_num ?? "",
          sss_number: formatSssNumber(a?.sss_number ?? ""),
          pagibig_number: formatPagibigNumber(a?.pagibig_number ?? ""),
          philhealth_number: formatPhilhealthNumber(a?.philhealth_number ?? ""),
          tin_number: formatTinNumber(a?.tin_number ?? ""),

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
        if (odRes.error) {
          if (!isMissingRelationError(odRes.error, "applicant_other_documents")) {
            console.warn(odRes.error);
          }
          setOtherDocs([]);
        } else {
          const docs = ((odRes.data ?? []) as unknown as OtherDocumentRow[]).map((row, index) => ({
            document_id: row.document_id,
            label: resolveOtherDocumentLabel(row.label, row.file_path, index),
            bucket: normalizeDocumentBucket(row.bucket),
            path: row.file_path ?? "",
          }));
          setOtherDocs(docs);
        }
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
  }, [open, mode, applicantId, defaultStatus]);

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadDetachmentOptions() {
      setDetachmentOptionsLoading(true);
      try {
        const res = await supabase
          .from("contracts")
          .select("specific_area, client_name, project_name, contract_no")
          .not("specific_area", "is", null)
          .order("specific_area", { ascending: true })
          .limit(2000);

        if (cancelled) return;
        if (res.error) {
          console.warn(res.error);
          setDetachmentOptions([]);
          return;
        }

        const unique = new Map<string, DetachmentOption>();
        for (const row of ((res.data ?? []) as Array<Record<string, unknown>>)) {
          const area = collapseWhitespace(row.specific_area == null ? "" : String(row.specific_area));
          if (!area) continue;
          const key = area.toLowerCase();
          if (unique.has(key)) continue;
          unique.set(key, {
            area,
            clientName: row.client_name == null ? null : String(row.client_name),
            projectName: row.project_name == null ? null : String(row.project_name),
            contractNo: row.contract_no == null ? null : String(row.contract_no),
          });
        }

        setDetachmentOptions(Array.from(unique.values()).sort((a, b) => a.area.localeCompare(b.area)));
      } finally {
        if (!cancelled) setDetachmentOptionsLoading(false);
      }
    }

    void loadDetachmentOptions();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const detachmentChoices = useMemo(() => {
    const current = collapseWhitespace(app.detachment);
    const list = [...detachmentOptions];
    if (current && !list.some((option) => option.area.toLowerCase() === current.toLowerCase())) {
      list.unshift({
        area: current,
        clientName: null,
        projectName: null,
        contractNo: "Current value",
      });
    }
    return list;
  }, [app.detachment, detachmentOptions]);

  async function uploadToBucket(bucket: string, id: string, file: File, prefix: string) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${id}/${prefix}-${Date.now()}-${safeName}`;
    const upRes = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || mimeTypeForExtension(getFileExtension(file.name)) || undefined,
      upsert: true,
    });
    if (upRes.error) throw upRes.error;
    return path;
  }

  async function onPickFile(
    bucket: string,
    prefix: string,
    setter: (path: string, file?: File) => void,
    file?: File | null
  ) {
    if (!file) return;
    if (!isAllowedGeneralDocument(file)) {
      setError("Unsupported file type. Allowed uploads: images, PDF, Word, Excel, ZIP, and RAR files.");
      return;
    }
    const id = effectiveId;
    if (!id) {
      setError("Missing employee id; please try reopening the modal.");
      return;
    }
    setError("");
    setUploadingFileKey(prefix);
    try {
      const optimizedFile = await optimizeUploadFile(file);
      const path = await uploadToBucket(bucket, id, optimizedFile, prefix);
      setter(path, optimizedFile);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingFileKey((current) => (current === prefix ? null : current));
    }
  }

  async function save() {
    setError("");

    const socialError = validateSocialWelfareValues(app);
    if (socialError) {
      setTab("social");
      setError(socialError);
      return;
    }

    setSaving(true);

    try {
      const nextStatus = normalizeStatus(app.status);
      const isRetired = nextStatus === "RETIRED";
      const shouldPersistResignedFields = nextStatus === "RESIGNED" || nextStatus === "RETIRED";
      const legacyAdminId = getLegacyAdminId();
      const retiredAt = isRetired ? new Date().toISOString() : null;
      const retiredDate = isRetired ? new Date().toISOString().slice(0, 10) : null;
      const retiredReason = isRetired ? "N/A" : null;
      const computedAge = calculateAgeFromBirthDate(app.birth_date);
      const formattedClientContact = formatPhilippineMobileNumber(app.client_contact_num);
      const formattedEmergencyContact = formatPhilippineMobileNumber(app.emergency_contact_num);

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
          custom_id: toNullableUpperText(app.custom_id),
          first_name: toNullableUpperText(app.first_name),
          middle_name: toNullableUpperText(app.middle_name),
          last_name: toNullableUpperText(app.last_name),
          gender: toNullableUpperText(app.gender),
          birth_date: toNullableText(app.birth_date),
          age: toNullableInt(computedAge),
          client_contact_num: toNullableText(formattedClientContact),
          client_email: toNullableText(app.client_email),
          present_address: toNullableUpperText(app.present_address),
          province_address: toNullableUpperText(app.province_address),
          emergency_contact_person: toNullableUpperText(app.emergency_contact_person),
          emergency_contact_num: toNullableText(formattedEmergencyContact),
          education_attainment: toNullableUpperText(app.education_attainment),
          date_hired_fsai: toNullableText(app.date_hired_fsai),
          client_position: toNullableUpperText(app.client_position),
          detachment: toNullableUpperText(app.detachment),
          status: nextStatus,

          date_resigned: shouldPersistResignedFields ? toNullableText(app.date_resigned) : null,
          last_duty: shouldPersistResignedFields ? toNullableUpperText(app.last_duty) : null,

          retired_date: retiredDate,
          retired_reason: retiredReason,
          retired_at: retiredAt,
          retired_by: isRetired ? legacyAdminId : null,

          security_licensed_num: toNullableUpperText(app.security_licensed_num),
          sss_number: toNullableUpperText(app.sss_number),
          pagibig_number: toNullableUpperText(app.pagibig_number),
          philhealth_number: toNullableUpperText(app.philhealth_number),
          tin_number: toNullableUpperText(app.tin_number),

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
          course_title_degree: toNullableUpperText(certs.course_title_degree),
          training_path: toNullableText(certs.training_path),
          seminar_path: toNullableText(certs.seminar_path),
          gun_safety_certificate_path: toNullableText(certs.gun_safety_certificate_path),
          highschool_diploma_path: toNullableText(certs.highschool_diploma_path),
          college_diploma_path: toNullableText(certs.college_diploma_path),
          vocational_path: toNullableText(certs.vocational_path),
          training_when_where: toNullableUpperText(certs.training_when_where),
          seminar_when_where: toNullableUpperText(certs.seminar_when_where),
          highschool_when_where: toNullableUpperText(certs.highschool_when_where),
          college_when_where: toNullableUpperText(certs.college_when_where),
          vocational_when_where: toNullableUpperText(certs.vocational_when_where),
          course_when_where: toNullableUpperText(certs.course_when_where),
        });

        await supabase.from("licensure").upsert({
          applicant_id: newId,
          driver_license_number: toNullableUpperText(lic.driver_license_number),
          driver_expiration: toNullableText(lic.driver_expiration),
          security_license_number: toNullableUpperText(lic.security_license_number),
          security_expiration: toNullableText(lic.security_expiration),
        });

        await supabase.from("biodata").upsert({
          applicant_id: newId,
          applicant_form_path: toNullableText(bio.applicant_form_path),
        });

        const cleanJobs = jobs
          .map((j) => ({
            applicant_id: newId,
            company_name: toNullableUpperText(j.company_name),
            position: toNullableUpperText(j.position),
            telephone: toNullableText(j.telephone),
            inclusive_dates: toNullableUpperText(j.inclusive_dates),
            leave_reason: toNullableUpperText(j.leave_reason),
          }))
          .filter((j) => j.company_name || j.position || j.leave_reason || j.telephone || j.inclusive_dates);

        if (cleanJobs.length) {
          await supabase.from("employment_history").insert(cleanJobs);
        }

        const cleanOtherDocs = otherDocs
          .map((doc, index) => ({
            applicant_id: newId,
            label: toNullableUpperText(resolveOtherDocumentLabel(doc.label, doc.path, index)) ?? "DOCUMENT",
            bucket: normalizeDocumentBucket(doc.bucket),
            file_path: toNullableText(doc.path),
          }))
          .filter((doc) => doc.file_path);

        if (cleanOtherDocs.length) {
          const odIns = await supabase.from("applicant_other_documents").insert(cleanOtherDocs);
          if (odIns.error && !isMissingRelationError(odIns.error, "applicant_other_documents")) throw odIns.error;
        }

        onSaved?.(newId, nextStatus);
        onClose();

        if (nextStatus === "AWOL") {
          router.push("/Main_Modules/AWOL/");
        } else if (nextStatus === "RESIGNED") {
          router.push("/Main_Modules/Resigned/");
        } else if (nextStatus === "RETIRED") {
          router.push("/Main_Modules/Retired/");
        } else if (nextStatus === "FLOATING") {
          router.push("/Main_Modules/Floating/");
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
          custom_id: toNullableUpperText(app.custom_id),
          first_name: toNullableUpperText(app.first_name),
          middle_name: toNullableUpperText(app.middle_name),
          last_name: toNullableUpperText(app.last_name),
          gender: toNullableUpperText(app.gender),
          birth_date: toNullableText(app.birth_date),
          age: toNullableInt(computedAge),
          client_contact_num: toNullableText(formattedClientContact),
          client_email: toNullableText(app.client_email),
          present_address: toNullableUpperText(app.present_address),
          province_address: toNullableUpperText(app.province_address),
          emergency_contact_person: toNullableUpperText(app.emergency_contact_person),
          emergency_contact_num: toNullableText(formattedEmergencyContact),
          education_attainment: toNullableUpperText(app.education_attainment),
          date_hired_fsai: toNullableText(app.date_hired_fsai),
          client_position: toNullableUpperText(app.client_position),
          detachment: toNullableUpperText(app.detachment),
          status: nextStatus,

          date_resigned: shouldPersistResignedFields ? toNullableText(app.date_resigned) : null,
          last_duty: shouldPersistResignedFields ? toNullableUpperText(app.last_duty) : null,

          retired_date: retiredDate,
          retired_reason: retiredReason,
          retired_at: retiredAt,
          retired_by: isRetired ? legacyAdminId : null,

          security_licensed_num: toNullableUpperText(app.security_licensed_num),
          sss_number: toNullableUpperText(app.sss_number),
          pagibig_number: toNullableUpperText(app.pagibig_number),
          philhealth_number: toNullableUpperText(app.philhealth_number),
          tin_number: toNullableUpperText(app.tin_number),

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
        course_title_degree: toNullableUpperText(certs.course_title_degree),
        training_path: toNullableText(certs.training_path),
        seminar_path: toNullableText(certs.seminar_path),
        gun_safety_certificate_path: toNullableText(certs.gun_safety_certificate_path),
        highschool_diploma_path: toNullableText(certs.highschool_diploma_path),
        college_diploma_path: toNullableText(certs.college_diploma_path),
        vocational_path: toNullableText(certs.vocational_path),
        training_when_where: toNullableUpperText(certs.training_when_where),
        seminar_when_where: toNullableUpperText(certs.seminar_when_where),
        highschool_when_where: toNullableUpperText(certs.highschool_when_where),
        college_when_where: toNullableUpperText(certs.college_when_where),
        vocational_when_where: toNullableUpperText(certs.vocational_when_where),
        course_when_where: toNullableUpperText(certs.course_when_where),
      });
      if (cUp.error) throw cUp.error;

      const lUp = await supabase.from("licensure").upsert({
        applicant_id: effectiveId,
        driver_license_number: toNullableUpperText(lic.driver_license_number),
        driver_expiration: toNullableText(lic.driver_expiration),
        security_license_number: toNullableUpperText(lic.security_license_number),
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
            company_name: toNullableUpperText(j.company_name),
            position: toNullableUpperText(j.position),
            telephone: toNullableText(j.telephone),
            inclusive_dates: toNullableUpperText(j.inclusive_dates),
            leave_reason: toNullableUpperText(j.leave_reason),
          }))
          .filter((j) => j.company_name || j.position || j.leave_reason || j.telephone || j.inclusive_dates);

        if (cleanJobs.length) {
          const ins = await supabase.from("employment_history").insert(cleanJobs);
          if (ins.error) throw ins.error;
        }
      }

      const odDel = await supabase.from("applicant_other_documents").delete().eq("applicant_id", effectiveId);
      if (odDel.error && !isMissingRelationError(odDel.error, "applicant_other_documents")) {
        throw odDel.error;
      }

      const cleanOtherDocs = otherDocs
        .map((doc, index) => ({
          applicant_id: effectiveId,
          label: toNullableUpperText(resolveOtherDocumentLabel(doc.label, doc.path, index)) ?? "DOCUMENT",
          bucket: normalizeDocumentBucket(doc.bucket),
          file_path: toNullableText(doc.path),
        }))
        .filter((doc) => doc.file_path);

      if (cleanOtherDocs.length) {
        const odIns = await supabase.from("applicant_other_documents").insert(cleanOtherDocs);
        if (odIns.error && !isMissingRelationError(odIns.error, "applicant_other_documents")) throw odIns.error;
      }

      onSaved?.(effectiveId, nextStatus);
      onClose();

      if (nextStatus === "AWOL") {
        router.push("/Main_Modules/AWOL/");
      } else if (nextStatus === "RESIGNED") {
        router.push("/Main_Modules/Resigned/");
      } else if (nextStatus === "RETIRED") {
        router.push("/Main_Modules/Retired/");
      } else if (nextStatus === "FLOATING") {
        router.push("/Main_Modules/Floating/");
      }
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message?: unknown }).message ?? "Save failed")
            : "Save failed";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmployee() {
    if (mode !== "edit" || !effectiveId) return;

    const displayName = [app.first_name, app.last_name].filter(Boolean).join(" ").trim() || "this employee";
    const ok = window.confirm(`Delete ${displayName}? This will move the record to trash.`);
    if (!ok) return;

    setError("");
    setDeleting(true);
    try {
      const del = await supabase
        .from("applicants")
        .update({
          is_trashed: true,
          trashed_at: new Date().toISOString(),
          trashed_by: null,
        })
        .eq("applicant_id", effectiveId);

      if (del.error) throw del.error;

      onDeleted?.(effectiveId);
      onClose();
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message?: unknown }).message ?? "Delete failed")
            : "Delete failed";
      setError(message);
    } finally {
      setDeleting(false);
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

        <div className="employee-editor-uppercase p-6 max-h-[70vh] overflow-auto">
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
                    {uploadingFileKey === "profile" ? (
                      <LoadingCircle label="Uploading..." sizeClassName="h-5 w-5" className="flex-row text-xs" />
                    ) : null}
                    <label
                      className={`px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold ${
                        uploadingFileKey ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      }`}
                    >
                      {uploadingFileKey === "profile" ? "Uploading" : "Upload"}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={Boolean(uploadingFileKey)}
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
                    <div className="text-gray-600 mb-1">{idNumberLabel}</div>
                    <div className="flex items-center gap-2">
                      {showIdGenerate ? (
                        <button
                          type="button"
                          onClick={() => setApp((d) => ({ ...d, custom_id: generateCustomId() }))}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Generate
                        </button>
                      ) : null}
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
                    placeholder="Enter ID number"
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
                    onChange={(e) => {
                      const birthDate = e.target.value;
                      setApp((d) => ({ ...d, birth_date: birthDate, age: calculateAgeFromBirthDate(birthDate) }));
                    }}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Age</div>
                  <input value={app.age} readOnly
                    className="w-full border rounded-xl px-3 py-2 bg-gray-50 text-gray-700" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Phone Number</div>
                  <input value={app.client_contact_num}
                    inputMode="tel"
                    maxLength={12}
                    placeholder="+09XXXXXXXXX"
                    onChange={(e) => setApp((d) => ({ ...d, client_contact_num: formatPhilippineMobileNumber(e.target.value) }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black md:col-span-2">
                  <div className="text-gray-600 mb-1">Email Address</div>
                  <input type="email" value={app.client_email} onChange={(e) => setApp((d) => ({ ...d, client_email: e.target.value }))}
                    className="preserve-case w-full border rounded-xl px-3 py-2" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Emergency Contact Person</div>
                  <input value={app.emergency_contact_person}
                    onChange={(e) => setApp((d) => ({ ...d, emergency_contact_person: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm text-black">
                  <div className="text-gray-600 mb-1">Emergency Number</div>
                  <input value={app.emergency_contact_num}
                    inputMode="tel"
                    maxLength={12}
                    placeholder="+09XXXXXXXXX"
                    onChange={(e) => setApp((d) => ({ ...d, emergency_contact_num: formatPhilippineMobileNumber(e.target.value) }))}
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
                  <select
                    value={app.detachment}
                    onChange={(e) => setApp((d) => ({ ...d, detachment: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="">-- Select Specific Area --</option>
                    {detachmentChoices.map((option) => (
                      <option key={option.area} value={option.area}>
                        {option.area}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs text-gray-500">
                    {detachmentOptionsLoading
                      ? "Loading contract areas..."
                      : detachmentOptions.length
                        ? "Options are pulled from Client contract Specific Area values."
                        : "Create a Client contract with a Specific Area to add detachment options."}
                  </div>
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
                          : normalizeStatus(app.status) === "APPLICANT"
                          ? "border-sky-300"
                          : normalizeStatus(app.status) === "AWOL"
                          ? "border-orange-300"
                          : normalizeStatus(app.status) === "RESIGNED"
                          ? "border-orange-300"
                          : "border-gray-300"
                      }`}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="APPLICANT">APPLICANT</option>
                      <option value="AWOL">AWOL</option>
                      <option value="RESIGNED">RESIGNED</option>
                      <option value="RETIRED">RETIRED</option>
                      <option value="FLOATING">FLOATING</option>
                    </select>
                    <span
                      className={`absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ${
                        normalizeStatus(app.status) === "ACTIVE"
                          ? "bg-emerald-500"
                          : normalizeStatus(app.status) === "APPLICANT"
                          ? "bg-sky-500"
                          : normalizeStatus(app.status) === "AWOL"
                          ? "bg-orange-500"
                          : normalizeStatus(app.status) === "RESIGNED"
                          ? "bg-orange-500"
                          : "bg-gray-500"
                      }`}
                    />
                  </div>
                </label>
              </div>

              {normalizeStatus(app.status) === "RESIGNED" || normalizeStatus(app.status) === "RETIRED" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Date Resigned</div>
                    <input
                      type="date"
                      value={app.date_resigned}
                      onChange={(e) => setApp((d) => ({ ...d, date_resigned: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2"
                    />
                  </label>
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Last Duty</div>
                    <input
                      type="date"
                      value={app.last_duty}
                      onChange={(e) => setApp((d) => ({ ...d, last_duty: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2"
                    />
                  </label>
                </div>
              ) : null}

              <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Application Form Document</div>
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
                    {uploadingFileKey === "application_form" ? (
                      <LoadingCircle label="Uploading..." sizeClassName="h-5 w-5" className="flex-row text-xs" />
                    ) : null}
                    <label
                      className={`px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold ${
                        uploadingFileKey ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      }`}
                    >
                      {uploadingFileKey === "application_form" ? "Uploading" : "Upload"}
                      <input
                        type="file"
                        className="hidden"
                        accept={GENERAL_DOCUMENT_ACCEPT}
                        disabled={Boolean(uploadingFileKey)}
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

              <div className="space-y-4">
                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_180px]">
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">High School Name</div>
                    <input
                      value={highSchoolEducation.name}
                      onChange={(e) => updateEducationNameYearField("highschool_when_where", "name", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="School name"
                    />
                  </label>
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Year Graduated</div>
                    <input
                      value={highSchoolEducation.year}
                      onChange={(e) => updateEducationNameYearField("highschool_when_where", "year", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="e.g. 2016"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_180px]">
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">College Name</div>
                    <input
                      value={collegeEducation.name}
                      onChange={(e) => updateEducationNameYearField("college_when_where", "name", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="School name"
                    />
                  </label>
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Year Graduated</div>
                    <input
                      value={collegeEducation.year}
                      onChange={(e) => updateEducationNameYearField("college_when_where", "year", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="e.g. 2020"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_180px]">
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Vocational Name</div>
                    <input
                      value={vocationalEducation.name}
                      onChange={(e) => updateEducationNameYearField("vocational_when_where", "name", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="School or program name"
                    />
                  </label>
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Year Graduated</div>
                    <input
                      value={vocationalEducation.year}
                      onChange={(e) => updateEducationNameYearField("vocational_when_where", "year", e.target.value)}
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="e.g. 2021"
                    />
                  </label>
                </div>

                <label className="block text-sm text-black">
                  <div className="text-gray-600 mb-1">Course/Degree (When/Where)</div>
                  <input
                    value={certs.course_when_where}
                    onChange={(e) => setCerts((d) => ({ ...d, course_when_where: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2"
                  />
                </label>
              </div>

              <div className="hidden">
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

              <div className="hidden">
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
                  onChange={(e) => setApp((d) => ({ ...d, sss_number: formatSssNumber(e.target.value) }))}
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="12-3456789-0"
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">Pag-IBIG No.</div>
                <input value={app.pagibig_number}
                  onChange={(e) => setApp((d) => ({ ...d, pagibig_number: formatPagibigNumber(e.target.value) }))}
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="1234-5678-9012"
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">PhilHealth No.</div>
                <input value={app.philhealth_number}
                  onChange={(e) => setApp((d) => ({ ...d, philhealth_number: formatPhilhealthNumber(e.target.value) }))}
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="12-345678901-2"
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
              <label className="text-sm text-black">
                <div className="text-gray-600 mb-1">TIN</div>
                <input value={app.tin_number}
                  onChange={(e) => setApp((d) => ({ ...d, tin_number: formatTinNumber(e.target.value) }))}
                  inputMode="numeric"
                  maxLength={15}
                  placeholder="123-456-789 or 123-456-789-000"
                  className="w-full border rounded-xl px-3 py-2" />
              </label>
              <div className="md:col-span-2 rounded-xl border bg-amber-50 px-3 py-2 text-xs text-amber-800">
                These Social Welfare numbers are required before continuing: SSS, PhilHealth, Pag-IBIG, and TIN.
              </div>
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
                <div className="text-sm font-semibold text-black">Training and Seminar</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Training (When/Where)</div>
                    <input
                      value={certs.training_when_where}
                      onChange={(e) => setCerts((d) => ({ ...d, training_when_where: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2"
                    />
                  </label>
                  <label className="text-sm text-black">
                    <div className="text-gray-600 mb-1">Seminar (When/Where)</div>
                    <input
                      value={certs.seminar_when_where}
                      onChange={(e) => setCerts((d) => ({ ...d, seminar_when_where: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2"
                    />
                  </label>
                </div>
              </div>

              {/* <div className="rounded-2xl border p-4">
                <div className="text-sm font-semibold text-black">Security License Number (Applicants)</div>
                <div className="text-xs text-gray-500 mt-1">Stored in applicants.security_licensed_num as well</div>
                <input value={app.security_licensed_num}
                  onChange={(e) => setApp((d) => ({ ...d, security_licensed_num: e.target.value }))}
                  className="mt-2 w-full border rounded-xl px-3 py-2" />
              </div> */}

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
                <div className="mt-1 text-xs text-gray-500">
                  Supported uploads: images, PDF, Word, Excel, ZIP, and RAR files. Images and supported Office files are optimized before upload when possible.
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DocUploadRow
                    label="SSS Certain"
                    path={app.sss_certain_path}
                    url={docPreview.sss}
                    uploading={uploadingFileKey === "sss_certain"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setApp((d) => ({ ...d, sss_certain_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "sss_certain", (p) => setApp((d) => ({ ...d, sss_certain_path: p })), file)}
                  />
                  <DocUploadRow
                    label="TIN ID"
                    path={app.tin_id_path}
                    url={docPreview.tin}
                    uploading={uploadingFileKey === "tin_id"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setApp((d) => ({ ...d, tin_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "tin_id", (p) => setApp((d) => ({ ...d, tin_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="PAG-IBIG ID"
                    path={app.pag_ibig_id_path}
                    url={docPreview.pagibig}
                    uploading={uploadingFileKey === "pag_ibig"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setApp((d) => ({ ...d, pag_ibig_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "pag_ibig", (p) => setApp((d) => ({ ...d, pag_ibig_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="PHILHEALTH ID"
                    path={app.philhealth_id_path}
                    url={docPreview.philhealth}
                    uploading={uploadingFileKey === "philhealth"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setApp((d) => ({ ...d, philhealth_id_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.applicants, "philhealth", (p) => setApp((d) => ({ ...d, philhealth_id_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Security License"
                    path={app.security_license_path}
                    url={docPreview.securityLicense}
                    uploading={uploadingFileKey === "security_license"}
                    uploadDisabled={Boolean(uploadingFileKey)}
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
                    uploading={uploadingFileKey === "gun_safety_certificate"}
                    uploadDisabled={Boolean(uploadingFileKey)}
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
                    uploading={uploadingFileKey === "training"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setCerts((d) => ({ ...d, training_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "training", (p) => setCerts((d) => ({ ...d, training_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Seminar Certificate"
                    path={certs.seminar_path}
                    url={docPreview.seminar}
                    uploading={uploadingFileKey === "seminar"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setCerts((d) => ({ ...d, seminar_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "seminar", (p) => setCerts((d) => ({ ...d, seminar_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Highschool Diploma"
                    path={certs.highschool_diploma_path}
                    url={docPreview.hs}
                    uploading={uploadingFileKey === "highschool_diploma"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setCerts((d) => ({ ...d, highschool_diploma_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "highschool_diploma", (p) => setCerts((d) => ({ ...d, highschool_diploma_path: p })), file)}
                  />
                  <DocUploadRow
                    label="College Diploma"
                    path={certs.college_diploma_path}
                    url={docPreview.college}
                    uploading={uploadingFileKey === "college_diploma"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setCerts((d) => ({ ...d, college_diploma_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "college_diploma", (p) => setCerts((d) => ({ ...d, college_diploma_path: p })), file)}
                  />
                  <DocUploadRow
                    label="Vocational"
                    path={certs.vocational_path}
                    url={docPreview.vocational}
                    uploading={uploadingFileKey === "vocational"}
                    uploadDisabled={Boolean(uploadingFileKey)}
                    onSet={(path) => setCerts((d) => ({ ...d, vocational_path: path }))}
                    onPick={(file) => onPickFile(BUCKETS.certificates, "vocational", (p) => setCerts((d) => ({ ...d, vocational_path: p })), file)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-black">Other Documents</div>
                    <div className="text-xs text-gray-500">Add as many additional documents as needed. New uploads default to the Certificates bucket, labels auto-fill from the filename, and Word/Excel/image uploads are optimized when possible.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtherDocs((prev) => [...prev, { label: "", bucket: "certificates", path: "" }])}
                    className="px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold"
                  >
                    + Add Document
                  </button>
                </div>

                {otherDocs.length === 0 ? (
                  <div className="mt-3 text-sm text-gray-500">No other documents yet.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {otherDocs.map((doc, idx) => {
                      const preview = publicUrl(doc.bucket, doc.path || null);
                      const uploadKey = `other_document_${idx + 1}`;
                      return (
                        <div key={doc.document_id ?? `other-doc-${idx}`} className="rounded-xl border p-3">
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                            <label className="text-sm text-black">
                              <div className="text-gray-600 mb-1">Document Label</div>
                              <input
                                value={doc.label}
                                onChange={(e) =>
                                  setOtherDocs((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                                  )
                                }
                                placeholder="e.g. NBI Clearance"
                                className="w-full border rounded-xl px-3 py-2"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setOtherDocs((prev) => prev.filter((_, i) => i !== idx))}
                              className="px-3 py-2 rounded-xl border bg-white text-black text-sm"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="mt-2 text-xs text-gray-500 break-all">{doc.path || "Not uploaded"}</div>
                          <div className="mt-3 flex items-center gap-2">
                            <div className="text-xs font-medium text-gray-500">
                              Bucket: {doc.bucket === "applicants" ? "Applicants" : doc.bucket === "licensure" ? "Licensure" : "Certificates"}
                            </div>
                            {preview ? (
                              <a
                                href={preview}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-2 rounded-xl border bg-white text-sm text-blue-600"
                              >
                                View
                              </a>
                            ) : null}
                            {uploadingFileKey === uploadKey ? (
                              <LoadingCircle label="Uploading..." sizeClassName="h-5 w-5" className="flex-row text-xs" />
                            ) : null}
                            <label
                              className={`px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold ${
                                uploadingFileKey ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                              }`}
                            >
                              {uploadingFileKey === uploadKey ? "Uploading" : "Upload"}
                              <input
                                type="file"
                                className="hidden"
                                accept={GENERAL_DOCUMENT_ACCEPT}
                                disabled={Boolean(uploadingFileKey)}
                                onChange={(e) =>
                                  onPickFile(
                                    doc.bucket || "certificates",
                                    uploadKey,
                                    (path, uploadedFile) =>
                                      setOtherDocs((prev) =>
                                        prev.map((item, i) =>
                                          i === idx
                                            ? {
                                                ...item,
                                                path,
                                                label:
                                                  collapseWhitespace(item.label) ||
                                                  inferDocumentLabelFromFileName(uploadedFile?.name) ||
                                                  resolveOtherDocumentLabel(item.label, path, idx),
                                              }
                                            : item
                                        )
                                      ),
                                    e.target.files?.[0]
                                  )
                                }
                              />
                            </label>
                            <button
                              type="button"
                              disabled={Boolean(uploadingFileKey)}
                              onClick={() =>
                                setOtherDocs((prev) => prev.map((item, i) => (i === idx ? { ...item, path: "" } : item)))
                              }
                              className="px-3 py-2 rounded-xl border bg-white text-black text-sm"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
            {mode === "edit" && effectiveId ? (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => void deleteEmployee()}
                className={`px-4 py-2 rounded-xl border border-red-200 bg-white text-red-600 font-semibold ${
                  saving || deleting ? "opacity-60" : ""
                }`}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
            <button onClick={onClose} disabled={saving || deleting} className="px-4 py-2 rounded-xl border bg-white text-black">
              Cancel
            </button>
            <button
              disabled={saving || deleting}
              onClick={() => {
                if (mode === "create" && !isLastStep) {
                  goNext();
                  return;
                }
                save();
              }}
              className={`px-4 py-2 rounded-xl bg-[#FFDA03] text-black font-semibold ${saving || deleting ? "opacity-70" : ""}`}
            >
              {saving ? "Saving…" : mode === "create" && !isLastStep ? "Next" : "Save"}
            </button>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .employee-editor-uppercase input:not([type="email"]):not([type="date"]):not([type="file"]):not([type="number"]),
        .employee-editor-uppercase textarea {
          text-transform: uppercase;
        }
        .employee-editor-uppercase .preserve-case {
          text-transform: none;
        }
      `}</style>
    </div>
  );
}

function DocUploadRow({
  label,
  path,
  url,
  uploading = false,
  uploadDisabled = false,
  onSet,
  onPick,
}: {
  label: string;
  path: string;
  url: string | null;
  uploading?: boolean;
  uploadDisabled?: boolean;
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
        {uploading ? <LoadingCircle label="Uploading..." sizeClassName="h-5 w-5" className="flex-row text-xs" /> : null}
        <label
          className={`px-3 py-2 rounded-xl bg-[#FFDA03] text-black text-sm font-semibold ${
            uploadDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          }`}
        >
          {uploading ? "Uploading" : "Upload"}
          <input
            type="file"
            className="hidden"
            accept={GENERAL_DOCUMENT_ACCEPT}
            disabled={uploadDisabled}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          onClick={() => onSet("")}
          disabled={uploadDisabled}
          className="px-3 py-2 rounded-xl border bg-white text-black text-sm"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
