import { router } from "expo-router";
import { useState } from "react";
import { api, ApiError } from "../src/api.ts";
import { AuthShell, BackToLogin } from "../src/auth-shell.tsx";
import { Body, Button, ErrorBox, Field, Notice, Subtitle, errorMessage } from "../src/ui.tsx";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState<{ message: string; devCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  async function request() {
    setBusy(true);
    setError(null);
    try {
      setRequested(await api<{ message: string; devCode?: string }>("/auth/password/forgot", { method: "POST", body: { email: email.trim() } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await api<{ message: string }>("/auth/password/reset", {
        method: "POST",
        body: { email: email.trim(), code: code.trim(), newPassword },
      });
      setDone(res.message);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell compact title="Palavra-passe alterada">
        <Notice tone="success">{done}</Notice>
        <Button label="Iniciar sessão" onPress={() => router.replace("/login")} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      compact
      title="Recuperar palavra-passe"
      subtitle="Enviamos um código de 6 dígitos para confirmar que a conta é sua."
      footer={<BackToLogin />}
    >
      <Subtitle>1. Pedir código</Subtitle>
      <Field
        label="Email da conta"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="nome@exemplo.ao"
      />
      <Button label="Enviar código" onPress={() => void request()} busy={busy && !requested} disabled={!email} />
      {requested ? <Notice>{requested.message}</Notice> : null}
      {requested?.devCode ? (
        <Notice tone="warning">
          Ambiente de desenvolvimento: o envio por SMS/email ainda não está configurado. Código: {requested.devCode}
        </Notice>
      ) : null}
      {requested ? (
        <>
          <Subtitle>2. Definir nova palavra-passe</Subtitle>
          <Field label="Código de 6 dígitos" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} error={fields.code} />
          <Field label="Nova palavra-passe" value={newPassword} onChangeText={setNewPassword} secureTextEntry error={fields.newPassword} />
          <Button label="Alterar palavra-passe" onPress={() => void reset()} busy={busy} disabled={code.length !== 6 || newPassword.length < 8} />
          <Body muted style={{ fontSize: 13, lineHeight: 18 }}>
            Ao alterar a palavra-passe, todas as sessões abertas são terminadas.
          </Body>
        </>
      ) : null}
      <ErrorBox message={error} />
    </AuthShell>
  );
}
