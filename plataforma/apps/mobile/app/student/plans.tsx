import { formatKz, LABELS, type PaymentMethod } from "@uni/shared";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api, ApiError, newIdempotencyKey } from "../../src/api.ts";
import { useAuth } from "../../src/auth.tsx";
import { formatDateTime, formatLongDate } from "../../src/format.ts";
import { Eyebrow, Hero, IconButton, ListRow, Page, Panel, Pill, Radio, SectionTitle, type IconName } from "../../src/kit.tsx";
import type { MySubscription, Payment, PaymentMethodInfo, Plan } from "../../src/types.ts";
import { Body, Button, c, DemoTag, ErrorBox, Field, Loading, Notice, errorMessage, useLoad, useRefreshOnFocus } from "../../src/ui.tsx";

const PAY_TONE = { pending: "warning", awaiting_review: "info", confirmed: "success", failed: "danger", cancelled: "neutral", refunded: "neutral" } as const;
const METHOD_ICON: Record<PaymentMethod, IconName> = { multicaixa_express: "phone", bank_transfer: "bank", paypay: "wallet", sandbox: "flask" };
const METHOD_HINT: Record<PaymentMethod, string> = {
  multicaixa_express: "Pagamento no telemóvel",
  bank_transfer: "Validação pela equipa financeira",
  paypay: "Carteira digital",
  sandbox: "Só em desenvolvimento · sem dinheiro real",
};

function intercityText(p: Plan): string {
  if (p.intercityModel === "discount" && p.intercityDiscountPct) return `Intercidades: ${p.intercityDiscountPct}% de desconto`;
  if ((p.intercityModel === "included" || p.intercityModel === "credits") && p.intercityCredits) {
    return `Intercidades: ${p.intercityCredits} viagens por período`;
  }
  return `Intercidades: ${LABELS.intercityModel[p.intercityModel]}`;
}

function methodLabel(m: PaymentMethodInfo): string {
  return m.method === "sandbox" ? "Pagamento de teste (sem dinheiro real)" : m.label;
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
  const [method, setMethod] = useState<PaymentMethod | null>(null);
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

  const back = () => (router.canGoBack() ? router.back() : router.replace("/student"));
  const hero = (
    <Hero paddingBottom={90}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconButton icon="back" label="Voltar" onPress={back} />
        <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>Subscrição</Text>
      </View>
    </Hero>
  );

  if (data.loading && !data.data) return <Page hero={hero} overlap={64}><Panel><Loading /></Panel></Page>;
  if (!data.data) {
    return (
      <Page hero={hero} overlap={64}>
        <Panel>
          <ErrorBox message={data.error} onRetry={() => void data.reload()} />
        </Panel>
      </Page>
    );
  }

  const { subs, plans, methods } = data.data;
  const open = subs.find((s) => ["pending_payment", "active", "suspended"].includes(s.status));
  const pending = open?.status === "pending_payment" ? open : null;
  const openPayment = pending?.payments.find((p) => p.status === "pending" || p.status === "awaiting_review") ?? null;
  const bank = methods.find((m) => m.method === "bank_transfer");
  const choosing = pending && !openPayment;
  const chosen = methods.find((m) => m.method === method && m.available) ?? null;
  const payments = subs.flatMap((s) => s.payments).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const startPayment = (sub: MySubscription, m: PaymentMethod) =>
    run(`pay:${m}`, () => {
      // Depois de um pagamento falhado ou cancelado a contagem muda, e uma nova tentativa recebe outra chave.
      const intent = `${sub.id}:${m}:${sub.payments.length}`;
      if (!intents.current.has(intent)) intents.current.set(intent, newIdempotencyKey());
      return api<Payment>("/payments", { method: "POST", body: { subscriptionId: sub.id, method: m, idempotencyKey: intents.current.get(intent) } });
    });

  const bottom = choosing ? (
    <Button
      label={chosen ? `Pagar ${formatKz(pending.priceKz)}` : "Escolha a forma de pagamento"}
      disabled={!chosen}
      busy={!!chosen && busy === `pay:${chosen.method}`}
      onPress={() => chosen && void startPayment(pending, chosen.method)}
      flex
    />
  ) : open?.status === "active" ? (
    <Button label="Ver passe digital" onPress={() => router.push("/student/pass")} flex />
  ) : undefined;

  return (
    <Page hero={hero} overlap={64} bottom={bottom} onRefresh={() => void data.reload()} refreshing={data.loading}>
      {open ? (
        <Panel style={{ gap: 8 }}>
          <View style={s.between}>
            <Eyebrow>Plano</Eyebrow>
            <Pill label={LABELS.subscriptionStatus[open.status]} tone={open.status === "active" ? "success" : open.status === "suspended" ? "danger" : "warning"} />
          </View>
          <Text style={s.planName}>{open.planName}</Text>
          <Text style={s.price}>
            {formatKz(open.priceKz).replace(/\s*Kz$/, "")}
            <Text style={s.priceUnit}> Kz / período</Text>
          </Text>
          <View style={s.between}>
            <Body muted>{open.startDate ? `Desde ${formatLongDate(open.startDate)}` : "Ainda não iniciado"}</Body>
            {open.endDate ? <Body muted>Válido até {formatLongDate(open.endDate)}</Body> : null}
          </View>
          {open.statusReason ? <Body muted>Motivo: {open.statusReason}</Body> : null}
        </Panel>
      ) : (
        <Panel style={{ gap: 8 }}>
          <Eyebrow>Plano</Eyebrow>
          <Text style={s.planName}>Sem plano activo</Text>
          <Body muted>{verified ? "Escolha um dos planos disponíveis abaixo." : "A inscrição universitária tem de estar confirmada para subscrever um plano."}</Body>
          {!verified ? <Button label="Inscrição universitária" onPress={() => router.push("/student/verification")} /> : null}
        </Panel>
      )}

      <ErrorBox message={error} />

      {choosing ? (
        <>
          <SectionTitle title="Forma de pagamento" />
          <Body muted style={{ marginTop: -8 }}>O plano só fica activo depois de o pagamento ser confirmado pelo servidor ou aprovado pela equipa financeira.</Body>
          {methods.map((m) => (
            <Panel key={m.method} highlighted={method === m.method && m.available} style={{ paddingVertical: 4 }}>
              <ListRow
                icon={METHOD_ICON[m.method]}
                title={methodLabel(m)}
                subtitle={m.available ? METHOD_HINT[m.method] : `Indisponível${m.unavailableReason ? ` · ${m.unavailableReason}` : ""}`}
                right={m.available ? <Radio selected={method === m.method} /> : <Pill label="Indisponível" />}
                onPress={m.available ? () => setMethod(m.method) : undefined}
                disabled={!m.available}
                selected={method === m.method && m.available}
                last
              />
            </Panel>
          ))}
          {confirmCancel ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                label="Confirmar cancelamento"
                variant="danger"
                busy={busy === "cancel"}
                onPress={() => void run("cancel", () => api(`/subscriptions/${pending.id}/cancel`, { method: "POST" }))}
                flex
              />
              <Button label="Manter" variant="outline" onPress={() => setConfirmCancel(false)} flex />
            </View>
          ) : (
            <Button label="Cancelar este pedido de plano" variant="dangerOutline" onPress={() => setConfirmCancel(true)} />
          )}
        </>
      ) : null}

      {openPayment ? (
        <Panel>
          <View style={s.between}>
            <Text style={s.panelTitle}>{LABELS.paymentMethod[openPayment.method]}</Text>
            <Pill label={LABELS.paymentStatus[openPayment.status]} tone={PAY_TONE[openPayment.status]} />
          </View>
          <Body muted>Valor: {formatKz(openPayment.amountKz)}</Body>
          {openPayment.method === "bank_transfer" && openPayment.status === "pending" ? (
            <>
              {bank?.instructions ? (
                <Notice>
                  Transfira {formatKz(openPayment.amountKz)} para o IBAN {bank.instructions.iban} ({bank.instructions.beneficiary}). Depois indique a referência
                  da transferência.
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
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button
                  label="Simular pagamento aceite"
                  busy={busy === "sb:ok"}
                  onPress={() => void run("sb:ok", () => api(`/payments/${openPayment.id}/sandbox/complete`, { method: "POST", body: { outcome: "success" } }))}
                  flex
                />
                <Button
                  label="Simular falha"
                  variant="outline"
                  busy={busy === "sb:fail"}
                  onPress={() => void run("sb:fail", () => api(`/payments/${openPayment.id}/sandbox/complete`, { method: "POST", body: { outcome: "failure" } }))}
                  flex
                />
              </View>
            </>
          ) : null}
        </Panel>
      ) : null}

      {!open && verified ? (
        <>
          <SectionTitle title="Planos disponíveis" />
          {plans.map((p) => (
            <Panel key={p.id}>
              <View style={s.between}>
                <Text style={s.panelTitle}>{p.name}</Text>
                <DemoTag show={p.isDemo} />
              </View>
              <Text style={[s.price, { fontSize: 28 }]}>
                {formatKz(p.priceKz).replace(/\s*Kz$/, "")}
                <Text style={s.priceUnit}> Kz / {p.periodDays} dias</Text>
              </Text>
              {p.description ? <Body muted>{p.description}</Body> : null}
              <Body muted>
                {p.requiresBooking ? "Exige reserva" : "Sem reserva obrigatória"} · até {p.maxBookingsPerDay} viagens por dia
              </Body>
              <Body muted>{intercityText(p)}</Body>
              <Button label="Escolher este plano" busy={busy === `sub:${p.id}`} onPress={() => void run(`sub:${p.id}`, () => api("/subscriptions", { method: "POST", body: { planId: p.id } }))} />
            </Panel>
          ))}
          {plans.length === 0 ? <Body muted>Ainda não há planos disponíveis.</Body> : null}
        </>
      ) : null}

      {payments.length > 0 ? (
        <>
          <SectionTitle title="Últimos pagamentos" />
          <Panel style={{ paddingVertical: 6 }}>
            {payments.slice(0, 10).map((p, i) => (
              <View key={p.id} style={[s.payment, i < Math.min(payments.length, 10) - 1 && s.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: c.text }}>{LABELS.paymentMethod[p.method]}</Text>
                  <Body muted style={{ fontSize: 14 }}>{formatDateTime(p.createdAt)}</Body>
                  {p.reviewNote && p.status !== "confirmed" ? <Body muted style={{ fontSize: 13 }}>{p.reviewNote}</Body> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{formatKz(p.amountKz)}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: p.status === "confirmed" ? c.success : p.status === "failed" ? c.danger : c.textMuted }}>
                    {LABELS.paymentStatus[p.status]}
                  </Text>
                </View>
              </View>
            ))}
          </Panel>
        </>
      ) : null}
    </Page>
  );
}

const s = StyleSheet.create({
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  planName: { fontSize: 22, fontWeight: "800", color: c.text },
  price: { fontSize: 36, fontWeight: "800", color: c.primary },
  priceUnit: { fontSize: 16, fontWeight: "500", color: c.textMuted },
  panelTitle: { fontSize: 17, fontWeight: "700", color: c.text, flex: 1 },
  payment: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#EDF0F5" },
});
