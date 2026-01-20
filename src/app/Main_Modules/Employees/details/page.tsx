"use client";

import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { supabase } from "../../../Client/SupabaseClients";

type Applicant = {
  applicant_id: string;
  created_at: string;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  extn_name: string | null;
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
  highschool_diploma_path: string | null;
  college_diploma_path: string | null;
  vocational_path: string | null;
  course_title_degree: string | null;
};

type EmploymentRecord = {
  company_name: string | null;
  position: string | null;
  leave_reason: string | null;
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
  profile: "Profile_Images",
  certificates: "certificates",
  sss: "SSS_CERTAIN",
  tin: "TIN_ID",
  pagibig: "PAG_IBIG_ID",
  philhealth: "PHILHEALTH_ID",
  securityLicense: "SECURITY_LICENSE",
};

function getFullName(a: Applicant) {
  const parts = [a.first_name, a.middle_name, a.last_name, a.extn_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "(No name)";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function publicUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || null;
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
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

function DocLink({ title, url }: { title: string; url: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-yellow-700" />
        <div className="text-sm font-medium text-gray-900 truncate">{title}</div>
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          Open <ExternalLink className="w-4 h-4" />
        </a>
      ) : (
        <div className="text-xs text-gray-400">Not uploaded</div>
      )}
    </div>
  );
}

export default function EmployeeDetailsPage() {
  const params = useSearchParams();
  const id = params.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [certs, setCerts] = useState<Certificates | null>(null);
  const [employment, setEmployment] = useState<EmploymentRecord | null>(null);
  const [lic, setLic] = useState<Licensure | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      setApplicant(null);
      setCerts(null);
      setEmployment(null);
      setLic(null);

      if (!id) {
        setLoading(false);
        setError("Missing employee id");
        return;
      }

      try {
        const { data: a, error: aErr } = await supabase
          .from("applicants")
          .select(
            "applicant_id, created_at, last_name, first_name, middle_name, extn_name, birth_date, age, gender, education_attainment, date_hired_fsai, client_position, detachment, security_licensed_num, sss_number, pagibig_number, philhealth_number, tin_number, client_contact_num, client_email, present_address, province_address, emergency_contact_person, emergency_contact_num, status, profile_image_path, sss_certain_path, tin_id_path, pag_ibig_id_path, philhealth_id_path, security_license_path"
          )
          .eq("applicant_id", id)
          .maybeSingle();

        if (aErr) throw aErr;
        setApplicant((a as Applicant) || null);

        const [cRes, eRes, lRes] = await Promise.all([
          supabase
            .from("certificates")
            .select(
              "training_path, seminar_path, highschool_diploma_path, college_diploma_path, vocational_path, course_title_degree"
            )
            .eq("applicant_id", id)
            .maybeSingle(),
          supabase
            .from("employment_record")
            .select("company_name, position, leave_reason")
            .eq("applicant_id", id)
            .maybeSingle(),
          supabase
            .from("licensure")
            .select(
              "driver_license_number, driver_expiration, security_license_number, security_expiration, insurance, insurance_expiration"
            )
            .eq("applicant_id", id)
            .maybeSingle(),
        ]);

        if (cRes.error) console.warn(cRes.error);
        if (eRes.error) console.warn(eRes.error);
        if (lRes.error) console.warn(lRes.error);

        setCerts((cRes.data as Certificates) || null);
        setEmployment((eRes.data as EmploymentRecord) || null);
        setLic((lRes.data as Licensure) || null);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Failed to load employee");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [id]);

  const profile = useMemo(() => {
    if (!applicant) return null;
    return publicUrl(BUCKETS.profile, applicant.profile_image_path);
  }, [applicant]);

  const docUrls = useMemo(() => {
    if (!applicant) return null;
    return {
      sss: publicUrl(BUCKETS.sss, applicant.sss_certain_path),
      tin: publicUrl(BUCKETS.tin, applicant.tin_id_path),
      pagibig: publicUrl(BUCKETS.pagibig, applicant.pag_ibig_id_path),
      philhealth: publicUrl(BUCKETS.philhealth, applicant.philhealth_id_path),
      securityLicense: publicUrl(BUCKETS.securityLicense, applicant.security_license_path),
      training: publicUrl(BUCKETS.certificates, certs?.training_path || null),
      seminar: publicUrl(BUCKETS.certificates, certs?.seminar_path || null),
      hs: publicUrl(BUCKETS.certificates, certs?.highschool_diploma_path || null),
      college: publicUrl(BUCKETS.certificates, certs?.college_diploma_path || null),
      vocational: publicUrl(BUCKETS.certificates, certs?.vocational_path || null),
    };
  }, [applicant, certs]);

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
            href="/Main_Modules/Employees/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Employees
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
          href="/Main_Modules/Employees/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-white"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left profile */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="flex flex-col items-center text-center">
            <div className="h-36 w-36 rounded-3xl bg-gray-100 overflow-hidden flex items-center justify-center">
              {profile ? (
                <img src={profile} alt={name} className="h-full w-full object-cover" />
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

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
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
          </div>
        </section>

        {/* Social Welfare */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="text-lg font-bold text-gray-900">Social Welfare</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-gray-500">SSS No.</div>
              <div className="font-semibold">{applicant.sss_number ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-500">Pag-ibig No.</div>
              <div className="font-semibold">{applicant.pagibig_number ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-500">Philhealth No.</div>
              <div className="font-semibold">{applicant.philhealth_number ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-gray-500">TIN</div>
              <div className="font-semibold">{applicant.tin_number ?? "—"}</div>
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
          <div className="mt-4 space-y-4 text-sm">
            <InfoRow icon={Briefcase} label="Company Name" value={employment?.company_name ?? "—"} />
            <InfoRow icon={Briefcase} label="Position" value={employment?.position ?? "—"} />
            <InfoRow icon={FileText} label="Leave Reason" value={employment?.leave_reason ?? "—"} />
          </div>
        </section>

        {/* Scanned Documents */}
        <section className="bg-white rounded-3xl border shadow-sm p-6">
          <div className="text-lg font-bold text-gray-900">Scanned Documents</div>
          <div className="mt-4 divide-y">
            <DocLink title="SSS Certain" url={docUrls?.sss ?? null} />
            <DocLink title="TIN ID" url={docUrls?.tin ?? null} />
            <DocLink title="PAG-IBIG ID" url={docUrls?.pagibig ?? null} />
            <DocLink title="PHILHEALTH ID" url={docUrls?.philhealth ?? null} />
            <DocLink title="Security License" url={docUrls?.securityLicense ?? null} />
            <DocLink title="Training Certificate" url={docUrls?.training ?? null} />
            <DocLink title="Seminar Certificate" url={docUrls?.seminar ?? null} />
            <DocLink title="Highschool Diploma" url={docUrls?.hs ?? null} />
            <DocLink title="College Diploma" url={docUrls?.college ?? null} />
            <DocLink title="Vocational" url={docUrls?.vocational ?? null} />
          </div>
        </section>
      </div>
    </div>
  );
}
