import { useState } from "react";
import { formatKz, INTERCITY_MODELS, LABELS, PAYMENT_STATUSES, SUBSCRIPTION_STATUSES, type IntercityModel, type PaymentMethod, type PaymentStatus, type SubscriptionStatus } from "@uni/shared";
import { api, qs, type Page } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { Badge, ConfirmModal, DemoTag, EntityForm, formatDate, formatDateTime, Loader, Modal, PageHeader, Pagination, useLoad, type FieldDef } from "../ui.tsx";

interface Plan { id: string; name: string; description: string | null; priceKz: number; periodDays: number; requiresBooking: boolean; maxBookingsPerDay: number; intercityModel: IntercityModel; intercityDiscountPct: number; intercityCredits: number; active: boolean; isDemo: boolean }

function intercitySummary(p: Plan) {
  switch (p.intercityModel) {
    case "none": return "Sem intercidades";
    case "discount": return `${p.intercityDiscountPct}% de desconto`;
    case "included":
    case "credits": return `${p.intercityCredits} viagem(ns) por período`;
    case "paid_separately": return "Pago à parte";
  }
}

export function PlansPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const list = useLoad(() => api<Plan[]>("/admin/plans"), []);
  const fields: FieldDef[] = [
    { name: "name", label: "Nome", required: true },
    { name: "priceKz", label: "Preço (Kz)", type: "number", required: true },
    { name: "periodDays", label: "Duração (dias)", type: "number", required: true },
    { name: "maxBookingsPerDay", label: "Reservas por dia", type: "number", required: true },
    { name: "requiresBooking", label: "Exige reserva para embarcar", type: "checkbox" },
    { name: "active", label: "Disponível para novas adesões", type: "checkbox" },
    { name: "description", label: "Descrição", type: "textarea" },
    { name: "intercityModel", label: "Intercidades", type: "select", required: true, options: INTERCITY_MODELS.map((m) => ({ value: m, label: LABELS.intercityModel[m] })), help: "Nunca ilimitado: viagens incluídas ou créditos exigem um número máximo." },
    { name: "intercityCredits", label: "Viagens intercidades por período", type: "number", hidden: (v) => v.intercityModel !== "included" && v.intercityModel !== "credits" },
    { name: "intercityDiscountPct", label: "Desconto intercidades (%)", type: "number", hidden: (v) => v.intercityModel !== "discount" },
  ];
  return (
    <>
      <PageHeader title="Planos" subtitle="Alterar o preço não afecta subscrições já criadas (o preço fica fixado na adesão)." actions={can("plans.write") && <button className="btn btn-primary" onClick={() => setEditing("new")}>Novo plano</button>} />
      <Loader {...list} isEmpty={list.data?.length === 0}>
        <table>
          <thead><tr><th>Plano</th><th>Preço</th><th>Duração</th><th>Reservas/dia</th><th>Intercidades</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong><DemoTag show={p.isDemo} /><br /><span className="small muted">{p.description}</span></td>
                <td>{formatKz(p.priceKz)}</td>
                <td>{p.periodDays} dias</td>
                <td>{p.maxBookingsPerDay}</td>
                <td className="small">{intercitySummary(p)}</td>
                <td>{p.active ? <Badge tone="success">Disponível</Badge> : <Badge>Indisponível</Badge>}</td>
                <td className="actions-cell">{can("plans.write") && <button className="btn btn-sm" onClick={() => setEditing(p)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Loader>
      {editing && (
        <Modal title={editing === "new" ? "Novo plano" : "Editar plano"} onClose={() => setEditing(null)}>
          <EntityForm
            fields={fields}
            initial={editing === "new" ? { periodDays: 30, maxBookingsPerDay: 2, requiresBooking: true, active: true, intercityModel: "none", intercityCredits: 0, intercityDiscountPct: 0 } : editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              const body = { ...v, intercityCredits: v.intercityCredits ?? 0, intercityDiscountPct: v.intercityDiscountPct ?? 0, description: v.description || null };
              if (editing === "new") await api("/admin/plans", { method: "POST", body });
              else await api(`/admin/plans/${editing.id}`, { method: "PATCH", body });
              setEditing(null);
              list.reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}

interface Subscription { id: string; status: SubscriptionStatus; priceKz: number; startDate: string | null; endDate: string | null; statusReason: string | null; createdAt: string; studentName: string; planName: string; universityShortName: string }

const subTone = (s: SubscriptionStatus) => (s === "active" ? "success" : s === "pending_payment" ? "warning" : s === "suspended" ? "danger" : "neutral");

export function SubscriptionsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [changing, setChanging] = useState<{ s: Subscription; to: "suspended" | "active" } | null>(null);
  const list = useLoad(() => api<Page<Subscription>>(`/admin/subscriptions${qs({ status, search, page })}`), [status, search, page]);
  return (
    <>
      <PageHeader title="Subscrições" subtitle="Uma subscrição só fica activa depois de o pagamento ser confirmado." />
      <div className="toolbar">
        <input placeholder="Pesquisar estudante…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos os estados</option>
          {SUBSCRIPTION_STATUSES.map((s) => <option key={s} value={s}>{LABELS.subscriptionStatus[s]}</option>)}
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0}>
        <table>
          <thead><tr><th>Estudante</th><th>Plano</th><th>Universidade</th><th>Preço</th><th>Período</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((s) => (
              <tr key={s.id}>
                <td>{s.studentName}</td>
                <td>{s.planName}</td>
                <td>{s.universityShortName}</td>
                <td>{formatKz(s.priceKz)}</td>
                <td className="small">{s.startDate ? `${formatDate(s.startDate)} a ${formatDate(s.endDate)}` : "—"}</td>
                <td><Badge tone={subTone(s.status)}>{LABELS.subscriptionStatus[s.status]}</Badge>{s.statusReason && <div className="small muted">{s.statusReason}</div>}</td>
                <td className="actions-cell">
                  {can("subscriptions.write") && s.status === "active" && <button className="btn btn-sm" onClick={() => setChanging({ s, to: "suspended" })}>Suspender</button>}
                  {can("subscriptions.write") && s.status === "suspended" && <button className="btn btn-sm" onClick={() => setChanging({ s, to: "active" })}>Reactivar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {changing && (
        <ConfirmModal
          title={changing.to === "suspended" ? "Suspender subscrição" : "Reactivar subscrição"}
          message={changing.to === "suspended" ? `O passe de ${changing.s.studentName} passa a ser recusado na validação até ser reactivado.` : `O passe de ${changing.s.studentName} volta a ser aceite até ${formatDate(changing.s.endDate)}.`}
          danger={changing.to === "suspended"}
          requireReason="Motivo (enviado ao estudante)"
          onClose={() => setChanging(null)}
          onConfirm={async (reason) => {
            await api(`/admin/subscriptions/${changing.s.id}`, { method: "PATCH", body: { status: changing.to, reason } });
            list.reload();
          }}
        />
      )}
    </>
  );
}

interface Payment { id: string; amountKz: number; method: PaymentMethod; status: PaymentStatus; providerReference: string | null; receiptNote: string | null; reviewNote: string | null; confirmedAt: string | null; createdAt: string; studentName: string }

const payTone = (s: PaymentStatus) => (s === "confirmed" ? "success" : s === "awaiting_review" ? "warning" : s === "failed" ? "danger" : "neutral");

export function PaymentsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState<string>("awaiting_review");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{ p: Payment; kind: "confirm" | "reject" | "refund" } | null>(null);
  const list = useLoad(() => api<Page<Payment>>(`/admin/payments${qs({ status, search, page })}`), [status, search, page]);
  return (
    <>
      <PageHeader title="Pagamentos" subtitle="Transferências: confirme apenas depois de verificar a entrada do valor no extracto bancário." />
      <div className="alert alert-info">Multicaixa Express e PayPay ainda não estão integrados (exigem contrato e credenciais de um fornecedor autorizado). Nenhum pagamento destes métodos é simulado.</div>
      <div className="toolbar">
        <input placeholder="Pesquisar estudante ou referência…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos os estados</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{LABELS.paymentStatus[s]}</option>)}
        </select>
      </div>
      <Loader {...list} isEmpty={list.data?.items.length === 0} empty="Sem pagamentos neste estado.">
        <table>
          <thead><tr><th>Data</th><th>Estudante</th><th>Método</th><th>Valor</th><th>Referência</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((p) => (
              <tr key={p.id}>
                <td className="small">{formatDateTime(p.createdAt)}</td>
                <td>{p.studentName}</td>
                <td>{LABELS.paymentMethod[p.method]}{p.method === "sandbox" && <Badge tone="warning">TESTE</Badge>}</td>
                <td>{formatKz(p.amountKz)}</td>
                <td className="small">{p.providerReference ?? "—"}{p.receiptNote && <div className="muted">{p.receiptNote}</div>}</td>
                <td><Badge tone={payTone(p.status)}>{LABELS.paymentStatus[p.status]}</Badge>{p.reviewNote && <div className="small muted">{p.reviewNote}</div>}</td>
                <td className="actions-cell">
                  {can("payments.confirm") && p.method === "bank_transfer" && p.status === "awaiting_review" && (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => setAction({ p, kind: "confirm" })}>Confirmar</button>{" "}
                      <button className="btn btn-sm" onClick={() => setAction({ p, kind: "reject" })}>Rejeitar</button>
                    </>
                  )}
                  {can("refunds.manage") && p.status === "confirmed" && <button className="btn btn-sm" onClick={() => setAction({ p, kind: "refund" })}>Reembolsar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && <Pagination {...list.data} onPage={setPage} />}
      </Loader>
      {action?.kind === "confirm" && (
        <ConfirmModal
          title="Confirmar pagamento"
          message={`Confirma que recebeu ${formatKz(action.p.amountKz)} de ${action.p.studentName} (referência ${action.p.providerReference})? A subscrição fica activa e o passe é emitido.`}
          confirmLabel="Confirmar recebimento"
          onClose={() => setAction(null)}
          onConfirm={async () => { await api(`/admin/payments/${action.p.id}/confirm`, { method: "POST", body: {} }); list.reload(); }}
        />
      )}
      {action?.kind === "reject" && (
        <ConfirmModal
          title="Rejeitar pagamento"
          message="O estudante será notificado e poderá submeter um novo pagamento."
          confirmLabel="Rejeitar"
          danger
          requireReason="Motivo (enviado ao estudante)"
          onClose={() => setAction(null)}
          onConfirm={async (note) => { await api(`/admin/payments/${action.p.id}/reject`, { method: "POST", body: { note } }); list.reload(); }}
        />
      )}
      {action?.kind === "refund" && (
        <Modal title="Pedir reembolso" onClose={() => setAction(null)}>
          <EntityForm
            fields={[
              { name: "amountKz", label: "Valor (Kz)", type: "number", required: true, help: `Máximo: ${formatKz(action.p.amountKz)} menos reembolsos já pedidos.` },
              { name: "reason", label: "Motivo", type: "textarea", required: true },
            ]}
            initial={{ amountKz: action.p.amountKz }}
            submitLabel="Registar pedido"
            onCancel={() => setAction(null)}
            onSubmit={async (v) => { await api(`/admin/payments/${action.p.id}/refunds`, { method: "POST", body: v }); setAction(null); list.reload(); }}
          />
        </Modal>
      )}
    </>
  );
}

interface Refund { id: string; paymentId: string; amountKz: number; reason: string; status: "requested" | "approved" | "rejected" | "paid"; decisionNote: string | null; createdAt: string; decidedAt: string | null; studentName: string }

export function RefundsPage() {
  const list = useLoad(() => api<Refund[]>("/admin/refunds"), []);
  const [action, setAction] = useState<{ r: Refund; to: "approved" | "rejected" | "paid" } | null>(null);
  const labels = { approved: "Aprovar", rejected: "Rejeitar", paid: "Marcar como pago" } as const;
  return (
    <>
      <PageHeader title="Reembolsos" subtitle="Um reembolso total pago cancela a subscrição associada. Registe 'pago' só depois da transferência efectiva." />
      <Loader {...list} isEmpty={list.data?.length === 0} empty="Sem pedidos de reembolso.">
        <table>
          <thead><tr><th>Pedido</th><th>Estudante</th><th>Valor</th><th>Motivo</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.map((r) => (
              <tr key={r.id}>
                <td className="small">{formatDateTime(r.createdAt)}</td>
                <td>{r.studentName}</td>
                <td>{formatKz(r.amountKz)}</td>
                <td className="small">{r.reason}{r.decisionNote && <div className="muted">{r.decisionNote}</div>}</td>
                <td><Badge tone={r.status === "paid" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{LABELS.refundStatus[r.status]}</Badge></td>
                <td className="actions-cell">
                  {r.status === "requested" && <><button className="btn btn-sm" onClick={() => setAction({ r, to: "approved" })}>Aprovar</button>{" "}<button className="btn btn-sm" onClick={() => setAction({ r, to: "rejected" })}>Rejeitar</button></>}
                  {r.status === "approved" && <button className="btn btn-sm btn-primary" onClick={() => setAction({ r, to: "paid" })}>Marcar como pago</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Loader>
      {action && (
        <ConfirmModal
          title={labels[action.to]}
          message={`${labels[action.to]} o reembolso de ${formatKz(action.r.amountKz)} a ${action.r.studentName}?`}
          danger={action.to === "rejected"}
          requireReason={action.to === "rejected" ? "Motivo" : undefined}
          onClose={() => setAction(null)}
          onConfirm={async (note) => { await api(`/admin/refunds/${action.r.id}`, { method: "PATCH", body: { status: action.to, note: note || undefined } }); list.reload(); }}
        />
      )}
    </>
  );
}
