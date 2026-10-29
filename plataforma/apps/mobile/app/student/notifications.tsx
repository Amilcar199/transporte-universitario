import { useEffect } from "react";
import { api } from "../../src/api.ts";
import { formatDateTime } from "../../src/format.ts";
import type { Notification } from "../../src/types.ts";
import { Badge, Body, Card, Empty, ErrorBox, Loading, Row, Screen, Subtitle, useLoad } from "../../src/ui.tsx";

export default function NotificationsScreen() {
  const { data, error, loading, reload } = useLoad(() => api<Notification[]>("/notifications"));

  // Marca como lidas depois de mostrar; a lista actual mantém a indicação «Nova».
  useEffect(() => {
    if (data?.some((n) => !n.readAt)) void api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
  }, [data]);

  return (
    <Screen onRefresh={() => void reload()} refreshing={loading}>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty>Sem notificações.</Empty> : null}
      {data?.map((n) => (
        <Card key={n.id}>
          <Row style={{ justifyContent: "space-between" }}>
            <Subtitle>{n.title}</Subtitle>
            {!n.readAt ? <Badge label="Nova" tone="info" /> : null}
          </Row>
          <Body>{n.body}</Body>
          <Body muted>{formatDateTime(n.createdAt)}</Body>
        </Card>
      ))}
    </Screen>
  );
}
