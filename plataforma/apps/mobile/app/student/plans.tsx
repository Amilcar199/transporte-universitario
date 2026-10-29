import { formatKz, LABELS, type PaymentMethod } from "@uni/shared";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { api, ApiError, newIdempotencyKey } from "../../src/api.ts";
import { useAuth } from "../../src/auth.tsx";
import { formatDate, formatDateTime } from "../../src/format.ts";
import type { MySubscription, Payment, PaymentMethodInfo, Plan } from "../../src/types.ts";
import {
  Badge,
  Body,
  Button,
  Card,
  Chip,
  DemoTag,
  ErrorBox,
  Field,
  Loading,
  Notice,
  Row,
  Screen,
  Subtitle,
  errorMessage,
  useLoad,
  useRefreshOnFocus,
  type Tone,
} from "../../src/ui.tsx";

const PAY_TONE: Record<string, Tone> = { pending: "warning", awaiting_review: "info", confirmed: "success", failed: "danger", cancelled: "neutral", refunded: "neutral" };

function intercityText(p: Plan): string {
  if (p.intercityModel === "discount" && p.intercityDiscountPct) return `Intercidades: ${p.intercityDiscountPct}% de desconto`;
  if ((p.intercityModel === "included" || p.intercityModel === "credits") && p.intercityCredits) {
    return `Intercidades: ${p.intercityCredits} viagens por período`;
  }
  return `Intercidades: ${LABELS.intercityModel[p.intercityModel]}`;
}

export default function PlansScreen() {
  const { me } = useAuth();
  const verified = me?.student?.verificationStatus === "approved";
  const data = useLoad(async () => {
    const [subs, plans, methods] = await Promise.all([
      api<MySubscription[]>("/subscriptions/me"),
      api<Plan[]>("/plans"),
      api<PaymentMethodInfo[]>("/payment-methods"),
    ]);
    return { subs, plans, methods };
  });
  useRefreshOnFocus(data.reload);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  /** Uma chave por intenção (subscrição + método): repetir o toque não cria pagamentos duplicados. */
  const intents = useRef(new Map<string, string>());

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    setFields({});
    try {
      await action();
      await data.reload();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(null);
    }
  }

  if (data.loading && !data.data) return <Loading />;
  if (!data.data) return <Screen><ErrorBox message={data.error} onRetry={() => void data.reload()} /></Screen>;

  const { subs, plans, methods } = data.data;
  const open = subs.find((s) => ["pending_payment", "active", "suspended"].includes(s.status));
  const pending = open?.status === "pending_payment" ? open : null;
  const openPayment = pending?.payments.find((p) => p.status === "pending" || p.status === "awaiting_review") ?? null;
  const bank = methods.find((m) => m.method === "bank_transfer");

  const startPayment = (sub: MySubscription, method: PaymentMethod) =>
    run(`pay:${method}`, () => {
      // Depois de um pagamento falhado ou cancelado a contagem muda, e uma nova tentativa recebe outra chave.
      const intent = `${sub.id}:${method}:${sub.payments.length}`;
      const subscriptionId = sub.id;
      if (!intents.current.has(intent)) intents.current.set(intent, newIdempotencyKey());
      return api<Payment>("/payments", { method: "POST", body: { subscriptionId, method, idempotencyKey: intents.current.get(intent) } });
    });

  return (
    <Screen onRefresh={() => void data.reload()} refreshing={data.loading}>
      <ErrorBox message={error} />

      {!verified ? (
        <Card>
          <Notice tone="warning">Para subscrever um plano de estudante, a sua inscrição universitária tem de estar confirmada.</Notice>
          <Button label="Inscrição universitária" onPress={() => router.push("/student/verification")} />
        </Card>
      ) : null}

      {open ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Subtitle>{open.planName}</Subtitle>
            <Badge label={LABELS.subscriptionStatus[open.status]} tone={open.status === "active" ? "success" : open.status === "suspended" ? "danger" : "warning"} />
          </Row>
          <Body muted>
            {formatKz(open.priceKz)}
            {open.startDate && open.endDate ? ` · ${formatDate(open.startDate)} a ${formatDate(open.endDate)}` : ""}
          </Body>
          {open.statusReason ? <Body muted>Motivo: {open.statusReason}</Body> : null}
        </Card>
      ) : null}

      {pending && !openPayment ? (
        <Card>
          <Subtitle>Pagar {formatKz(pending.priceKz)}</Subtitle>
          <Body muted>O plano só fica activo depois de o pagamento ser confirmado pelo servidor ou aprovado pela equipa financeira.</Body>
          {methods.map((m) =>
            m.available ? (
              <Button
                key={m.method}
                label={m.method === "sandbox" ? "Pagamento de teste (sem dinheiro real)" : m.label}
                variant={m.method === "sandbox" ? "secondary" : "primary"}
                busy={busy === `pay:${m.method}`}
                onPress={() => void startPayment(pending, m.method)}
              />
            ) : (
              <Card key={m.method}>
                <Row>
                  <Body>{m.label}</Body>
                  <Badge label="Indisponível" tone="neutral" />
                </Row>
                {m.unavailableReason ? <Body muted>{m.unavailableReason}</Body> : null}
              </Card>
            ),
          )}
          {confirmCancel ? (
            <Row>
              <Button label="Confirmar cancelamento" variant="danger" busy={busy === "cancel"} onPress={() => void run("cancel", () => api(`/subscriptions/${pending.id}/cancel`, { method: "POST" }))} />
              <Button label="Manter" variant="secondary" onPress={() => setConfirmCancel(false)} />
            </Row>
          ) : (
            <Button label="Cancelar este pedido de plano" variant="secondary" onPress={() => setConfirmCancel(true)} />
          )}
        </Card>
      ) : null}

      {openPayment ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Subtitle>{LABELS.paymentMethod[openPayment.method]}</Subtitle>
            <Badge label={LABELS.paymentStatus[openPayment.status]} tone={PAY_TONE[openPayment.status]} />
          </Row>
          <Body muted>Valor: {formatKz(openPayment.amountKz)}</Body>

          {openPayment.method === "bank_transfer" && openPayment.status === "pending" ? (
            <>
              {bank?.instructions ? (
                <Notice>
                  Transfira {formatKz(openPayment.amountKz)} para o IBAN {bank.instructions.iban} ({bank.instructions.beneficiary}). Depois indique a
                  referência da transferência.
                </Notice>
              ) : null}
              <Field label="Referência da transferência" value={reference} onChangeText={setReference} error={fields.reference} />
              <Button
                label="Enviar referência"
                busy={busy === "receipt"}
                disabled={reference.trim().length < 4}
                onPress={() => void run("receipt", () => api(`/payments/${openPayment.id}/receipt`, { method: "POST", body: { reference: reference.trim() } }))}
              />
            </>
          ) : null}
          {openPayment.status === "awaiting_review" ? (
            <Notice>A equipa financeira está a confirmar a transferência ({openPayment.providerReference}). Será notificado quando o plano ficar activo.</Notice>
          ) : null}

          {openPayment.method === "sandbox" && openPayment.status === "pending" ? (
            <>
              <Notice tone="warning">Ambiente de testes: nenhum dinheiro é movimentado. Esta opção não existe em produção.</Notice>
              <Row>
                <Button label="Simular pagamento aceite" busy={busy === "sb:ok"} onPress={() => void run("sb:ok", () => api(`/payments/${openPayment.id}/sandbox/complete`, { method: "POST", body: { outcome: "success" } }))} />
                <Button label="Simular falha" variant="secondary" busy={busy === "sb:fail"} onPress={() => void run("sb:fail", () => api(`/payments/${openPayment.id}/sandbox/complete`, { method: "POST", body: { outcome: "failure" } }))} />
              </Row>
            </>
          ) : null}
        </Card>
      ) : null}

      {!open && verified ? (
        <>
          <Subtitle>Planos disponíveis</Subtitle>
          {plans.map((p) => (
            <Card key={p.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <Subtitle>{p.name}</Subtitle>
                <DemoTag show={p.isDemo} />
              </Row>
              <Body>
                {formatKz(p.priceKz)} por {p.periodDays} dias
              </Body>
              {p.description ? <Body muted>{p.description}</Body> : null}
              <Body muted>
                {p.requiresBooking ? "Exige reserva" : "Sem reserva obrigatória"} · até {p.maxBookingsPerDay} viagens por dia
              </Body>
              <Body muted>{intercityText(p)}</Body>
              <Button label="Escolher este plano" busy={busy === `sub:${p.id}`} onPress={() => void run(`sub:${p.id}`, () => api("/subscriptions", { method: "POST", body: { planId: p.id } }))} />
            </Card>
          ))}
          {plans.length === 0 ? <Body muted>Ainda não há planos disponíveis.</Body> : null}
        </>
      ) : null}

      {subs.some((s) => s.payments.length > 0) ? (
        <Card>
          <Subtitle>Histórico de pagamentos</Subtitle>
          {subs.flatMap((s) =>
            s.payments.map((p) => (
              <Row key={p.id} style={{ justifyContent: "space-between" }}>
                <Body>
                  {formatDateTime(p.createdAt)} · {LABELS.paymentMethod[p.method]} · {formatKz(p.amountKz)}
                </Body>
                <Badge label={LABELS.paymentStatus[p.status]} tone={PAY_TONE[p.status]} />
                {p.reviewNote && p.status !== "confirmed" ? <Body muted>{p.reviewNote}</Body> : null}
              </Row>
            )),
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
