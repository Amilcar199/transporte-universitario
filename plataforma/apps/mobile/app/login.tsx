import { Link, router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "../src/api.ts";
import { AuthShell } from "../src/auth-shell.tsx";
import { useAuth } from "../src/auth.tsx";
import { Button, ErrorBox, Field, c, errorMessage } from "../src/ui.tsx";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Bem-vindo"
      subtitle="Entre com o email e a palavra-passe da sua conta."
      footer={
        <View style={{ alignItems: "center", gap: 10 }}>
          <Text style={{ color: c.textMuted, fontSize: 15 }}>
            Ainda não tem conta?{" "}
            <Link href="/register" style={{ color: c.primary, fontWeight: "700" }}>
              Criar conta de estudante
            </Link>
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 }}>
            Motoristas e validadores entram com as credenciais fornecidas pela operadora.
          </Text>
        </View>
      }
    >
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="nome@exemplo.ao"
        error={fields.email}
      />
      <Field
        label="Palavra-passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        error={fields.password}
        onSubmitEditing={() => void submit()}
      />
      <Link href="/forgot" style={{ color: c.primary, fontSize: 14, fontWeight: "600", alignSelf: "flex-end" }}>
        Esqueci-me da palavra-passe
      </Link>
      <ErrorBox message={error} />
      <Button label="Entrar" onPress={() => void submit()} busy={busy} disabled={!email || !password} />
    </AuthShell>
  );
}
