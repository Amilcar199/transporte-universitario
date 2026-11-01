import { LABELS } from "@uni/shared";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../../src/api.ts";
import { useAuth } from "../../../src/auth.tsx";
import { addMinutesToTime, formatLongDate, luandaHour, luandaToday, periodProgress } from "../../../src/format.ts";
import { Avatar, Chips, Eyebrow, Hero, HeroChip, Icon, IconButton, Page, Panel, Pill, ProgressBar, StopTimeline, type IconName } from "../../../src/kit.tsx";
import type { MyBooking, MySubscription, Notification } from "../../../src/types.ts";
import { Body, Button, c, ErrorBox, Loading, Notice, useLoad, useRefreshOnFocus } from "../../../src/ui.tsx";

function greeting(): string {
  const h = luandaHour();
  return h < 12 ? "Bom dia," : h < 19 ? "Boa tarde," : "Boa noite,";
}

const QUICK: { label: string; icon: IconName; href: string }[] = [
  { label: "Rotas", icon: "route", href: "/student/routes" },
  { label: "Paragens", icon: "pin", href: "/student/map" },
  { label: "Passe", icon: "card", href: "/student/pass" },
  { label: "Intercidades", icon: "globe", href: "/student/intercity" },
];

export default function StudentHome() {
  const { me, reload: reloadMe } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [subs, bookings, notifications] = await Promise.all([
      api<MySubscription[]>("/subscriptions/me"),
      api<MyBooking[]>("/bookings/me"),
      api<Notification[]>("/notifications"),
    ]);
    return { subs, bookings, notifications };
  });

  useRefreshOnFocus(
    useCallback(() => {
      void reload();
      void reloadMe().catch(() => undefined);
    }, [reload, reloadMe]),
  );

  const verification = me?.student?.verificationStatus ?? "not_submitted";
  const approved = verification === "approved";
  const sub = data?.subs.find((s) => ["active", "pending_payment", "suspended"].includes(s.status)) ?? null;
  const today = luandaToday();
  const next = data?.bookings
    .filter((b) => b.status === "confirmed" && b.serviceDate >= today && b.tripStatus !== "cancelled" && b.tripStatus !== "completed")
    .sort((a, b) => `${a.serviceDate}${a.departureTime}`.localeCompare(`${b.serviceDate}${b.departureTime}`))[0];
  const unread = data?.notifications.filter((n) => !n.readAt) ?? [];

  const hero = (
    <Hero paddingBottom={86}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar name={me?.fullName} size={50} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>{greeting()}</Text>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }} numberOfLines={1}>
            {me?.fullName}
          </Text>
        </View>
        <IconButton icon="bell" label="Notificações" badge={unread.length > 0} onPress={() => router.push("/student/notifications")} />
      </View>
      <Chips>
        {approved && me?.student?.universityName ? <HeroChip label={me.student.universityName} /> : null}
        <HeroChip label={approved ? "Estudante verificado" : LABELS.verification[verification]} selected={approved} />
      </Chips>
    </Hero>
  );

  return (
    <Page hero={hero} overlap={64} onRefresh={() => void reload()} refreshing={loading}>
      <Panel style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Eyebrow>Próxima viagem</Eyebrow>
          {next ? <Pill label="Reserva confirmada" tone="success" /> : null}
        </View>
        {loading && !data ? <Loading /> : null}
        {next ? (
          <>
            <StopTimeline
              stops={[
                {
                  key: "from",
                  name: next.stopName,
                  time: next.minutesFromStart !== null ? addMinutesToTime(next.departureTime, next.minutesFromStart) : next.departureTime,
                  strong: true,
                },
                ...(next.endStop && next.endStop.name !== next.stopName
                  ? [{ key: "to", name: next.endStop.name, time: addMinutesToTime(next.departureTime, next.endStop.minutesFromStart), strong: true }]
                  : []),
              ]}
            />
            <Body muted>
              {formatLongDate(next.serviceDate)} · Lugar {next.seatNumber}
              {next.vehiclePlate ? ` · ${next.vehiclePlate}` : ""} · {next.routeCode}
            </Body>
            <Button label="Acompanhar viagem" onPress={() => router.push(`/student/live/${next.tripId}`)} />
          </>
        ) : data ? (
          <>
            <Body muted>Ainda não tem viagens reservadas.</Body>
            <Button label="Ver rotas" onPress={() => router.push("/student/routes")} />
          </>
        ) : null}
      </Panel>

      <ErrorBox message={error} onRetry={() => void reload()} />

      <Panel style={{ gap: 10 }} onPress={() => router.push("/student/plans")}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text, flex: 1 }}>{sub ? sub.planName : "Sem plano activo"}</Text>
          <Text style={{ color: c.primary, fontWeight: "700" }}>{sub ? "Gerir" : "Escolher"}</Text>
        </View>
        {sub?.status === "active" && sub.startDate && sub.endDate ? (
          <>
            <ProgressBar value={periodProgress(sub.startDate, sub.endDate, today)} />
            <Body muted>Activo · válido até {formatLongDate(sub.endDate)}</Body>
          </>
        ) : sub ? (
          <Body muted>
            {LABELS.subscriptionStatus[sub.status]}
            {sub.status === "pending_payment" ? " · o plano só fica activo depois de o pagamento ser confirmado" : ""}
          </Body>
        ) : (
          <Body muted>{approved ? "Escolha um plano para poder reservar viagens." : "Confirme a inscrição universitária para subscrever um plano."}</Body>
        )}
      </Panel>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {QUICK.map((q) => (
          <Pressable key={q.label} accessibilityRole="button" onPress={() => router.push(q.href as never)} style={{ alignItems: "center", gap: 8, width: "24%" }}>
            <View style={{ width: 66, height: 66, borderRadius: 20, backgroundColor: c.primaryLight, alignItems: "center", justifyContent: "center" }}>
              <Icon name={q.icon} color={c.primary} size={26} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
              {q.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!approved && verification !== "pending" ? (
        <Panel style={{ gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>Confirme a sua inscrição</Text>
          <Body muted>Os planos de estudante só ficam disponíveis depois de a universidade ser confirmada pela equipa.</Body>
          <Button label="Pedir confirmação" variant="secondary" onPress={() => router.push("/student/verification")} />
        </Panel>
      ) : null}
      {verification === "pending" ? <Notice tone="warning">O pedido de confirmação da inscrição está a ser analisado.</Notice> : null}

      {unread[0] ? (
        <Pressable onPress={() => router.push("/student/notifications")} accessibilityRole="button">
          <View style={{ flexDirection: "row", gap: 12, backgroundColor: "#FDF1DC", borderRadius: 20, padding: 18 }}>
            <Icon name="alert" color="#8A5300" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: "700", color: "#5C3A00", fontSize: 15 }}>{unread[0].title}</Text>
              <Text style={{ color: "#5C3A00", fontSize: 14, lineHeight: 20 }} numberOfLines={3}>
                {unread[0].body}
              </Text>
              {unread.length > 1 ? <Text style={{ color: "#8A5300", fontSize: 13, marginTop: 4 }}>+ {unread.length - 1} por ler</Text> : null}
            </View>
          </View>
        </Pressable>
      ) : null}
    </Page>
  );
}
