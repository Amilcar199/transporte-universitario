/** Valores de domínio partilhados entre a API, o painel e a app. A base de dados usa os mesmos valores. */

export const USER_STATUSES = ["active", "disabled"] as const;
export const VERIFICATION_STATUSES = ["not_submitted", "pending", "approved", "rejected"] as const;
export const ROUTE_DIRECTIONS = ["to_university", "from_university"] as const;
export const ROUTE_STATUSES = ["draft", "active", "suspended"] as const;
/** Rotas universitárias servem campus; rotas intercidades ligam cidades e só são usadas com créditos do plano. */
export const ROUTE_SERVICE_TYPES = ["university", "intercity"] as const;
export const STOP_KINDS = ["pickup", "destination"] as const;
export const VEHICLE_STATUSES = ["active", "maintenance", "inactive"] as const;
export const TRIP_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export const BOOKING_STATUSES = ["confirmed", "cancelled", "boarded", "no_show"] as const;
export const SUBSCRIPTION_STATUSES = ["pending_payment", "active", "expired", "suspended", "cancelled"] as const;
export const PAYMENT_METHODS = ["bank_transfer", "multicaixa_express", "paypay", "sandbox"] as const;
export const PAYMENT_STATUSES = ["pending", "awaiting_review", "confirmed", "failed", "cancelled", "refunded"] as const;
export const REFUND_STATUSES = ["requested", "approved", "rejected", "paid"] as const;
export const PASS_STATUSES = ["active", "revoked"] as const;
export const PASS_VALIDATION_RESULTS = [
  "authorized",
  "expired",
  "suspended",
  "revoked",
  "not_covered",
  "booking_required",
  "invalid",
] as const;
export const INCIDENT_KINDS = ["delay", "breakdown", "complaint", "safety", "other"] as const;
export const INCIDENT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const INTERCITY_MODELS = ["none", "included", "discount", "paid_separately", "credits"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type RouteDirection = (typeof ROUTE_DIRECTIONS)[number];
export type RouteStatus = (typeof ROUTE_STATUSES)[number];
export type RouteServiceType = (typeof ROUTE_SERVICE_TYPES)[number];
export type StopKind = (typeof STOP_KINDS)[number];
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export type TripStatus = (typeof TRIP_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PassValidationResult = (typeof PASS_VALIDATION_RESULTS)[number];
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type IntercityModel = (typeof INTERCITY_MODELS)[number];

/** Dias da semana segundo ISO 8601: 1 = segunda-feira … 7 = domingo. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
  7: "Dom",
};

export const LABELS = {
  userStatus: { active: "Activo", disabled: "Desactivado" },
  verification: {
    not_submitted: "Não submetida",
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
  },
  direction: { to_university: "Ida (para a universidade)", from_university: "Volta (da universidade)" },
  routeStatus: { draft: "Rascunho", active: "Activa", suspended: "Suspensa" },
  serviceType: { university: "Universitária", intercity: "Intercidades" },
  stopKind: { pickup: "Paragem de embarque", destination: "Destino (universidade)" },
  vehicleStatus: { active: "Operacional", maintenance: "Em manutenção", inactive: "Inactivo" },
  tripStatus: {
    scheduled: "Agendada",
    in_progress: "Em circulação",
    completed: "Concluída",
    cancelled: "Cancelada",
  },
  bookingStatus: { confirmed: "Confirmada", cancelled: "Cancelada", boarded: "Embarcado", no_show: "Não compareceu" },
  subscriptionStatus: {
    pending_payment: "Pagamento pendente",
    active: "Activa",
    expired: "Expirada",
    suspended: "Suspensa",
    cancelled: "Cancelada",
  },
  paymentMethod: {
    bank_transfer: "Transferência bancária (IBAN)",
    multicaixa_express: "Multicaixa Express",
    paypay: "PayPay",
    sandbox: "Ambiente de testes",
  },
  paymentStatus: {
    pending: "Pendente",
    awaiting_review: "Em análise",
    confirmed: "Confirmado",
    failed: "Falhado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  },
  refundStatus: { requested: "Pedido", approved: "Aprovado", rejected: "Rejeitado", paid: "Pago" },
  passValidation: {
    authorized: "Viagem autorizada",
    expired: "Passe expirado",
    suspended: "Subscrição suspensa",
    revoked: "Passe revogado",
    not_covered: "Viagem não abrangida pelo plano",
    booking_required: "Reserva necessária",
    invalid: "Código inválido",
  },
  incidentKind: {
    delay: "Atraso",
    breakdown: "Avaria",
    complaint: "Reclamação",
    safety: "Segurança",
    other: "Outro",
  },
  incidentStatus: { open: "Aberto", in_progress: "Em tratamento", resolved: "Resolvido", closed: "Encerrado" },
  intercityModel: {
    none: "Não incluído",
    included: "Viagens incluídas no plano",
    discount: "Desconto para assinantes",
    paid_separately: "Pago separadamente",
    credits: "Créditos de utilização",
  },
} as const;
