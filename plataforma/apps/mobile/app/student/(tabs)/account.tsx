import { brand, LABELS } from "@uni/shared";
import { router } from "expo-router";
import { useAuth } from "../../../src/auth.tsx";
import { Badge, Body, Button, Card, Row, Screen, Subtitle } from "../../../src/ui.tsx";

export default function AccountTab() {
  const { me, logout } = useAuth();
  if (!me) return null;
  const v = me.student?.verificationStatus ?? "not_submitted";

  return (
    <Screen>
      <Card>
        <Subtitle>{me.fullName}</Subtitle>
        <Body muted>{me.email}</Body>
        {me.phone ? <Body muted>{me.phone}</Body> : null}
        <Row>
          <Body>Inscrição:</Body>
          <Badge label={LABELS.verification[v]} tone={v === "approved" ? "success" : v === "rejected" ? "danger" : v === "pending" ? "warning" : "neutral"} />
        </Row>
        {v === "approved" && me.student?.universityName ? (
          <Body muted>
            {me.student.universityName}
            {me.student.studentNumber ? ` · Nº ${me.student.studentNumber}` : ""}
          </Body>
        ) : null}
      </Card>

      <Button label="Inscrição universitária" variant="secondary" onPress={() => router.push("/student/verification")} />
      <Button label="Plano e pagamentos" variant="secondary" onPress={() => router.push("/student/plans")} />
      <Button label="Notificações" variant="secondary" onPress={() => router.push("/student/notifications")} />
      <Button label="Comunicar ocorrência" variant="secondary" onPress={() => router.push("/student/incident")} />

      <Card>
        <Subtitle>Apoio</Subtitle>
        <Body muted>
          {brand.supportEmail} · {brand.supportPhone}
        </Body>
        {brand.supportContactsAreExamples ? <Body muted>Contactos de exemplo; ainda não são os contactos oficiais.</Body> : null}
      </Card>

      <Button
        label="Terminar sessão"
        variant="danger"
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      />
    </Screen>
  );
}
