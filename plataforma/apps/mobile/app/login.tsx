import { brand } from "@uni/shared";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "../src/api.ts";
import { useAuth } from "../src/auth.tsx";
import { Body, Button, Card, ErrorBox, Field, Screen, c, errorMessage } from "../src/ui.tsx";

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
    <Screen>
      <View style={{ alignItems: "center", paddingVertical: 16, gap: 6 }}>
        <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700" }}>{brand.logo.monogram}</Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: "700", color: c.text }}>{brand.name}</Text>
        <Body muted>{brand.tagline}</Body>
      </View>
      <Card>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
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
        <ErrorBox message={error} />
        <Button label="Entrar" onPress={() => void submit()} busy={busy} disabled={!email || !password} />
      </Card>
      <View style={{ alignItems: "center", gap: 12, paddingTop: 8 }}>
        <Link href="/register" style={{ color: c.primary, fontSize: 16 }}>
          Ainda não tem conta? Criar conta de estudante
        </Link>
        <Link href="/forgot" style={{ color: c.textMuted, fontSize: 15 }}>
          Esqueci-me da palavra-passe
        </Link>
      </View>
    </Screen>
  );
}
