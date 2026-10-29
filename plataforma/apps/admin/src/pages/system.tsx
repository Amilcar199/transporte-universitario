import { useState } from "react";
import { Link } from "react-router-dom";
import { LABELS, ROLE_LABELS, type Role, type TripStatus } from "@uni/shared";
import { api, qs, type Page } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { Badge, EntityForm, formatDate, formatDateTime, Loader, PageHeader, Pagination, useLoad } from "../ui.tsx";

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
}

export function DashboardPage() {
  const { can } = useAuth();
  const d = useLoad(() => api<Dashboard>("/admin/dashboard"), []);
  const stat = (value: number, label: string, to?: string) => {
    const body = (
      <div className="stat">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    );
    return to ? <Link to={to} style={{ textDecoration: "none", color: "inherit" }}>{body}</Link> : body;
  };
  const totalTrips = d.data ? Object.values(d.data.tripsToday).reduce((a, b) => a + (b ?? 0), 0) : 0;
  return (
    <>
      <PageHeader title="Visão geral" subtitle={d.data ? `Dados de ${formatDate(d.data.date)} (hora de Luanda), calculados a partir da base de dados.` : undefined} actions={<button className="btn" onClick={d.reload}>Actualizar</button>} />
      <Loader {...d}>
        {d.data && (
          <>
            <div className="cards">
              {stat(totalTrips, "Viagens hoje", can("trips.read") ? "/viagens" : undefined)}
              {stat(d.data.tripsToday.in_progress ?? 0, "Em circulação agora")}
              {stat(d.data.bookingsToday, "Reservas para hoje")}
              {stat(d.data.activeSubscriptions, "Subscrições activas", can("subscriptions.read") ? "/subscricoes" : undefined)}
            </div>
            <div className="cards">
              {stat(d.data.pendingVerifications, "Verificações pendentes", can("students.read") ? "/verificacoes" : undefined)}
              {stat(d.data.paymentsToReview, "Pagamentos por confirmar", can("payments.read") ? "/pagamentos" : undefined)}
              {stat(d.data.openIncidents, "Ocorrências em aberto", can("incidents.read") ? "/ocorrencias" : undefined)}
              {stat(d.data.activeRoutes, "Rotas activas", can("routes.read") ? "/rotas" : undefined)}
              {stat(d.data.activeVehicles, "Veículos operacionais", can("fleet.read") ? "/frota" : undefined)}
            </div>
            {totalTrips > 0 && (
              <div className="card">
                <h2>Viagens de hoje por estado</h2>
                <p>
                  {(Object.entries(d.data.tripsToday) as [TripStatus, number][]).map(([s, n]) => (
                    <span key={s} style={{ marginRight: 12 }}><Badge>{LABELS.tripStatus[s]}</Badge> {n}</span>
                  ))}
                </p>
              </div>
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
