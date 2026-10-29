import { brand } from "@uni/shared";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c } from "./ui.tsx";

/** Moldura dos ecrãs de entrada (iniciar sessão, criar conta, recuperar palavra-passe). */
export function AuthShell({
  title,
  subtitle,
  compact,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  compact?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.hero, { paddingTop: insets.top + (compact ? 24 : 56), paddingBottom: compact ? 64 : 88 }]}>
        <View style={[styles.orb, styles.orbLarge]} />
        <View style={[styles.orb, styles.orbSmall]} />
        <View style={[styles.mark, compact && styles.markCompact]}>
          <Text style={[styles.monogram, compact && { fontSize: 20 }]}>{brand.logo.monogram}</Text>
        </View>
        <Text style={[styles.brandName, compact && { fontSize: 22 }]}>{brand.name}</Text>
        {compact ? null : <Text style={styles.tagline}>{brand.tagline}</Text>}
      </View>
      <View style={styles.body}>
        <View style={styles.sheet}>
          <View style={{ gap: 4 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </View>
        {footer}
      </View>
    </ScrollView>
  );
}

export function BackToLogin({ label = "Voltar a iniciar sessão" }: { label?: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))}
      style={{ alignSelf: "center", padding: 8 }}
    >
      <Text style={{ color: c.primary, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { flexGrow: 1, paddingBottom: 32 },
  hero: {
    backgroundColor: c.primary,
    alignItems: "center",
    gap: 8,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden",
  },
  orb: { position: "absolute", borderRadius: 999, backgroundColor: c.primaryDark },
  orbLarge: { width: 260, height: 260, top: -120, right: -90, opacity: 0.6 },
  orbSmall: { width: 140, height: 140, bottom: -60, left: -40, opacity: 0.45 },
  mark: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    transform: [{ rotate: "-6deg" }],
  },
  markCompact: { width: 52, height: 52, borderRadius: 16, marginBottom: 2 },
  monogram: { color: c.primaryDark, fontSize: 28, fontWeight: "800", letterSpacing: 0.5 },
  brandName: { color: "#fff", fontSize: 28, fontWeight: "800", letterSpacing: 0.3 },
  tagline: { color: "rgba(255,255,255,0.82)", fontSize: 15 },
  body: { paddingHorizontal: 20, marginTop: -48, gap: 16 },
  sheet: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 20,
    gap: 14,
    boxShadow: "0 12px 32px rgba(19, 43, 99, 0.14)",
  },
  title: { fontSize: 22, fontWeight: "700", color: c.text },
  subtitle: { fontSize: 15, color: c.textMuted, lineHeight: 21 },
});
