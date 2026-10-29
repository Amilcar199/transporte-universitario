import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  BOOKING_STATUSES,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
  INTERCITY_MODELS,
  PASS_STATUSES,
  PASS_VALIDATION_RESULTS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  ROLES,
  ROUTE_DIRECTIONS,
  ROUTE_SERVICE_TYPES,
  ROUTE_STATUSES,
  STOP_KINDS,
  SUBSCRIPTION_STATUSES,
  TRIP_STATUSES,
  USER_STATUSES,
  VEHICLE_STATUSES,
  VERIFICATION_STATUSES,
} from "@uni/shared";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
/** Marca registos criados pelo script de demonstração. */
const isDemo = () => boolean("is_demo").notNull().default(false);

export const roleEnum = pgEnum("user_role", ROLES);
export const userStatusEnum = pgEnum("user_status", USER_STATUSES);
export const verificationStatusEnum = pgEnum("verification_status", VERIFICATION_STATUSES);
export const routeDirectionEnum = pgEnum("route_direction", ROUTE_DIRECTIONS);
export const routeStatusEnum = pgEnum("route_status", ROUTE_STATUSES);
export const routeServiceTypeEnum = pgEnum("route_service_type", ROUTE_SERVICE_TYPES);
export const stopKindEnum = pgEnum("stop_kind", STOP_KINDS);
export const vehicleStatusEnum = pgEnum("vehicle_status", VEHICLE_STATUSES);
export const tripStatusEnum = pgEnum("trip_status", TRIP_STATUSES);
export const bookingStatusEnum = pgEnum("booking_status", BOOKING_STATUSES);
export const subscriptionStatusEnum = pgEnum("subscription_status", SUBSCRIPTION_STATUSES);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHODS);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);
export const refundStatusEnum = pgEnum("refund_status", REFUND_STATUSES);
export const passStatusEnum = pgEnum("pass_status", PASS_STATUSES);
export const passValidationResultEnum = pgEnum("pass_validation_result", PASS_VALIDATION_RESULTS);
export const incidentKindEnum = pgEnum("incident_kind", INCIDENT_KINDS);
export const incidentStatusEnum = pgEnum("incident_status", INCIDENT_STATUSES);
export const intercityModelEnum = pgEnum("intercity_model", INTERCITY_MODELS);

// ---------------------------------------------------------------- Utilizadores e sessões

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: roleEnum("role").notNull(),
    status: userStatusEnum("status").notNull().default("active"),
    photoUrl: text("photo_url"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_uq").on(t.phone),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    deviceLabel: text("device_label"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.refreshTokenHash), index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- Universidades e estudantes

export const universities = pgTable(
  "universities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    city: text("city").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    active: boolean("active").notNull().default(true),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("universities_short_name_uq").on(sql`lower(${t.shortName})`)],
);

export const universityManagers = pgTable(
  "university_managers",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.universityId] })],
);

export const studentProfiles = pgTable(
  "student_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    universityId: uuid("university_id").references(() => universities.id),
    studentNumber: text("student_number"),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("not_submitted"),
    updatedAt: updatedAt(),
  },
  (t) => [index("student_profiles_university_idx").on(t.universityId)],
);

export const studentVerifications = pgTable(
  "student_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id),
    studentNumber: text("student_number").notNull(),
    documentNote: text("document_note"),
    status: verificationStatusEnum("status").notNull().default("pending"),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    decidedAt: ts("decided_at"),
  },
  (t) => [
    index("student_verifications_status_idx").on(t.status),
    uniqueIndex("student_verifications_one_pending_uq").on(t.userId).where(sql`${t.status} = 'pending'`),
  ],
);

// ---------------------------------------------------------------- Rede: paragens, rotas e horários

export const stops = pgTable(
  "stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    neighbourhood: text("neighbourhood"),
    landmark: text("landmark"),
    city: text("city").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    kind: stopKindEnum("kind").notNull().default("pickup"),
    universityId: uuid("university_id").references(() => universities.id),
    active: boolean("active").notNull().default(true),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("stops_lat_ck", sql`${t.lat} between -90 and 90`),
    check("stops_lng_ck", sql`${t.lng} between -180 and 180`),
    check("stops_destination_university_ck", sql`${t.kind} <> 'destination' or ${t.universityId} is not null`),
  ],
);

export const routes = pgTable(
  "routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    direction: routeDirectionEnum("direction").notNull(),
    status: routeStatusEnum("status").notNull().default("draft"),
    serviceType: routeServiceTypeEnum("service_type").notNull().default("university"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("routes_code_uq").on(sql`upper(${t.code})`)],
);

export const routeUniversities = pgTable(
  "route_universities",
  {
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id),
  },
  (t) => [primaryKey({ columns: [t.routeId, t.universityId] })],
);

export const routeStops = pgTable(
  "route_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id),
    position: integer("position").notNull(),
    /** Minutos desde a partida até à passagem prevista nesta paragem. */
    minutesFromStart: integer("minutes_from_start").notNull().default(0),
  },
  (t) => [
    uniqueIndex("route_stops_position_uq").on(t.routeId, t.position),
    uniqueIndex("route_stops_stop_uq").on(t.routeId, t.stopId),
    check("route_stops_minutes_ck", sql`${t.minutesFromStart} >= 0`),
  ],
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    /** Hora local de partida (Africa/Luanda) no formato HH:MM. */
    departureTime: text("departure_time").notNull(),
    /** Dias ISO: 1 = segunda … 7 = domingo. */
    daysOfWeek: integer("days_of_week").array().notNull(),
    active: boolean("active").notNull().default(true),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("schedules_route_idx").on(t.routeId),
    check("schedules_time_ck", sql`${t.departureTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

// ---------------------------------------------------------------- Frota

export const partnerCarriers = pgTable("partner_carriers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nif: text("nif"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  active: boolean("active").notNull().default(true),
  isDemo: isDemo(),
  createdAt: createdAt(),
});

export const partnerValidators = pgTable(
  "partner_validators",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    carrierId: uuid("carrier_id")
      .notNull()
      .references(() => partnerCarriers.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.carrierId] })],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plate: text("plate").notNull(),
    model: text("model").notNull(),
    capacity: integer("capacity").notNull(),
    status: vehicleStatusEnum("status").notNull().default("active"),
    carrierId: uuid("carrier_id").references(() => partnerCarriers.id),
    notes: text("notes"),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("vehicles_plate_uq").on(sql`upper(${t.plate})`),
    check("vehicles_capacity_ck", sql`${t.capacity} between 1 and 100`),
  ],
);

export const drivers = pgTable(
  "drivers",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    licenceNumber: text("licence_number").notNull(),
    defaultVehicleId: uuid("default_vehicle_id").references(() => vehicles.id),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("drivers_licence_uq").on(sql`upper(${t.licenceNumber})`)],
);

// ---------------------------------------------------------------- Operação diária

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id),
    scheduleId: uuid("schedule_id").references(() => schedules.id),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    departureTime: text("departure_time").notNull(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.userId),
    /** Capacidade fixada no momento da atribuição (lugares vendáveis). */
    capacity: integer("capacity").notNull(),
    status: tripStatusEnum("status").notNull().default("scheduled"),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("trips_date_idx").on(t.serviceDate),
    index("trips_driver_idx").on(t.driverId, t.serviceDate),
    uniqueIndex("trips_schedule_date_uq")
      .on(t.scheduleId, t.serviceDate)
      .where(sql`${t.scheduleId} is not null and ${t.status} <> 'cancelled'`),
    uniqueIndex("trips_driver_slot_uq")
      .on(t.driverId, t.serviceDate, t.departureTime)
      .where(sql`${t.status} <> 'cancelled'`),
    uniqueIndex("trips_vehicle_slot_uq")
      .on(t.vehicleId, t.serviceDate, t.departureTime)
      .where(sql`${t.status} <> 'cancelled'`),
    check("trips_capacity_ck", sql`${t.capacity} between 1 and 100`),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id),
    seatNumber: integer("seat_number").notNull(),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    createdAt: createdAt(),
    cancelledAt: ts("cancelled_at"),
    boardedAt: ts("boarded_at"),
  },
  (t) => [
    uniqueIndex("bookings_trip_seat_uq")
      .on(t.tripId, t.seatNumber)
      .where(sql`${t.status} in ('confirmed', 'boarded')`),
    uniqueIndex("bookings_trip_student_uq")
      .on(t.tripId, t.studentId)
      .where(sql`${t.status} in ('confirmed', 'boarded')`),
    index("bookings_student_idx").on(t.studentId),
    check("bookings_seat_ck", sql`${t.seatNumber} >= 1`),
  ],
);

export const vehicleLocations = pgTable(
  "vehicle_locations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    speedMps: doublePrecision("speed_mps"),
    heading: doublePrecision("heading"),
    recordedAt: ts("recorded_at").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [
    index("vehicle_locations_trip_idx").on(t.tripId, t.recordedAt),
    check("vehicle_locations_lat_ck", sql`${t.lat} between -90 and 90`),
    check("vehicle_locations_lng_ck", sql`${t.lng} between -180 and 180`),
  ],
);

// ---------------------------------------------------------------- Planos, subscrições e pagamentos

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    /** Preço em kwanzas inteiros. */
    priceKz: integer("price_kz").notNull(),
    periodDays: integer("period_days").notNull().default(30),
    requiresBooking: boolean("requires_booking").notNull().default(true),
    maxBookingsPerDay: integer("max_bookings_per_day").notNull().default(2),
    intercityModel: intercityModelEnum("intercity_model").notNull().default("none"),
    intercityDiscountPct: integer("intercity_discount_pct").notNull().default(0),
    intercityCredits: integer("intercity_credits").notNull().default(0),
    active: boolean("active").notNull().default(true),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("plans_price_ck", sql`${t.priceKz} >= 0`),
    check("plans_period_ck", sql`${t.periodDays} between 1 and 366`),
    check("plans_discount_ck", sql`${t.intercityDiscountPct} between 0 and 100`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    universityId: uuid("university_id")
      .notNull()
      .references(() => universities.id),
    routeId: uuid("route_id").references(() => routes.id),
    status: subscriptionStatusEnum("status").notNull().default("pending_payment"),
    /** Preço fixado no momento da adesão. */
    priceKz: integer("price_kz").notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    statusReason: text("status_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("subscriptions_student_idx").on(t.studentId),
    uniqueIndex("subscriptions_one_open_uq")
      .on(t.studentId)
      .where(sql`${t.status} in ('pending_payment', 'active', 'suspended')`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    amountKz: integer("amount_kz").notNull(),
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    /** Referência do fornecedor ou do comprovativo (única por método). */
    providerReference: text("provider_reference"),
    /** Chave de idempotência enviada pelo cliente para evitar pagamentos duplicados. */
    idempotencyKey: text("idempotency_key").notNull(),
    receiptNote: text("receipt_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewNote: text("review_note"),
    confirmedAt: ts("confirmed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_idempotency_uq").on(t.studentId, t.idempotencyKey),
    uniqueIndex("payments_provider_ref_uq").on(t.method, t.providerReference).where(sql`${t.providerReference} is not null`),
    index("payments_status_idx").on(t.status),
    check("payments_amount_ck", sql`${t.amountKz} > 0`),
  ],
);

/** Eventos recebidos dos fornecedores (webhooks); a unicidade garante idempotência. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    method: paymentMethodEnum("method").notNull(),
    externalEventId: text("external_event_id").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    payload: jsonb("payload").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_external_uq").on(t.method, t.externalEventId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    amountKz: integer("amount_kz").notNull(),
    reason: text("reason").notNull(),
    status: refundStatusEnum("status").notNull().default("requested"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    decidedAt: ts("decided_at"),
  },
  (t) => [check("refunds_amount_ck", sql`${t.amountKz} > 0`)],
);

// ---------------------------------------------------------------- Passe digital

export const passes = pgTable(
  "passes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    /** Identificador público opaco, impresso no passe (não revela dados pessoais). */
    publicCode: text("public_code").notNull(),
    status: passStatusEnum("status").notNull().default("active"),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    revokeReason: text("revoke_reason"),
  },
  (t) => [
    uniqueIndex("passes_public_code_uq").on(t.publicCode),
    uniqueIndex("passes_one_active_uq").on(t.studentId).where(sql`${t.status} = 'active'`),
  ],
);

export const passValidations = pgTable(
  "pass_validations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    passId: uuid("pass_id").references(() => passes.id),
    validatorId: uuid("validator_id")
      .notNull()
      .references(() => users.id),
    tripId: uuid("trip_id").references(() => trips.id),
    result: passValidationResultEnum("result").notNull(),
    /** Identificador único do token lido; impede a reutilização do mesmo QR. */
    tokenJti: text("token_jti"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("pass_validations_jti_uq").on(t.tokenJti).where(sql`${t.result} = 'authorized'`),
    index("pass_validations_pass_idx").on(t.passId),
  ],
);

// ---------------------------------------------------------------- Incidentes, notificações e auditoria

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id),
    tripId: uuid("trip_id").references(() => trips.id),
    kind: incidentKindEnum("kind").notNull(),
    description: text("description").notNull(),
    status: incidentStatusEnum("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("incidents_status_idx").on(t.status)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("info"),
    /** Evita notificações duplicadas para o mesmo evento. */
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: roleEnum("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    result: text("result").notNull(),
    details: jsonb("details"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_entity_idx").on(t.entityType, t.entityId)],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});
