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
    displayName: "Reassigned",
    path: "/Main_Modules/Reassign/",
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
    moduleKey: "archive",
    displayName: "Archive",
    path: "/Main_Modules/Archive/",
    group: "workforce",
    columns: ["applicant_id", "first_name", "last_name", "archived_at", "archived_by", "status"],
  },
  {
    moduleKey: "trash",
    displayName: "Trash",
    path: "/Main_Modules/Trash/",
    group: "workforce",
    columns: ["applicant_id", "first_name", "last_name", "is_trashed", "trashed_at", "trashed_by"],
  },
  {
    moduleKey: "client",
    displayName: "Client",
    path: "/Main_Modules/Client/",
    group: "logistics",
    columns: [
      "contract_no",
      "contract_no_date",
      "client_name",
      "project_name",
      "specific_area",
      "cluster",
      "contract_start",
      "contract_end",
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
    moduleKey: "inventory",
    displayName: "Inventory",
    path: "/Main_Modules/Inventory/",
    group: "logistics",
    columns: [
      "date",
      "particular",
      "quanitity",
      "amount",
      "remarks",
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
      "names",
      "items",
      "quantity",
      "price",
      "date",
      "stock_balance",
      "stock_in",
      "stock_out",
      "restock_status",
      "restock_item",
      "restock_quantity",
      "import_file",
      "export_template",
      "export_file",
    ],
  },
  {
    moduleKey: "reports",
    displayName: "Reports",
    path: "/Main_Modules/Reports/",
    group: "logistics",
    columns: ["report_type", "date_from", "date_to", "generated_by", "generated_at", "total_records"],
  },
  {
    moduleKey: "requests",
    displayName: "Requests",
    path: "/Main_Modules/Requests/",
    group: "system",
    columns: [
      "requested_module_key",
      "requested_column_key",
      "requester_role",
      "requester_username",
      "status",
      "resolved_by",
      "resolved_at",
    ],
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
    columns: ["client", "inventory", "paraphernalia", "reports"],
  },
];

export function normalizeModuleKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function getCatalogMap() {
  return new Map(MODULE_CATALOG.map((item) => [item.moduleKey, item]));
}

export function columnsForModule(moduleKey: string): string[] {
  const key = normalizeModuleKey(moduleKey);
  const map = getCatalogMap();
  return map.get(key)?.columns ?? [];
}

export function groupedCatalog(search = "") {
  const q = String(search ?? "").trim().toLowerCase();
  const rows = !q
    ? MODULE_CATALOG
    : MODULE_CATALOG.filter(
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
