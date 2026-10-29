import { useState } from "react";
import { LABELS, type IncidentKind, type PassValidationResult, type PaymentMethod, type PaymentStatus, type RouteServiceType, type SubscriptionStatus } from "@uni/shared";
import { api, qs } from "../api.ts";
import { Loader, PageHeader, useLoad } from "../ui.tsx";

interface Report {
  period: { from: string; to: string };
  occupancy: {
    routeId: string;
    routeCode: string;
    serviceType: RouteServiceType;
    trips: number;
    seats: number;
    confirmed: number;
    boarded: number;
    noShow: number;
    cancelled: number;
    occupancyPct: number | null;
  }[];
  validations: { result: PassValidationResult; n: number }[];
  incidents: { kind: IncidentKind; n: number }[];
  subscriptionsByStatus: { status: SubscriptionStatus; n: number }[];
  payments: { method: PaymentMethod; status: PaymentStatus; n: number; totalKz: number }[] | null;
  notes: string[];
}

const kz = (n: number) => `${n.toLocaleString("pt-PT")} Kz`;

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadOccupancyCsv(report: Report) {
  const header = ["Rota", "Tipo", "Viagens", "Lugares", "Confirmadas", "Embarcadas", "Faltas", "Canceladas", "Ocupação (%)"];
  const rows = report.occupancy.map((r) => [
    r.routeCode,
    LABELS.serviceType[r.serviceType],
    r.trips,
    r.seats,
    r.confirmed,
    r.boarded,
    r.noShow,
    r.cancelled,
    r.occupancyPct,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ocupacao_${report.period.from}_${report.period.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function CountTable({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">Sem registos no período.</p>
      ) : (
        <table>
          <tbody>
            {rows.map((r) => <tr key={r.label}><td>{r.label}</td><td><strong>{r.n}</strong></td></tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const report = useLoad(() => api<Report>(`/admin/reports${qs(range)}`), [range.from, range.to]);
  const data = report.data;

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Indicadores calculados a partir dos registos da base de dados. Por omissão, os últimos 30 dias."
        actions={data && data.occupancy.length > 0 && <button className="btn" onClick={() => downloadOccupancyCsv(data)}>Exportar ocupação (CSV)</button>}
      />
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ from: draft.from || undefined, to: draft.to || undefined });
        }}
      >
        <label className="small">De <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="small">Até <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
        <button className="btn btn-sm">Aplicar</button>
      </form>
      <Loader {...report}>
        {data && (
          <>
            <p className="muted small">Período: {data.period.from} a {data.period.to}</p>
            <div className="card">
              <h3>Ocupação por rota</h3>
              {data.occupancy.length === 0 ? (
                <p className="muted small">Sem viagens no período.</p>
              ) : (
                <table>
                  <thead><tr><th>Rota</th><th>Tipo</th><th>Viagens</th><th>Lugares</th><th>Confirmadas</th><th>Embarcadas</th><th>Faltas</th><th>Canceladas</th><th>Ocupação</th></tr></thead>
                  <tbody>
                    {data.occupancy.map((r) => (
                      <tr key={r.routeId}>
                        <td><strong>{r.routeCode}</strong></td>
                        <td>{LABELS.serviceType[r.serviceType]}</td>
                        <td>{r.trips}</td>
                        <td>{r.seats}</td>
                        <td>{r.confirmed}</td>
                        <td>{r.boarded}</td>
                        <td>{r.noShow}</td>
                        <td>{r.cancelled}</td>
                        <td>{r.occupancyPct === null ? "—" : `${r.occupancyPct.toLocaleString("pt-PT")} %`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="grid-2">
              <CountTable title="Validações de passe" rows={data.validations.map((v) => ({ label: LABELS.passValidation[v.result], n: v.n }))} />
              <CountTable title="Ocorrências por tipo" rows={data.incidents.map((i) => ({ label: LABELS.incidentKind[i.kind], n: i.n }))} />
              <CountTable title="Subscrições por estado (actual)" rows={data.subscriptionsByStatus.map((s) => ({ label: LABELS.subscriptionStatus[s.status], n: s.n }))} />
              {data.payments && (
                <div className="card">
                  <h3>Pagamentos registados</h3>
                  {data.payments.length === 0 ? (
                    <p className="muted small">Sem pagamentos no período.</p>
                  ) : (
                    <table>
                      <thead><tr><th>Método</th><th>Estado</th><th>N.º</th><th>Total</th></tr></thead>
                      <tbody>
                        {data.payments.map((p) => (
                          <tr key={`${p.method}:${p.status}`}>
                            <td>{LABELS.paymentMethod[p.method]}</td>
                            <td>{LABELS.paymentStatus[p.status]}</td>
                            <td>{p.n}</td>
                            <td>{kz(p.totalKz)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
            <ul className="muted small">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Loader>
    </>
  );
}
