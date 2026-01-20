-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'employee'::text])),
  created_at timestamp with time zone DEFAULT now(),
  last_login timestamp with time zone,
  employee_id integer,
  employee_number character varying,
  full_name text,
  position text CHECK ("position" = ANY (ARRAY['Supervisor'::text, 'Employee'::text, 'Manager'::text, 'Admin'::text, 'Superadmin'::text])),
  is_active boolean DEFAULT true,
  password text NOT NULL DEFAULT 'admin123'::text
);
CREATE TABLE public.applicants (
  applicant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_name character varying,
  first_name character varying,
  middle_name character varying,
  extn_name character varying,
  birth_date date,
  age integer,
  gender character varying,
  education_attainment character varying,
  date_hired_fsai date,
  client_position character varying,
  detachment character varying,
  security_licensed_num character varying,
  sss_number character varying,
  pagibig_number character varying,
  philhealth_number character varying,
  tin_number character varying,
  client_contact_num character varying,
  client_email character varying,
  present_address character varying,
  province_address character varying,
  emergency_contact_person character varying,
  emergency_contact_num character varying,
  status character varying,
  CONSTRAINT applicants_pkey PRIMARY KEY (applicant_id)
);
CREATE TABLE public.biodata (
  applicant_id uuid NOT NULL,
  applicant_form bytea,
  CONSTRAINT biodata_pkey PRIMARY KEY (applicant_id),
  CONSTRAINT biodata_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.certificates (
  applicant_id uuid NOT NULL,
  course_title_degree character varying,
  training_path text,
  seminar_path text,
  highschool_diploma_path text,
  college_diploma_path text,
  vocational_path text,
  CONSTRAINT certificates_pkey PRIMARY KEY (applicant_id),
  CONSTRAINT certificates_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.deployment_history (
  history_id uuid NOT NULL DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL,
  applicant_id uuid NOT NULL,
  detachment character varying,
  dp_status character varying,
  change_date date NOT NULL DEFAULT CURRENT_DATE,
  remarks text,
  CONSTRAINT deployment_history_pkey PRIMARY KEY (history_id),
  CONSTRAINT deployment_history_deployment_id_fkey FOREIGN KEY (deployment_id) REFERENCES public.deployment_status(deployment_id),
  CONSTRAINT deployment_history_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.deployment_status (
  deployment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  detachment character varying,
  client_position character varying,
  shift character varying,
  start_date date,
  expected_end_date date,
  deployment_status character varying NOT NULL DEFAULT 'ACTIVE'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deployment_status_pkey PRIMARY KEY (deployment_id),
  CONSTRAINT deployment_status_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.employment_record (
  applicant_id uuid NOT NULL,
  company_name character varying,
  position character varying,
  leave_reason character varying,
  CONSTRAINT employment_record_pkey PRIMARY KEY (applicant_id),
  CONSTRAINT employment_record_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.licensure (
  applicant_id uuid NOT NULL,
  driver_license_number character varying,
  driver_expiration date,
  security_license_number character varying,
  security_expiration date,
  insurance character varying,
  insurance_expiration date,
  CONSTRAINT licensure_pkey PRIMARY KEY (applicant_id),
  CONSTRAINT licenseure_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);