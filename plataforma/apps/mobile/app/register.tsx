import { router } from "expo-router";
import { useState } from "react";
import { ApiError } from "../src/api.ts";
import { AuthShell, BackToLogin } from "../src/auth-shell.tsx";
import { useAuth } from "../src/auth.tsx";
import { Body, Button, ErrorBox, Field, Notice, errorMessage } from "../src/ui.tsx";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      router.replace("/student/verification");
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell compact title="Criar conta de estudante" subtitle="Leva menos de um minuto." footer={<BackToLogin label="Já tem conta? Iniciar sessão" />}>
      <Field label="Nome completo" value={form.fullName} onChangeText={set("fullName")} autoComplete="name" error={fields.fullName} />
      <Field
        label="Email"
        value={form.email}
        onChangeText={set("email")}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="nome@exemplo.ao"
        error={fields.email}
      />
      <Field
        label="Telefone (opcional)"
        value={form.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
        placeholder="+244 9XX XXX XXX"
        error={fields.phone}
      />
      <Field
        label="Palavra-passe"
        value={form.password}
        onChangeText={set("password")}
        secureTextEntry
        autoComplete="new-password"
        placeholder="Mínimo 8 caracteres"
        error={fields.password}
      />
      <Notice>
        Depois de criar a conta, peça a confirmação da sua inscrição universitária. Os planos de estudante só ficam disponíveis
        depois de a universidade ser confirmada pela equipa.
      </Notice>
      <ErrorBox message={error} />
      <Button label="Criar conta" onPress={() => void submit()} busy={busy} disabled={!form.fullName || !form.email || !form.password} />
      <Body muted style={{ fontSize: 13, lineHeight: 18 }}>
        Os seus dados são usados apenas para gerir o transporte e as reservas.
      </Body>
    </AuthShell>
  );
}
