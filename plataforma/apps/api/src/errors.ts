import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "invalid_request", message, details);
export const unauthorized = (message = "Sessão inválida ou expirada. Inicie sessão novamente.") =>
  new AppError(401, "unauthorized", message);
export const forbidden = (message = "Não tem permissão para executar esta operação.") =>
  new AppError(403, "forbidden", message);
export const notFound = (message = "Registo não encontrado.") => new AppError(404, "not_found", message);
export const conflict = (message: string, code = "conflict") => new AppError(409, code, message);

/** Valida um valor de entrada com Zod e lança um erro 400 com os campos inválidos. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join(".") || "_"] = issue.message;
    throw badRequest("Existem campos inválidos.", { fields });
  }
  return result.data;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  users_email_uq: "Já existe uma conta com este email.",
  users_phone_uq: "Já existe uma conta com este número de telefone.",
  universities_short_name_uq: "Já existe uma universidade com esta sigla.",
  routes_code_uq: "Já existe uma rota com este código.",
  route_stops_position_uq: "Já existe uma paragem nesta posição da rota.",
  route_stops_stop_uq: "Esta paragem já faz parte da rota.",
  vehicles_plate_uq: "Já existe um veículo com esta matrícula.",
  drivers_licence_uq: "Já existe um motorista com esta carta de condução.",
  trips_schedule_date_uq: "Já existe uma viagem atribuída para este horário e data.",
  trips_driver_slot_uq: "O motorista já tem uma viagem atribuída nesta data e hora.",
  trips_vehicle_slot_uq: "O veículo já está atribuído a outra viagem nesta data e hora.",
  bookings_trip_seat_uq: "Este lugar acabou de ser reservado. Tente novamente.",
  bookings_trip_student_uq: "Já tem uma reserva confirmada nesta viagem.",
  subscriptions_one_open_uq: "Já tem uma subscrição activa ou pendente.",
  payments_idempotency_uq: "Este pedido de pagamento já foi registado.",
  payments_provider_ref_uq: "Esta referência de pagamento já foi utilizada.",
  passes_one_active_uq: "Já existe um passe activo para este estudante.",
  student_verifications_one_pending_uq: "Já tem um pedido de verificação pendente.",
};

interface PgLikeError {
  code?: string;
  constraint?: string;
  constraint_name?: string;
  detail?: string;
  cause?: unknown;
}

function findPgError(err: unknown): PgLikeError | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const candidate = current as PgLikeError;
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return undefined;
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.status).send({ error: { code: error.code, message: error.message, details: error.details } });
  }
  const pg = findPgError(error);
  if (pg) {
    const constraint = pg.constraint ?? pg.constraint_name ?? "";
    if (pg.code === "23505") {
      return reply.status(409).send({
        error: { code: "duplicate", message: CONSTRAINT_MESSAGES[constraint] ?? "Registo duplicado.", details: { constraint } },
      });
    }
    if (pg.code === "23503") {
      return reply.status(409).send({
        error: { code: "in_use", message: "Operação impedida: o registo está associado a outros dados.", details: { constraint } },
      });
    }
    if (pg.code === "23514" || pg.code === "22P02" || pg.code === "22007" || pg.code === "22008") {
      return reply.status(400).send({ error: { code: "invalid_value", message: "Valor inválido.", details: { constraint } } });
    }
  }
  const fastifyError = error as FastifyError;
  if (fastifyError.validation || fastifyError.statusCode === 400) {
    return reply.status(400).send({ error: { code: "invalid_request", message: "Pedido inválido." } });
  }
  if (fastifyError.statusCode === 429) {
    return reply.status(429).send({ error: { code: "rate_limited", message: "Demasiados pedidos. Aguarde e tente novamente." } });
  }
  request.log.error({ err: error }, "erro não tratado");
  return reply.status(500).send({ error: { code: "internal", message: "Ocorreu um erro inesperado. Tente novamente." } });
}
