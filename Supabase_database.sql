-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_role_memberships (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  CONSTRAINT admin_role_memberships_pkey PRIMARY KEY (user_id, role_id),
  CONSTRAINT admin_role_memberships_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.app_roles(role_id)
);
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
  password text NOT NULL DEFAULT 'admin123'::text,
  CONSTRAINT admins_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_roles (
  role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  role_name text NOT NULL UNIQUE,
  CONSTRAINT app_roles_pkey PRIMARY KEY (role_id)
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
  status character varying DEFAULT 'ACTIVE'::character varying CHECK (NULLIF(btrim(status::text), ''::text) IS NULL OR (upper(NULLIF(btrim(status::text), ''::text)) = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'REASSIGN'::text, 'RETIRED'::text]))),
  profile_image_path text,
  sss_certain_path text,
  tin_id_path text,
  pag_ibig_id_path text,
  philhealth_id_path text,
  security_license_path text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamp with time zone,
  archived_by uuid,
  is_trashed boolean NOT NULL DEFAULT false,
  trashed_at timestamp with time zone,
  trashed_by uuid,
  retired_date date,
  retired_reason text,
  retired_remarks text,
  retired_at timestamp with time zone,
  retired_by uuid,
  custom_id text,
  date_resigned date,
  last_duty text,
  CONSTRAINT applicants_pkey PRIMARY KEY (applicant_id),
  CONSTRAINT applicants_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.admins(id),
  CONSTRAINT applicants_trashed_by_fkey FOREIGN KEY (trashed_by) REFERENCES public.admins(id),
  CONSTRAINT applicants_retired_by_fkey FOREIGN KEY (retired_by) REFERENCES public.admins(id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  page text,
  entity text,
  details jsonb,
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.biodata (
  applicant_id uuid NOT NULL,
  applicant_form bytea,
  applicant_form_path text,
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
  training_when_where text,
  seminar_when_where text,
  highschool_when_where text,
  college_when_where text,
  vocational_when_where text,
  course_when_where text,
  gun_safety_certificate_path text,
  CONSTRAINT certificates_pkey PRIMARY KEY (applicant_id),
  CONSTRAINT certificates_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.contracts (
  contract_id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid,
  contract_no text,
  start_date date,
  end_date date,
  status text DEFAULT 'ACTIVE'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contracts_pkey PRIMARY KEY (contract_id),
  CONSTRAINT contracts_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);

  -- Assign multiple applicants to a contract.
  CREATE TABLE public.contract_employees (
    contract_id uuid NOT NULL,
    applicant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT contract_employees_pkey PRIMARY KEY (contract_id, applicant_id),
    CONSTRAINT contract_employees_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id),
    CONSTRAINT contract_employees_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
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
CREATE TABLE public.employment_history (
  employment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  company_name text,
  position text,
  telephone text,
  inclusive_dates text,
  leave_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT employment_history_pkey PRIMARY KEY (employment_id),
  CONSTRAINT employment_history_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.employment_record (
  applicant_id uuid NOT NULL,
  company_name character varying,
  position character varying,
  leave_reason character varying,
  CONSTRAINT employment_record_pkey PRIMARY KEY (applicant_id),
  CONSTRAINT employment_record_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.inventory_fixed_asset (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date character varying,
  particular character varying,
  quanitity integer,
  amount numeric,
  remarks character varying,
  firearms_ammunitions character varying,
  communications_equipment character varying,
  furniture_and_fixtures character varying,
  office_equipments_sec_equipments character varying,
  sec_equipments character varying,
  vehicle_and_motorcycle character varying,
  total_amount numeric,
  grand_total numeric,
  firearms_qty numeric DEFAULT 0,
  firearms_price numeric DEFAULT 0,
  communications_qty numeric DEFAULT 0,
  communications_price numeric DEFAULT 0,
  furniture_qty numeric DEFAULT 0,
  furniture_price numeric DEFAULT 0,
  office_qty numeric DEFAULT 0,
  office_price numeric DEFAULT 0,
  sec_qty numeric DEFAULT 0,
  sec_price numeric DEFAULT 0,
  vehicle_qty numeric DEFAULT 0,
  vehicle_price numeric DEFAULT 0,
  firearms_name text,
  communications_name text,
  furniture_name text,
  office_name text,
  sec_name text,
  vehicle_name text,
  last_updated_at timestamp with time zone,
  CONSTRAINT inventory_fixed_asset_pkey PRIMARY KEY (id)
);
CREATE TABLE public.job_titles (
  title_id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT job_titles_pkey PRIMARY KEY (title_id)
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
CREATE TABLE public.licensure_notification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  applicant_id uuid NOT NULL,
  license_type text NOT NULL CHECK (license_type = ANY (ARRAY['DRIVER_LICENSE'::text, 'SECURITY_LICENSE'::text, 'INSURANCE'::text])),
  expires_on date NOT NULL,
  recipient_email text,
  status text NOT NULL DEFAULT 'QUEUED'::text CHECK (status = ANY (ARRAY['QUEUED'::text, 'SENT'::text, 'FAILED'::text, 'SKIPPED'::text])),
  error_message text,
  CONSTRAINT licensure_notification_log_pkey PRIMARY KEY (id),
  CONSTRAINT licensure_notification_log_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id)
);
CREATE TABLE public.modules (
  module_key text NOT NULL,
  display_name text NOT NULL,
  path text NOT NULL,
  CONSTRAINT modules_pkey PRIMARY KEY (module_key)
);
CREATE TABLE public.notification_email_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'gmail'::text CHECK (provider = 'gmail'::text),
  gmail_user text NOT NULL,
  from_email text NOT NULL,
  gmail_app_password text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  CONSTRAINT notification_email_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_enabled boolean NOT NULL DEFAULT true,
  days_before_expiry integer NOT NULL DEFAULT 30 CHECK (days_before_expiry >= 1 AND days_before_expiry <= 365),
  include_driver_license boolean NOT NULL DEFAULT false,
  include_security_license boolean NOT NULL DEFAULT true,
  include_insurance boolean NOT NULL DEFAULT false,
  send_time_local time without time zone NOT NULL DEFAULT '08:00:00'::time without time zone,
  timezone text NOT NULL DEFAULT 'Asia/Manila'::text,
  use_scheduled_send boolean NOT NULL DEFAULT true,
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (id)
);
CREATE TABLE public.paraphernalia (
  id_paraphernalia uuid NOT NULL,
  names text,
  items character varying,
  quantity integer,
  price numeric,
  date character varying,
  timestamp timestamp without time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT paraphernalia_pkey PRIMARY KEY (id_paraphernalia)
);
CREATE TABLE public.paraphernalia_inventory (
  id_paraphernalia_inventory uuid NOT NULL,
  items text,
  stock_balance numeric,
  stock_in numeric,
  stock_out numeric,
  id_paraphernalia uuid,
  contract_id uuid,
  CONSTRAINT paraphernalia_inventory_pkey PRIMARY KEY (id_paraphernalia_inventory),
  CONSTRAINT paraphernalia_inventory_id_paraphernalia_fkey FOREIGN KEY (id_paraphernalia) REFERENCES public.paraphernalia(id_paraphernalia),
  CONSTRAINT paraphernalia_inventory_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id)
);
CREATE TABLE public.resigned (
  last_name character varying,
  first_name character varying,
  middle_name character varying,
  date_resigned character varying,
  detachment character varying,
  remarks text,
  last_duty character varying,
  timestamp timestamp without time zone NOT NULL DEFAULT now(),
  resigned_id uuid NOT NULL,
  applicant_id uuid,
  contract_id uuid,
  id_paraphernalia_inventory uuid,
  CONSTRAINT resigned_pkey PRIMARY KEY (resigned_id),
  CONSTRAINT resigned_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(applicant_id),
  CONSTRAINT resigned_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id),
  CONSTRAINT resigned_inventory_fkey FOREIGN KEY (id_paraphernalia_inventory) REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory)
);
CREATE TABLE public.restock (
  id_restock uuid NOT NULL,
  date character varying,
  status text,
  item text,
  quanitity character varying,
  timestamptz timestamp without time zone NOT NULL DEFAULT now(),
  id_paraphernalia uuid,
  id_paraphernalia_inventory uuid,
  contract_id uuid,
  CONSTRAINT restock_pkey PRIMARY KEY (id_restock),
  CONSTRAINT restock_paraphernalia_fkey FOREIGN KEY (id_paraphernalia) REFERENCES public.paraphernalia(id_paraphernalia),
  CONSTRAINT restock_inventory_fkey FOREIGN KEY (id_paraphernalia_inventory) REFERENCES public.paraphernalia_inventory(id_paraphernalia_inventory),
  CONSTRAINT restock_contract_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id)
);
CREATE TABLE public.role_module_access (
  role_id uuid NOT NULL,
  module_key text NOT NULL,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  CONSTRAINT role_module_access_pkey PRIMARY KEY (role_id, module_key),
  CONSTRAINT role_module_access_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.app_roles(role_id),
  CONSTRAINT role_module_access_module_key_fkey FOREIGN KEY (module_key) REFERENCES public.modules(module_key)
);