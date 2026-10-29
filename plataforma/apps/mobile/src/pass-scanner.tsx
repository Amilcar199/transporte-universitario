import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { api } from "./api.ts";
import type { ValidationResponse } from "./types.ts";
import { Body, Button, c, Card, ErrorBox, errorMessage, Field, Notice, Screen, Subtitle } from "./ui.tsx";

/** Leitura e validação de passes numa viagem. A decisão é sempre do servidor. */
export function PassScanner({ tripId }: { tripId: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  async function validate(token: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      setResult(await api<ValidationResponse>("/passes/validate", { method: "POST", body: { token: token.trim(), tripId } }));
    } catch (err) {
      setError(errorMessage(err));
      locked.current = false;
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setResult(null);
    setError(null);
    setManual("");
    locked.current = false;
  }

  if (result) {
    const ok = result.result === "authorized";
    return (
      <Screen>
        <View style={{ backgroundColor: ok ? c.success : c.danger, borderRadius: 16, padding: 24, alignItems: "center", gap: 8 }}>
          <Text style={{ color: "#fff", fontSize: 26, fontWeight: "700", textAlign: "center" }}>{result.label}</Text>
          {result.holder ? <Text style={{ color: "#fff", fontSize: 20 }}>{result.holder}</Text> : null}
          {result.seatNumber ? <Text style={{ color: "#fff", fontSize: 18 }}>Lugar {result.seatNumber}</Text> : null}
          {result.reason ? <Text style={{ color: "#fff", fontSize: 16, textAlign: "center" }}>{result.reason}</Text> : null}
        </View>
        <Button label="Ler o próximo passe" onPress={next} />
      </Screen>
    );
  }

  return (
    <Screen>
      {!permission ? null : permission.granted ? (
        <View style={{ height: 320, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => void validate(data)}
          />
        </View>
      ) : (
        <Card>
          <Subtitle>Câmara</Subtitle>
          <Body muted>A câmara é usada apenas para ler o passe digital dos estudantes.</Body>
          <Button label="Autorizar câmara" onPress={() => void requestPermission()} />
          {!permission.canAskAgain ? <Notice tone="warning">A autorização foi recusada. Active-a nas definições do telemóvel.</Notice> : null}
        </Card>
      )}
      <ErrorBox message={error} />
      <Card>
        <Subtitle>Introduzir o código manualmente</Subtitle>
        <Body muted>Use quando a câmara não estiver disponível. O código expira ao fim de 60 segundos.</Body>
        <Field label="Código do passe" value={manual} onChangeText={setManual} autoCapitalize="none" autoCorrect={false} multiline />
        <Button label="Validar" busy={busy} disabled={manual.trim().length < 20} onPress={() => void validate(manual)} />
      </Card>
    </Screen>
  );
}
