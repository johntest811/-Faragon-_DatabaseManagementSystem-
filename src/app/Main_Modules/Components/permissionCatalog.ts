export type ModuleGroupKey = "workforce" | "logistics" | "system" | "other";

export type ModuleGroupDef = {
  key: ModuleGroupKey;
  title: string;
};

export type ModuleCatalogItem = {
  moduleKey: string;
  displayName: string;
  path: string;
  group: ModuleGroupKey;
  columns: string[];
};

export const MODULE_GROUPS: ModuleGroupDef[] = [
  { key: "workforce", title: "Workforce Pages" },
  { key: "logistics", title: "Logistics Pages" },
  { key: "system", title: "System Pages" },
  { key: "other", title: "Other Pages" },
];

export const MODULE_CATALOG: ModuleCatalogItem[] = [
  {
    moduleKey: "dashboard",
    displayName: "Dashboard",
    path: "/Main_Modules/Dashboard/",
    group: "workforce",
    columns: ["kpi_total_employees", "kpi_active_employees", "kpi_archived", "kpi_pending_requests"],
  },
  {
    moduleKey: "client",
    displayName: "Client",
    path: "/Main_Modules/Client/",
    group: "workforce",
    columns: [
      "contract_no",
      "client_name",
      "project_name",
      "specific_area",
      "cluster",
      "contract_start",
      "contract_end",
      "notification_recipient_email",
      "contracted_manpower",
      "deployed_guards",
      "status",
      "created_at",
      "remarks",
      "import_file",
      "export_template",
      "export_file",
    ],
  },
  {
    moduleKey: "applicants",
    displayName: "Applicant",
    path: "/Main_Modules/Applicants/",
    group: "workforce",
    columns: [
      "custom_id",
      "first_name",
      "middle_name",
      "last_name",
      "client_position",
      "detachment",
      "status",
      "date_hired_fsai",
      "client_email",
      "client_contact_num",
      "gender",
      "birth_date",
      "age",
      "profile_image_path",
      "export_file",
    ],
  },
  {
    moduleKey: "employees",
    displayName: "Employees",
    path: "/Main_Modules/Employees/",
    group: "workforce",
    columns: [
      "custom_id",
      "first_name",
      "middle_name",
      "last_name",
      "client_position",
      "detachment",
      "status",
      "date_hired_fsai",
      "client_email",
      "client_contact_num",
      "gender",
      "birth_date",
      "age",
      "profile_image_path",
      "import_file",
      "export_template",
      "export_file",
    ],
  },
  {
    moduleKey: "reassign",
    displayName: "AWOL",
    path: "/Main_Modules/AWOL/",
    group: "workforce",
    columns: ["applicant_id", "first_name", "last_name", "detachment", "status", "updated_at"],
  },
  {
    moduleKey: "resigned",
    displayName: "Resigned",
    path: "/Main_Modules/Resigned/",
    group: "workforce",
    columns: ["applicant_id", "first_name", "last_name", "date_resigned", "last_duty", "status"],
  },
  {
    moduleKey: "retired",
    displayName: "Retired",
    path: "/Main_Modules/Retired/",
    group: "workforce",
    columns: ["applicant_id", "first_name", "last_name", "retired_at", "retired_by", "status"],
  },
  {
    moduleKey: "floating",
    displayName: "Floating",
    path: "/Main_Modules/Floating/",
    group: "workforce",
    columns: ["applicant_id", "custom_id", "first_name", "last_name", "client_position", "detachment", "date_hired_fsai", "status"],
  },
  {
    moduleKey: "archive",
    displayName: "Archive",
    path: "/Main_Modules/Archive/",
    group: "workforce",
    columns: ["applicant_id", "first_name", "last_name", "archived_at", "archived_by", "status"],
  },
  {
    moduleKey: "inventory",
    displayName: "Inventory",
    path: "/Main_Modules/Inventory/",
    group: "logistics",
    columns: [
      "equipment",
      "control_number",
      "serial_plate_number",
      "maker",
      "model_number",
      "detachment",
      "date",
      "particular",
      "quanitity",
      "amount",
      "remarks",
      "unit_cost",
      "date_purchased",
      "expiration",
      "last_maintenance",
      "user",
      "firearms_name",
      "communications_name",
      "furniture_name",
      "office_name",
      "sec_name",
      "vehicle_name",
      "total_amount",
      "grand_total",
      "import_file",
      "export_template",
      "export_file",
    ],
  },
  {
    moduleKey: "paraphernalia",
    displayName: "Paraphernalia",
    path: "/Main_Modules/Paraphernalia/",
    group: "logistics",
    columns: [
      "stock_in_timestamp",
      "stock_in_date",
      "stock_in_status",
      "stock_in_item",
      "stock_in_quantity",
      "stock_in_attachment",
      "stock_out_timestamp",
      "stock_out_date",
      "stock_out_names",
      "stock_out_items",
      "stock_out_qty",
      "stock_out_price",
      "stock_out_status",
      "stock_out_date_posted",
      "inventory_client_name",
      "inventory_items",
      "inventory_stock_balance",
      "inventory_stock_in",
      "inventory_stock_out",
      "main_inventory_item",
      "main_inventory_category",
      "main_inventory_unit_price",
      "main_inventory_stock_in",
      "main_inventory_stock_out",
      "main_inventory_balance",
      "main_inventory_value",
      "manage_items",
      "add_stock_in",
      "add_stock_out",
      "import_file",
      "export_template",
      "export_file",
    ],
  },
  {
    moduleKey: "car_insurance_expiration",
    displayName: "Car Insurance Expiration",
    path: "/Main_Modules/Logistics/CarInsuranceExpiration/",
    group: "logistics",
    columns: [
      "record_no",
      "patrol",
      "post_distributions",
      "make",
      "model",
      "color",
      "plate_number",
      "insurance_company",
      "policy_from_date",
      "expires_on",
      "car_registration_from_date",
      "car_registration_to_date",
      "days_before_expiry",
      "notes",
    ],
  },
  {
    moduleKey: "preview_service_anniversary",
    displayName: "Preview (1+ year of service)",
    path: "/Main_Modules/Employees/",
    group: "system",
    columns: [],
  },
  {
    moduleKey: "recent_activities",
    displayName: "Recent Activities",
    path: "/Main_Modules/Audit/",
    group: "system",
    columns: [],
  },
  {
    moduleKey: "expiring_licenses_records",
    displayName: "Expiring Licenses and Records",
    path: "/Main_Modules/Employees/",
    group: "system",
    columns: [],
  },
  {
    moduleKey: "expiring_contracts",
    displayName: "Expiring Contracts",
    path: "/Main_Modules/Client/",
    group: "system",
    columns: [],
  },
  {
    moduleKey: "requests",
    displayName: "Requests",
    path: "/Main_Modules/Requests/",
    group: "system",
    columns: [
      "request_scope_row",
      "request_scope_column",
      "requested_module_key",
      "requested_column_keys",
      "requested_column_key",
      "requested_applicant_ids",
      "requested_applicant_id",
      "requested_row_identifier_key",
      "requested_row_identifier_values",
      "requested_row_identifier_value",
      "requester_role",
      "requester_username",
      "approver_admin_id",
      "status",
      "resolved_by",
      "resolved_at",
    ],
  },
  {
    moduleKey: "access_reviewer_queue",
    displayName: "Reviewer Queue",
    path: "/Main_Modules/Requests/Queue/",
    group: "system",
    columns: [],
  },
  {
    moduleKey: "audit",
    displayName: "Audit",
    path: "/Main_Modules/Audit/",
    group: "system",
    columns: ["actor_user_id", "actor_email", "action", "page", "details", "created_at"],
  },
  {
    moduleKey: "settings",
    displayName: "Settings",
    path: "/Main_Modules/Settings/",
    group: "system",
    columns: ["setting_key", "setting_value", "updated_by", "updated_at"],
  },
  {
    moduleKey: "access",
    displayName: "Admin Accounts",
    path: "/Main_Modules/AdminAccounts/",
    group: "system",
    columns: ["username", "role", "full_name", "is_active", "created_at"],
  },
  {
    moduleKey: "logistics",
    displayName: "Logistics",
    path: "/Main_Modules/Logistics/",
    group: "other",
    columns: ["inventory", "paraphernalia", "car_insurance_expiration"],
  },
];

const COLUMN_LABEL_OVERRIDES: Record<string, string> = {
  kpi_total_employees: "KPI Total Employees",
  kpi_active_employees: "KPI Active Employees",
  kpi_archived: "KPI Archived",
  kpi_pending_requests: "KPI Pending Requests",
  contract_no: "Contract Series",
  notification_recipient_email: "Notification Recipient Gmail",
  record_no: "No.",
  patrol: "Patrol",
  post_distributions: "Post/s Distributions",
  make: "Make",
  model: "Model",
  color: "Color",
  plate_number: "Plate Number",
  insurance_company: "Insurance Company",
  policy_from_date: "Policy Term - Date Registered",
  expires_on: "Policy Term - Expiration",
  car_registration_from_date: "Car Registration Date - Date Register",
  car_registration_to_date: "Car Registration Date - Expiration",
  days_before_expiry: "Days Before Expiry",
  notes: "Remarks",
  equipment: "Equipment",
  control_number: "CONTROLNUMBER",
  serial_plate_number: "Serial # / Plate #",
  maker: "Maker",
  model_number: "Model #",
  detachment: "Detachment",
  unit_cost: "Unit Cost",
  date_purchased: "Date of Purchased",
  expiration: "Expiration",
  last_maintenance: "Last Maintenance",
  user: "User",
  firearms_name: "Communication",
  communications_name: "Security / Safety",
  furniture_name: "Tactical",
  office_name: "Transportation / Mobility",
  sec_name: "Emergency / Medical",
  vehicle_name: "Office Equipment",
  stock_in_timestamp: "Stock In Timestamp",
  stock_in_date: "Stock In Date",
  stock_in_status: "Stock In Status",
  stock_in_item: "Stock In Item",
  stock_in_quantity: "Stock In Quantity",
  stock_in_attachment: "Stock In Attachment",
  stock_out_timestamp: "Stock Out Timestamp",
  stock_out_date: "Stock Out Date",
  stock_out_names: "Stock Out Names",
  stock_out_items: "Stock Out Items",
  stock_out_qty: "Stock Out QTY",
  stock_out_price: "Stock Out Price",
  stock_out_status: "Stock Out Status",
  stock_out_date_posted: "Stock Out Date Posted",
  inventory_client_name: "Inventory Client Name",
  inventory_items: "Inventory Items",
  inventory_stock_balance: "Inventory Stock Balance",
  inventory_stock_in: "Inventory Stock In",
  inventory_stock_out: "Inventory Stock Out",
  main_inventory_item: "Main Inventory Items",
  main_inventory_category: "Main Inventory Type",
  main_inventory_unit_price: "Main Inventory Unit Price",
  main_inventory_stock_in: "Main Inventory Stock In",
  main_inventory_stock_out: "Main Inventory Stock Out",
  main_inventory_balance: "Main Inventory Available Stock",
  main_inventory_value: "Main Inventory Value",
  manage_items: "Manage Paraphernalia Items",
  add_stock_in: "Add Stock In",
  add_stock_out: "Add Stock Out",
};

export const SECURITY_ACCOUNT_PARAPHERNALIA_COLUMNS = [
  "stock_in_timestamp",
  "stock_in_date",
  "stock_in_status",
  "stock_in_item",
  "stock_in_quantity",
  "stock_in_attachment",
  "inventory_client_name",
  "inventory_items",
  "inventory_stock_balance",
  "inventory_stock_in",
  "inventory_stock_out",
  "add_stock_out",
] as const;

export function normalizeModuleKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeColumnKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

const UPPERCASE_COLUMN_WORDS = new Set(["kpi", "id", "fsai", "ocr", "sss"]);

function toTitleWord(part: string) {
  if (!part) return "";
  if (UPPERCASE_COLUMN_WORDS.has(part)) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export function shouldHidePermissionColumn(columnKey: string) {
  const key = normalizeColumnKey(columnKey);
  if (!key) return true;
  if (key === "custom_id") return false;
  return key === "id" || key.endsWith("_id");
}

export function formatPermissionColumnLabel(columnKey: string) {
  const key = normalizeColumnKey(columnKey);
  if (!key) return "Unknown Column";

  const override = COLUMN_LABEL_OVERRIDES[key];
  if (override) return override;

  const normalized = key.replace(/_id$/i, "");
  return normalized
    .split("_")
    .filter(Boolean)
    .map(toTitleWord)
    .join(" ");
}

export function getCatalogMap() {
  return new Map(MODULE_CATALOG.map((item) => [item.moduleKey, item]));
}

export function columnsForModule(moduleKey: string): string[] {
  const key = normalizeModuleKey(moduleKey);
  const map = getCatalogMap();
  return map.get(key)?.columns ?? [];
}

export function visibleColumnsForModule(moduleKey: string): string[] {
  return columnsForModule(moduleKey).filter((columnKey) => !shouldHidePermissionColumn(columnKey));
}

export function groupedCatalog(search = "") {
  const q = String(search ?? "").trim().toLowerCase();
  const visibleCatalog = MODULE_CATALOG.map((item) => ({
    ...item,
    columns: visibleColumnsForModule(item.moduleKey),
  }));

  const rows = !q
    ? visibleCatalog
    : visibleCatalog.filter(
        (m) =>
          m.moduleKey.includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          m.columns.some((c) => c.toLowerCase().includes(q))
      );

  return MODULE_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((r) => r.group === group.key),
  })).filter((g) => g.rows.length > 0);
}
