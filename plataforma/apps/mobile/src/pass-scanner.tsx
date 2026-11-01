import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "./api.ts";
import { Avatar, Icon, IconButton } from "./kit.tsx";
import type { ValidationResponse } from "./types.ts";
import { Body, Button, c, ErrorBox, errorMessage, Field, Notice } from "./ui.tsx";

const DARK = "#0F1B3D";

/** Leitura e validação de passes numa viagem. A decisão é sempre do servidor. */
export function PassScanner({ tripId, routeLabel, fallback }: { tripId: string; routeLabel?: string; fallback: string }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
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

  const close = () => (router.canGoBack() ? router.back() : router.replace(fallback as never));
  const cameraOn = !!permission?.granted && !result;

  return (
    <View style={{ flex: 1, backgroundColor: DARK }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 12 }}>
        <IconButton icon="close" label="Fechar" onPress={close} />
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>Validar passe</Text>
      </View>

      <View style={{ flex: 1, minHeight: 260, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 32 }}>
        {cameraOn ? (
          <View style={{ width: 260, height: 260, borderRadius: 20, overflow: "hidden" }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={busy ? undefined : ({ data }) => void validate(data)}
            />
            <Frame />
          </View>
        ) : (
          <View style={{ width: 260, height: 260 }}>
            <Frame />
          </View>
        )}
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, textAlign: "center" }}>
          {result ? "Leitura concluída" : permission?.granted ? "Aponte a câmara ao QR do passe" : "A câmara é usada apenas para ler o passe digital."}
        </Text>
      </View>

      <ScrollView
        style={{ flexGrow: 0, maxHeight: "62%", backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#DDE2EA" }} />
        {result ? (
          <Result result={result} routeLabel={routeLabel} onNext={next} />
        ) : (
          <>
            {permission && !permission.granted ? (
              <>
                <Button label="Autorizar câmara" onPress={() => void requestPermission()} />
                {!permission.canAskAgain ? <Notice tone="warning">A autorização foi recusada. Active-a nas definições do telemóvel.</Notice> : null}
              </>
            ) : null}
            <ErrorBox message={error} />
            {showManual ? (
              <>
                <Body muted>Use quando a câmara não estiver disponível. O código expira ao fim de 60 segundos.</Body>
                <Field label="Código do passe" value={manual} onChangeText={setManual} autoCapitalize="none" autoCorrect={false} multiline />
                <Button label="Validar" busy={busy} disabled={manual.trim().length < 20} onPress={() => void validate(manual)} />
              </>
            ) : (
              <Button label="Introduzir o código manualmente" variant="outline" onPress={() => setShowManual(true)} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Result({ result, routeLabel, onNext }: { result: ValidationResponse; routeLabel?: string; onNext: () => void }) {
  const ok = result.result === "authorized";
  const tone = ok ? { bg: "#E3F4EA", fg: "#17703D", dot: "#1E7A47" } : { bg: "#FBE4E4", fg: "#A32020", dot: c.danger };
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: tone.bg, borderRadius: 18, padding: 16 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: tone.dot, alignItems: "center", justifyContent: "center" }}>
          <Icon name={ok ? "check" : "close"} color="#fff" size={26} strokeWidth={2.6} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: tone.fg }}>{result.label}</Text>
          <Text style={{ fontSize: 14, color: tone.fg }}>{ok ? (result.seatNumber ? "Passe válido · reserva encontrada · embarque registado" : "Passe válido · embarque registado") : (result.reason ?? "Não autorizado.")}</Text>
        </View>
      </View>
      {result.holder ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar name={result.holder} size={56} />
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: c.text }}>{result.holder}</Text>
        </View>
      ) : null}
      {routeLabel || result.seatNumber ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {routeLabel ? <Fact label="Rota" value={routeLabel} /> : null}
          {result.seatNumber ? <Fact label="Lugar" value={String(result.seatNumber)} /> : null}
        </View>
      ) : null}
      <Body muted style={{ fontSize: 13 }}>São mostrados apenas os dados necessários à autorização. O histórico e os dados de pagamento do estudante não ficam visíveis.</Body>
      <Button label="Ler outro" onPress={onNext} />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#F2F4F8", borderRadius: 14, padding: 12, gap: 2 }}>
      <Text style={{ fontSize: 13, color: c.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{value}</Text>
    </View>
  );
}

function Frame() {
  const corner = { position: "absolute" as const, width: 56, height: 56, borderColor: c.accent };
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={[corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 }]} />
      <View style={[corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 }]} />
      <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 }]} />
      <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 }]} />
    </View>
  );
}
