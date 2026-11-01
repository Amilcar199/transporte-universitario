import { brand, LABELS } from "@uni/shared";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { api } from "../../../src/api.ts";
import { useAuth } from "../../../src/auth.tsx";
import { Avatar, Hero, ListRow, Page, Panel, Pill } from "../../../src/kit.tsx";
import type { Notification } from "../../../src/types.ts";
import { Body, Button, c, useLoad, useRefreshOnFocus } from "../../../src/ui.tsx";

export default function AccountTab() {
  const { me, logout } = useAuth();
  const notifications = useLoad(() => api<Notification[]>("/notifications"));
  useRefreshOnFocus(notifications.reload);
  if (!me) return null;
  const v = me.student?.verificationStatus ?? "not_submitted";
  const unread = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  const hero = (
    <Hero paddingBottom={90} style={{ alignItems: "center" }}>
      <Avatar name={me.fullName} size={84} />
      <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", textAlign: "center" }}>{me.fullName}</Text>
      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, textAlign: "center" }}>
        {me.email}
        {me.phone ? ` · ${me.phone}` : ""}
      </Text>
    </Hero>
  );

  return (
    <Page hero={hero} overlap={60}>
      <Panel style={{ gap: 8 }} onPress={() => router.push("/student/verification")}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }}>Verificação de estudante</Text>
          <Pill label={LABELS.verification[v]} tone={v === "approved" ? "success" : v === "rejected" ? "danger" : v === "pending" ? "warning" : "neutral"} />
        </View>
        {v === "approved" ? (
          <>
            <Line label="Universidade" value={me.student?.universityName ?? "—"} />
            <Line label="Nº de estudante" value={me.student?.studentNumber ?? "—"} />
          </>
        ) : (
          <Body muted>{v === "pending" ? "O pedido está a ser analisado pela equipa." : "Peça a confirmação da sua inscrição universitária."}</Body>
        )}
      </Panel>

      <Panel style={{ paddingVertical: 4 }}>
        <ListRow icon="history" title="Histórico de viagens" onPress={() => router.push("/student/bookings")} />
        <ListRow icon="receipt" title="Plano e pagamentos" onPress={() => router.push("/student/plans")} />
        <ListRow
          icon="bell"
          title="Notificações"
          onPress={() => router.push("/student/notifications")}
          right={unread > 0 ? <Pill label={String(unread)} tone="accent" /> : undefined}
        />
        <ListRow icon="shield" title="Inscrição universitária" onPress={() => router.push("/student/verification")} />
        <ListRow icon="alert" title="Ajuda e ocorrências" onPress={() => router.push("/student/incident")} last />
      </Panel>

      <Body muted style={{ textAlign: "center", fontSize: 13 }}>
        Apoio: {brand.supportEmail} · {brand.supportPhone}
        {brand.supportContactsAreExamples ? "\n(contactos de exemplo; ainda não são os oficiais)" : ""}
      </Body>

      <Button
        label="Terminar sessão"
        variant="dangerOutline"
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      />
    </Page>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: c.textMuted, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}
