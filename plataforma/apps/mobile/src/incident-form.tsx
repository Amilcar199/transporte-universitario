import { INCIDENT_KINDS, LABELS, type IncidentKind } from "@uni/shared";
import { useState } from "react";
import { api, ApiError } from "./api.ts";
import { formatDateTime } from "./format.ts";
import type { Incident } from "./types.ts";
import { Badge, Body, Button, Card, Chip, ErrorBox, Field, Notice, Row, Screen, Subtitle, errorMessage, useLoad } from "./ui.tsx";

/** Usado por estudantes e motoristas: o servidor só aceita viagens em que a pessoa participa. */
export function IncidentForm({ trips }: { trips: { id: string; label: string }[] }) {
  const mine = useLoad(() => api<Incident[]>("/incidents/me"));
  const [kind, setKind] = useState<IncidentKind>("delay");
  const [tripId, setTripId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api("/incidents", { method: "POST", body: { kind, description: description.trim(), tripId } });
      setSent(true);
      setDescription("");
      await mine.reload();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {sent ? <Notice tone="success">Ocorrência registada. A equipa de operação foi informada.</Notice> : null}
      <Card>
        <Subtitle>Nova ocorrência</Subtitle>
        <Row>
          {INCIDENT_KINDS.map((k) => (
            <Chip key={k} label={LABELS.incidentKind[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Row>
        {trips.length > 0 ? (
          <>
            <Body muted>Viagem (opcional)</Body>
            <Row>
              <Chip label="Nenhuma" selected={tripId === null} onPress={() => setTripId(null)} />
              {trips.map((t) => (
                <Chip key={t.id} label={t.label} selected={tripId === t.id} onPress={() => setTripId(t.id)} />
              ))}
            </Row>
          </>
        ) : null}
        <Field label="Descrição" value={description} onChangeText={setDescription} multiline numberOfLines={4} error={fields.description} />
        {kind === "safety" ? <Notice tone="danger">Em caso de perigo imediato, contacte primeiro as autoridades. Este registo não substitui um pedido de emergência.</Notice> : null}
        <ErrorBox message={error} />
        <Button label="Enviar" onPress={() => void submit()} busy={busy} disabled={description.trim().length < 5} />
      </Card>

      {mine.data && mine.data.length > 0 ? (
        <Card>
          <Subtitle>As minhas ocorrências</Subtitle>
          {mine.data.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <Body>{LABELS.incidentKind[i.kind]}</Body>
                <Badge label={LABELS.incidentStatus[i.status]} tone={i.status === "resolved" || i.status === "closed" ? "success" : "warning"} />
              </Row>
              <Body muted>{formatDateTime(i.createdAt)}</Body>
              <Body>{i.description}</Body>
              {i.resolutionNote ? <Body muted>Resposta: {i.resolutionNote}</Body> : null}
            </Card>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
