import { LABELS } from "@uni/shared";
import { useState } from "react";
import { api, ApiError } from "../../src/api.ts";
import { useAuth } from "../../src/auth.tsx";
import { formatDateTime } from "../../src/format.ts";
import type { University, Verification } from "../../src/types.ts";
import { Badge, Body, Button, Card, Chip, ErrorBox, Field, Notice, Row, Screen, Subtitle, errorMessage, useLoad } from "../../src/ui.tsx";

export default function VerificationScreen() {
  const { me, reload: reloadMe } = useAuth();
  const universities = useLoad(() => api<University[]>("/universities"));
  const history = useLoad(() => api<Verification[]>("/verifications/me"));
  const [universityId, setUniversityId] = useState<string | null>(null);
  const [studentNumber, setStudentNumber] = useState("");
  const [documentNote, setDocumentNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const status = me?.student?.verificationStatus ?? "not_submitted";
  const pending = history.data?.some((v) => v.status === "pending") ?? false;

  async function submit() {
    if (!universityId) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api("/verifications", {
        method: "POST",
        body: { universityId, studentNumber: studentNumber.trim(), ...(documentNote.trim() ? { documentNote: documentNote.trim() } : {}) },
      });
      setSent(true);
      await Promise.all([history.reload(), reloadMe()]);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Notice>
        A equipa da universidade confirma a inscrição antes de serem concedidos benefícios de estudante. Indicar o nome de uma universidade
        não dá acesso automático aos planos.
      </Notice>
      {status === "approved" ? (
        <Notice tone="success">
          Inscrição confirmada: {me?.student?.universityName}
          {me?.student?.studentNumber ? ` (Nº ${me.student.studentNumber})` : ""}.
        </Notice>
      ) : null}
      {sent ? <Notice tone="success">Pedido enviado. Será notificado quando for analisado.</Notice> : null}

      {!pending ? (
        <Card>
          <Subtitle>{status === "approved" ? "Mudar de universidade" : "Pedir confirmação"}</Subtitle>
          <Body muted>Universidade</Body>
          <Row>
            {universities.data?.map((u) => (
              <Chip key={u.id} label={u.shortName} selected={universityId === u.id} onPress={() => setUniversityId(u.id)} />
            ))}
          </Row>
          <Field label="Número de estudante" value={studentNumber} onChangeText={setStudentNumber} autoCapitalize="characters" error={fields.studentNumber} />
          <Field
            label="Observações para a equipa (opcional)"
            value={documentNote}
            onChangeText={setDocumentNote}
            placeholder="Ex.: curso e ano; levo o cartão de estudante à secretaria"
            multiline
            error={fields.documentNote}
          />
          <ErrorBox message={error} />
          <Button label="Enviar pedido" onPress={() => void submit()} busy={busy} disabled={!universityId || studentNumber.trim().length < 3} />
        </Card>
      ) : (
        <Notice tone="warning">Tem um pedido em análise. Aguarde a decisão antes de enviar outro.</Notice>
      )}

      {history.data && history.data.length > 0 ? (
        <Card>
          <Subtitle>Pedidos anteriores</Subtitle>
          {history.data.map((v) => (
            <Row key={v.id} style={{ justifyContent: "space-between" }}>
              <Body>
                {v.universityShortName} · {v.studentNumber} · {formatDateTime(v.createdAt)}
              </Body>
              <Badge label={LABELS.verification[v.status]} tone={v.status === "approved" ? "success" : v.status === "rejected" ? "danger" : "warning"} />
              {v.decisionNote ? <Body muted>Nota: {v.decisionNote}</Body> : null}
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
