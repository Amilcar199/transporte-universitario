import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatKz, LABELS, ROLE_LABELS, type Role, type TripStatus } from "@uni/shared";
import { api, qs, type Page } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { Badge, EntityForm, formatDate, formatDateTime, initials, Loader, PageHeader, Pagination, useLoad } from "../ui.tsx";

interface Dashboard {
  date: string;
  tripsToday: Partial<Record<TripStatus, number>>;
  bookingsToday: number;
  pendingVerifications: number;
  paymentsToReview: number;
  activeSubscriptions: number;
  openIncidents: number;
  activeRoutes: number;
  activeVehicles: number;
  /** `null` quando o perfil não tem permissão para ver o indicador. */
  registeredStudents: number | null;
  pendingPaymentSubscriptions: number | null;
  confirmedPaymentsThisMonth: { count: number; totalKz: number } | null;
  approvedRefunds: { count: number; totalKz: number } | null;
  drivers: { onDuty: number; active: number } | null;
  hasDemoData: boolean;
}

interface TodayTrip { id: string; departureTime: string; status: TripStatus; capacity: number; routeId: string; routeCode: string; routeName: string; driverName: string; booked: number }
interface PendingVerification { id: string; studentName: string; universityShortName: string; createdAt: string }

const WEEKDAY_DATE = new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function longDate(date: string) {
  const text = WEEKDAY_DATE.format(new Date(`${date}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function compactKz(amount: number) {
  if (amount >= 1_000_000) return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(amount / 1_000_000)} M Kz`;
  return formatKz(amount);
}

function daysAgo(iso: string, today: string) {
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "pedido hoje" : days === 1 ? "pedido há 1 dia" : `pedido há ${days} dias`;
}

function tripBadge(t: TodayTrip) {
  if (t.status === "scheduled" && t.booked >= t.capacity) return <Badge tone="danger">Lotada</Badge>;
  const tone = t.status === "in_progress" ? "info" : t.status === "completed" ? "success" : t.status === "cancelled" ? "danger" : "neutral";
  return <Badge tone={tone}>{t.status === "in_progress" ? "Em circulação" : LABELS.tripStatus[t.status]}</Badge>;
}

function Stat({ label, value, sub, to }: { label: string; value: ReactNode; sub?: ReactNode; to?: string }) {
  const body = (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
  return to ? <Link className="stat-link" to={to}>{body}</Link> : body;
}

export function DashboardPage() {
  const { can } = useAuth();
  const d = useLoad(() => api<Dashboard>("/admin/dashboard"), []);
  const date = d.data?.date;
  const trips = useLoad(async () => (date && can("trips.read") ? api<Page<TodayTrip>>(`/admin/trips${qs({ date, pageSize: 100 })}`) : null), [date]);
  const verifications = useLoad(async () => (can("students.read") ? api<Page<PendingVerification>>(`/admin/verifications${qs({ pageSize: 3 })}`) : null), []);

  const data = d.data;
  const tripsToday = data ? Object.values(data.tripsToday).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const todayTrips = (trips.data?.items ?? []).slice().sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  const open = todayTrips.filter((t) => t.status === "scheduled" || t.status === "in_progress");
  const freeSeats = open.reduce((n, t) => n + Math.max(0, t.capacity - t.booked), 0);
  const byRoute = new Map<string, { label: string; booked: number; capacity: number }>();
  for (const t of todayTrips.filter((x) => x.status !== "cancelled")) {
    const r = byRoute.get(t.routeId) ?? { label: `${t.routeCode} · ${t.routeName}`, booked: 0, capacity: 0 };
    r.booked += t.booked;
    r.capacity += t.capacity;
    byRoute.set(t.routeId, r);
  }

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={date ? `${longDate(date)} · hora de Luanda, a partir da base de dados` : undefined}
        actions={
          <>
            {data?.hasDemoData && <Badge tone="warning">Dados de demonstração</Badge>}
            <button className="btn btn-sm" onClick={() => { d.reload(); trips.reload(); verifications.reload(); }}>Actualizar</button>
          </>
        }
      />
      <Loader {...d}>
        {data && (
          <>
            <div className="cards">
              {data.registeredStudents !== null && (
                <Stat label="Estudantes registados" value={data.registeredStudents} sub={`${data.pendingVerifications} por verificar`} to={can("students.read") ? "/estudantes" : undefined} />
              )}
              <Stat
                label="Subscrições activas"
                value={data.activeSubscriptions}
                sub={data.pendingPaymentSubscriptions !== null ? `${data.pendingPaymentSubscriptions} pendentes de pagamento` : undefined}
                to={can("subscriptions.read") ? "/subscricoes" : undefined}
              />
              <Stat
                label="Viagens hoje"
                value={tripsToday}
                sub={`${data.tripsToday.completed ?? 0} concluídas · ${data.tripsToday.in_progress ?? 0} em circulação`}
                to={can("trips.read") ? "/viagens" : undefined}
              />
              <Stat label="Reservas para hoje" value={data.bookingsToday} sub={trips.data ? `${freeSeats} lugares livres` : undefined} />
              {data.confirmedPaymentsThisMonth && (
                <Stat
                  label="Pagamentos confirmados"
                  value={compactKz(data.confirmedPaymentsThisMonth.totalKz)}
                  sub={`neste mês · ${data.confirmedPaymentsThisMonth.count} pagamento(s) · ${data.paymentsToReview} por confirmar`}
                  to="/pagamentos"
                />
              )}
              {data.approvedRefunds && <Stat label="Reembolsos aprovados" value={data.approvedRefunds.count} sub={formatKz(data.approvedRefunds.totalKz)} to="/reembolsos" />}
              {data.drivers && <Stat label="Motoristas em serviço" value={data.drivers.onDuty} sub={`de ${data.drivers.active} activos`} to={can("fleet.read") ? "/frota" : undefined} />}
              <Stat label="Ocorrências em aberto" value={data.openIncidents} to={can("incidents.read") ? "/ocorrencias" : undefined} />
              <Stat label="Rotas activas" value={data.activeRoutes} sub={`${data.activeVehicles} veículos operacionais`} to={can("routes.read") ? "/rotas" : undefined} />
            </div>

            {(trips.data || verifications.data) && (
              <div className="dash-grid">
                {trips.data && (
                  <section className="card">
                    <div className="card-head">
                      <h2>Viagens de hoje</h2>
                      <Link className="btn-link" to="/viagens">Ver todas</Link>
                    </div>
                    {todayTrips.length === 0 ? (
                      <div className="empty">Não há viagens marcadas para hoje.</div>
                    ) : (
                      <table>
                        <thead><tr><th>Rota</th><th>Motorista</th><th>Partida</th><th>Lotação</th><th>Estado</th></tr></thead>
                        <tbody>
                          {todayTrips.map((t) => (
                            <tr key={t.id}>
                              <td><strong>{t.routeCode}</strong> · {t.routeName}</td>
                              <td>{t.driverName}</td>
                              <td>{t.departureTime}</td>
                              <td>{t.booked} / {t.capacity}</td>
                              <td>{tripBadge(t)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                )}
                {verifications.data && (
                  <section className="card">
                    <div className="card-head">
                      <h2>Verificações pendentes</h2>
                      {verifications.data.total > verifications.data.items.length && <Link className="btn-link" to="/verificacoes">Ver todas ({verifications.data.total})</Link>}
                    </div>
                    {verifications.data.items.length === 0 && <div className="muted">Não há pedidos por rever.</div>}
                    {verifications.data.items.map((v) => (
                      <div key={v.id} className="person-row">
                        <div className="avatar">{initials(v.studentName)}</div>
                        <div className="grow">
                          <strong>{v.studentName}</strong>
                          <div className="muted small">{v.universityShortName} · {daysAgo(v.createdAt, data.date)}</div>
                        </div>
                        <Link className="btn btn-primary btn-sm" to="/verificacoes">Rever</Link>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}

            {byRoute.size > 0 && (
              <section className="card">
                <h2 style={{ marginBottom: 12 }}>Ocupação por rota (hoje)</h2>
                {[...byRoute.entries()].map(([id, r]) => {
                  const ratio = r.capacity ? r.booked / r.capacity : 0;
                  const color = ratio >= 1 ? "var(--danger)" : ratio >= 0.85 ? "var(--accent)" : "var(--primary)";
                  return (
                    <div key={id} className="occupancy">
                      <span className="small">{r.label}</span>
                      <div className="bar"><div style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} /></div>
                      <strong className="small" style={{ textAlign: "right" }}>{ratio >= 1 ? "Lotada" : `${r.booked} / ${r.capacity}`}</strong>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </Loader>
    </>
  );
}

interface AuditEntry { id: number; action: string; entityType: string; entityId: string | null; result: "success" | "denied" | "failure"; details: unknown; ip: string | null; createdAt: string; actorRole: Role | null; actorName: string | null }

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const list = useLoad(() => api<Page<AuditEntry>>(`/admin/audit${qs({ page, action, result })}`), [page, action, result]);
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Registo das operações sensíveis e das tentativas de acesso recusadas. Não contém palavras-passe nem tokens." />
      <div className="toolbar">
        <input placeholder="Acção (ex.: payment, trip, access)…" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}>
          <option value="">Todos os resultados</option>
          <option value="success">Sucesso</option>
          <option value="denied">Recusado</option>
          <option value="failure">Falhado</option>
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Data</th><th>Utilizador</th><th>Acção</th><th>Registo</th><th>Resultado</th><th>Detalhes</th></tr></thead>
          <tbody>
            {list.data?.items.map((e) => (
              <tr key={e.id}>
                <td className="small">{formatDateTime(e.createdAt)}</td>
                <td className="small">{e.actorName ?? "—"}{e.actorRole && <div className="muted">{ROLE_LABELS[e.actorRole]}</div>}</td>
                <td><code>{e.action}</code></td>
                <td className="small">{e.entityType}{e.entityId && <div className="muted">{e.entityId}</div>}</td>
                <td><Badge tone={e.result === "success" ? "success" : e.result === "denied" ? "danger" : "warning"}>{e.result === "success" ? "Sucesso" : e.result === "denied" ? "Recusado" : "Falhado"}</Badge></td>
                <td className="small"><code>{e.details ? JSON.stringify(e.details) : ""}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
    </>
  );
}

export function SettingsPage() {
  const settings = useLoad(() => api<{ bookingCancelCutoffMinutes: number; bookingHorizonDays: number }>("/admin/settings"), []);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeader title="Definições" subtitle="Regras operacionais aplicadas pelo servidor." />
      <Loader {...settings}>
        {settings.data && (
          <div className="card" style={{ maxWidth: 640 }}>
            <EntityForm
              fields={[
                { name: "bookingCancelCutoffMinutes", label: "Cancelamento: antecedência mínima (minutos)", type: "number", required: true },
                { name: "bookingHorizonDays", label: "Reservas: dias de antecedência máxima", type: "number", required: true },
              ]}
              initial={settings.data}
              onSubmit={async (v) => {
                setSaved(false);
                await api("/admin/settings", { method: "PUT", body: v });
                setSaved(true);
                settings.reload();
              }}
            />
            {saved && <div className="alert alert-info">Definições guardadas.</div>}
          </div>
        )}
      </Loader>
    </>
  );
}
