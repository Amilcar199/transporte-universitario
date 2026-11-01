import type {
  BookingStatus,
  IncidentKind,
  IncidentStatus,
  IntercityModel,
  PassValidationResult,
  PaymentMethod,
  PaymentStatus,
  Role,
  RouteDirection,
  RouteServiceType,
  StopKind,
  SubscriptionStatus,
  TripStatus,
  VerificationStatus,
} from "@uni/shared";

/** Formas das respostas da API (`apps/api/src/routes`). */

export interface Me {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: Role;
  status: "active" | "disabled";
  permissions: readonly string[];
  student: {
    universityId: string | null;
    universityName: string | null;
    universityShortName: string | null;
    studentNumber: string | null;
    verificationStatus: VerificationStatus;
  } | null;
}

export interface University {
  id: string;
  name: string;
  shortName: string;
  city: string;
  isDemo: boolean;
}

export interface RouteSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  direction: RouteDirection;
  serviceType: RouteServiceType;
  isDemo: boolean;
  universities: string[];
  stopCount: number;
  /** Minutos do início ao fim do percurso, segundo o horário. */
  durationMinutes: number;
  departures: string[];
  daysOfWeek: number[];
  nextTrip: { serviceDate: string; departureTime: string; capacity: number; seatsAvailable: number } | null;
}

export interface RouteStop {
  routeStopId: string;
  position: number;
  minutesFromStart: number;
  stopId: string;
  name: string;
  neighbourhood: string | null;
  landmark: string | null;
  lat: number;
  lng: number;
  kind: StopKind;
  active: boolean;
}

export interface Schedule {
  id: string;
  departureTime: string;
  daysOfWeek: number[];
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
}

export interface RouteDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  direction: RouteDirection;
  serviceType: RouteServiceType;
  isDemo: boolean;
  universities: { id: string; name: string; shortName: string }[];
  stops: RouteStop[];
  schedules: Schedule[];
}

export interface TripAvailability {
  id: string;
  serviceDate: string;
  departureTime: string;
  status: TripStatus;
  capacity: number;
  seatsAvailable: number;
}

export interface MyBooking {
  id: string;
  status: BookingStatus;
  seatNumber: number;
  tripId: string;
  serviceDate: string;
  departureTime: string;
  tripStatus: TripStatus;
  routeCode: string;
  routeName: string;
  direction: RouteDirection;
  stopName: string;
  minutesFromStart: number | null;
  vehiclePlate: string | null;
  endStop: { name: string; minutesFromStart: number } | null;
}

export interface LiveStop {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  minutesFromStart: number;
}

export interface LiveTrip {
  tripId: string;
  status: TripStatus;
  serviceDate: string;
  departureTime: string;
  startedAt: string | null;
  route: { code: string; name: string; stops: LiveStop[] };
  vehicle: { plate: string; model: string | null } | null;
  myStopId: string | null;
  location: { lat: number; lng: number; speedMps: number | null; heading: number | null; recordedAt: string } | null;
  myStop: { name: string; plannedTime: string | null; distanceMeters: number | null } | null;
  note: string;
}

export interface Verification {
  id: string;
  status: VerificationStatus;
  studentNumber: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  universityShortName: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  priceKz: number;
  periodDays: number;
  requiresBooking: boolean;
  maxBookingsPerDay: number;
  intercityModel: IntercityModel;
  intercityDiscountPct: number | null;
  intercityCredits: number | null;
  isDemo: boolean;
}

export interface PaymentMethodInfo {
  method: PaymentMethod;
  label: string;
  flow: string;
  available: boolean;
  unavailableReason?: string;
  instructions?: { iban: string; beneficiary: string };
}

export interface Payment {
  id: string;
  subscriptionId: string;
  amountKz: number;
  method: PaymentMethod;
  status: PaymentStatus;
  providerReference: string | null;
  reviewNote: string | null;
  confirmedAt: string | null;
  createdAt: string;
  instructions?: { iban: string; beneficiary: string } | null;
}

export interface MySubscription {
  id: string;
  status: SubscriptionStatus;
  priceKz: number;
  startDate: string | null;
  endDate: string | null;
  statusReason: string | null;
  routeId: string | null;
  createdAt: string;
  planName: string;
  maxBookingsPerDay: number;
  intercityModel: IntercityModel;
  payments: Payment[];
}

export interface MyPass {
  pass: { id: string; publicCode: string; issuedAt: string } | null;
  status: "none" | SubscriptionStatus;
  subscription?: { planName: string; endDate: string | null; universityShortName: string | null; requiresBooking: boolean } | null;
}

export interface PassToken {
  token: string;
  expiresAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
}

export interface Incident {
  id: string;
  kind: IncidentKind;
  description: string;
  status: IncidentStatus;
  tripId: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface DriverTrip {
  id: string;
  serviceDate: string;
  departureTime: string;
  status: TripStatus;
  capacity: number;
  routeCode: string;
  routeName: string;
  direction: RouteDirection;
  vehiclePlate: string;
  vehicleModel: string | null;
}

export interface ValidatorTrip {
  id: string;
  serviceDate: string;
  departureTime: string;
  status: TripStatus;
  routeCode: string;
  routeName: string;
  vehiclePlate: string;
}

export interface ManifestEntry {
  bookingId: string;
  seatNumber: number;
  status: BookingStatus;
  studentName: string;
  stopId: string;
  stopName: string;
  boardedAt: string | null;
}

export interface DriverTripDetail {
  id: string;
  serviceDate: string;
  departureTime: string;
  status: TripStatus;
  capacity: number;
  startedAt: string | null;
  finishedAt: string | null;
  vehicle: { plate: string; model: string | null } | undefined;
  route: { id: string; code: string; name: string; direction: RouteDirection; stops: RouteStop[] };
  manifest: ManifestEntry[];
}

export interface ValidationResponse {
  result: PassValidationResult;
  label: string;
  holder: string | null;
  seatNumber: number | null;
  reason: string | null;
}
