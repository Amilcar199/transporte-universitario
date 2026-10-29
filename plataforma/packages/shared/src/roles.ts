export const ROLES = [
  "super_admin",
  "transport_operator",
  "university_manager",
  "finance",
  "partner_validator",
  "driver",
  "student",
] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = [
  "super_admin",
  "transport_operator",
  "university_manager",
  "finance",
  "partner_validator",
];

export const PERMISSIONS = [
  "dashboard.view",
  "universities.read",
  "universities.write",
  "routes.read",
  "routes.write",
  "fleet.read",
  "fleet.write",
  "trips.read",
  "trips.write",
  "bookings.read",
  "students.read",
  "students.verify",
  "plans.read",
  "plans.write",
  "subscriptions.read",
  "subscriptions.write",
  "payments.read",
  "payments.confirm",
  "refunds.manage",
  "passes.read",
  "passes.manage",
  "passes.validate",
  "partners.read",
  "partners.write",
  "intercity.read",
  "intercity.write",
  "incidents.read",
  "incidents.manage",
  "notifications.send",
  "users.manage",
  "reports.view",
  "audit.read",
  "settings.manage",
  "driver.operate",
  "student.self",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL_STAFF: Permission[] = PERMISSIONS.filter((p) => p !== "driver.operate" && p !== "student.self");

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: ALL_STAFF,
  transport_operator: [
    "dashboard.view",
    "universities.read",
    "routes.read",
    "routes.write",
    "fleet.read",
    "fleet.write",
    "trips.read",
    "trips.write",
    "bookings.read",
    "passes.read",
    "partners.read",
    "intercity.read",
    "intercity.write",
    "incidents.read",
    "incidents.manage",
    "notifications.send",
    "reports.view",
  ],
  university_manager: [
    "dashboard.view",
    "universities.read",
    "routes.read",
    "students.read",
    "students.verify",
    "bookings.read",
    "subscriptions.read",
    "reports.view",
  ],
  finance: [
    "dashboard.view",
    "plans.read",
    "plans.write",
    "subscriptions.read",
    "subscriptions.write",
    "payments.read",
    "payments.confirm",
    "refunds.manage",
    "reports.view",
  ],
  partner_validator: ["passes.validate", "intercity.read"],
  driver: ["driver.operate", "passes.validate"],
  student: ["student.self"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Administrador geral",
  transport_operator: "Operador de transporte",
  university_manager: "Gestor de universidade",
  finance: "Financeiro",
  partner_validator: "Validador de parceiro",
  driver: "Motorista",
  student: "Estudante",
};
