import { brand } from "@uni/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { ApiError } from "./api.ts";

export const c = brand.colors;

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Ocorreu um erro inesperado.";
}

/** Carrega dados da API com estado de carregamento, erro e recarga. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await load();
      if (mounted.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Recarrega quando o utilizador volta ao ecrã (o primeiro carregamento já é feito por `useLoad`). */
export function useRefreshOnFocus(refresh: () => void) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refresh();
    }, [refresh]),
  );
}

export function Screen({ children, onRefresh, refreshing = false }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

type ButtonVariant = "primary" | "secondary" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
}) {
  const bg = variant === "primary" ? c.primary : variant === "danger" ? c.danger : c.surface;
  const fg = variant === "secondary" ? c.primary : "#fff";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === "secondary" ? c.primary : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, secureTextEntry, onFocus, onBlur, ...props }: TextInputProps & { label: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputBox, focused && styles.inputFocused, error ? { borderColor: c.danger } : null]}>
        <TextInput
          aria-label={label}
          placeholderTextColor={c.textMuted}
          style={styles.input}
          secureTextEntry={secureTextEntry && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            aria-label={revealed ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            style={styles.reveal}
          >
            <Text style={{ color: c.primary, fontSize: 14, fontWeight: "600" }}>{revealed ? "Ocultar" : "Mostrar"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const TONES = {
  success: { bg: "#E3F4EA", fg: c.success },
  warning: { bg: "#FDF1DC", fg: c.warning },
  danger: { bg: "#FBE4E4", fg: c.danger },
  info: { bg: c.primaryLight, fg: c.primary },
  neutral: { bg: "#ECEFF4", fg: c.textMuted },
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Assinala registos de demonstração para nunca serem confundidos com dados reais. */
export function DemoTag({ show }: { show: boolean }) {
  return show ? <Badge label="DEMO" tone="warning" /> : null;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderColor: t.fg }]}>
      <Text style={{ color: t.fg, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <View style={{ gap: 8 }}>
      <Notice tone="danger">{message}</Notice>
      {onRetry ? <Button label="Tentar novamente" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: "center" }}>
      <ActivityIndicator color={c.primary} size="large" />
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Body muted style={{ textAlign: "center", paddingVertical: 16 }}>{children}</Body>;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected ? { backgroundColor: c.primary, borderColor: c.primary } : null]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={{ color: selected ? "#fff" : c.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  screenContent: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: c.surface,
    borderRadius: brand.radius.lg,
    borderWidth: 1,
    borderColor: "#E6EAF1",
    padding: 16,
    gap: 8,
    boxShadow: "0 2px 8px rgba(19, 43, 99, 0.06)",
  },
  title: { fontSize: 22, fontWeight: "700", color: c.text },
  subtitle: { fontSize: 17, fontWeight: "600", color: c.text },
  body: { fontSize: 15, color: c.text, lineHeight: 21 },
  muted: { color: c.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  button: { minHeight: 50, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  field: { gap: 6 },
  label: { fontSize: 14, color: c.text, fontWeight: "600" },
  inputBox: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 12,
    backgroundColor: "#F8FAFD",
  },
  inputFocused: { borderColor: c.primary, backgroundColor: c.surface },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 14, fontSize: 16, color: c.text, outlineWidth: 0 },
  reveal: { paddingHorizontal: 14, minHeight: 48, justifyContent: "center" },
  fieldError: { color: c.danger, fontSize: 13 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  notice: { borderLeftWidth: 4, borderRadius: brand.radius.sm, padding: 12 },
  chip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.surface },
});
