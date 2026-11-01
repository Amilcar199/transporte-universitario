import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { c } from "./ui.tsx";

/** Componentes visuais do design da app (cabeçalho azul, ícones, linhas de lista, barra inferior). */

type Shape = ["p", string] | ["c", number, number, number] | ["r", number, number, number, number, number];

const ICONS = {
  home: [["p", "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"]],
  route: [["c", 6, 19, 2.5], ["c", 18, 5, 2.5], ["p", "M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"]],
  pin: [["p", "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"], ["c", 12, 9.5, 2.5]],
  card: [["r", 3, 5, 18, 14, 2.5], ["p", "M3 10h18"]],
  user: [["c", 12, 8, 4], ["p", "M4 21a8 8 0 0 1 16 0"]],
  search: [["c", 11, 11, 7], ["p", "m20 20-3.5-3.5"]],
  bell: [["p", "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"], ["p", "M13.7 21a2 2 0 0 1-3.4 0"]],
  globe: [["c", 12, 12, 9], ["p", "M3 12h18"], ["p", "M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"]],
  back: [["p", "m15 18-6-6 6-6"]],
  chevron: [["p", "m9 18 6-6-6-6"]],
  close: [["p", "M18 6 6 18M6 6l12 12"]],
  clock: [["c", 12, 12, 9], ["p", "M12 7v5l3 2"]],
  alert: [["c", 12, 12, 9], ["p", "M12 8v4"], ["p", "M12 16h.01"]],
  bank: [["p", "M3 10h18L12 4z"], ["p", "M5 10v8M9.5 10v8M14.5 10v8M19 10v8"], ["p", "M3 20h18"]],
  phone: [["r", 7, 3, 10, 18, 2], ["p", "M11 17h2"]],
  wallet: [["r", 3, 6, 18, 13, 2.5], ["c", 12, 12.5, 2.5]],
  flask: [["p", "M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2l-5-10V3"]],
  scan: [["p", "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"], ["p", "M8 12h8"]],
  check: [["p", "m5 12.5 4.5 4.5L19 7"]],
  bus: [["r", 5, 3, 14, 15, 3], ["p", "M5 11h14"], ["c", 8.5, 14.5, 1], ["c", 15.5, 14.5, 1], ["p", "M7.5 18v2.5M16.5 18v2.5"]],
  history: [["p", "M3 12a9 9 0 1 0 3-6.7L3 8"], ["p", "M3 3v5h5"], ["p", "M12 7v5l3 2"]],
  receipt: [["p", "M6 3h12v18l-3-2-3 2-3-2-3 2z"], ["p", "M9 8h6M9 12h6"]],
  shield: [["p", "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"], ["p", "m9 12 2 2 4-4"]],
  calendar: [["r", 3, 5, 18, 16, 2], ["p", "M3 10h18M8 3v4M16 3v4"]],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = c.text, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {(ICONS[name] as Shape[]).map((s, i) =>
        s[0] === "p" ? <Path key={i} d={s[1]} /> : s[0] === "c" ? <Circle key={i} cx={s[1]} cy={s[2]} r={s[3]} /> : <Rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} />,
      )}
    </Svg>
  );
}

/** Página com cabeçalho azul opcional e barra inferior fixa opcional. */
export function Page({
  hero,
  children,
  bottom,
  onRefresh,
  refreshing,
  overlap = 0,
}: {
  hero?: ReactNode;
  children: ReactNode;
  bottom?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Quanto o conteúdo sobe sobre o cabeçalho (cartão sobreposto). */
  overlap?: number;
}) {
  return (
    <View style={k.page}>
      <ScrollView
        style={k.page}
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {hero}
        <View style={[k.body, { marginTop: hero ? -overlap : 20 }]}>{children}</View>
      </ScrollView>
      {bottom ? <BottomBar>{bottom}</BottomBar> : null}
    </View>
  );
}

export function Hero({ children, style, paddingBottom = 28 }: { children: ReactNode; style?: ViewStyle; paddingBottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[k.hero, { paddingTop: insets.top + 20, paddingBottom }, style]}>
      <View style={k.orb} pointerEvents="none" />
      {children}
    </View>
  );
}

export function HeroTitle({ children }: { children: ReactNode }) {
  return <Text style={k.heroTitle}>{children}</Text>;
}

export function HeroText({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <Text style={[k.heroText, strong && { color: "#fff", fontWeight: "700", fontSize: 22 }]}>{children}</Text>;
}

export function HeroChip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      style={[k.heroChip, selected && { backgroundColor: c.accent }]}
    >
      <Text style={[k.heroChipText, selected && { color: c.primaryDark }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={k.chips}>{children}</View>;
}

export function IconButton({ icon, onPress, label, light = true, badge }: { icon: IconName; onPress: () => void; label: string; light?: boolean; badge?: boolean }) {
  return (
    <Pressable accessibilityRole="button" aria-label={label} onPress={onPress} hitSlop={6} style={[k.iconButton, light ? k.iconButtonLight : k.iconButtonSurface]}>
      <Icon name={icon} color={light ? "#fff" : c.text} />
      {badge ? <View style={k.dot} /> : null}
    </Pressable>
  );
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({ name, size = 52 }: { name: string | null | undefined; size?: number }) {
  return (
    <View style={[k.avatar, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Text style={{ color: c.primaryDark, fontWeight: "800", fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={k.section}>
      <Text style={k.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={k.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Panel({ children, style, onPress, highlighted }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; highlighted?: boolean }) {
  const content = <View style={[k.panel, highlighted && k.panelHighlighted, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={k.eyebrow}>{children}</Text>;
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  last,
  selected,
  disabled,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={onPress ? { selected: !!selected, disabled: !!disabled } : undefined}
      style={({ pressed }) => [k.row, !last && k.rowDivider, { opacity: disabled ? 0.55 : pressed ? 0.8 : 1 }]}
    >
      {icon ? (
        <View style={[k.rowIcon, selected && { backgroundColor: c.primary }]}>
          <Icon name={icon} color={selected ? "#fff" : c.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={k.rowTitle}>{title}</Text>
        {subtitle ? <Text style={k.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" color={c.textMuted} size={20} /> : null)}
    </Pressable>
  );
}

export function Radio({ selected }: { selected: boolean }) {
  return <View style={[k.radio, selected && { borderColor: c.primary }]}>{selected ? <View style={k.radioDot} /> : null}</View>;
}

export function TimeBar({ from, to, middle }: { from: string; to: string; middle?: string }) {
  return (
    <View style={k.timeBar}>
      <Text style={k.time}>{from}</Text>
      <View style={k.timeLine} />
      {middle ? <Text style={k.timeMiddle}>{middle}</Text> : null}
      {middle ? <View style={k.timeLine} /> : null}
      <Text style={k.time}>{to}</Text>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={k.track}>
      <View style={[k.fill, { width: `${pct}%` }]} />
    </View>
  );
}

export interface TimelineStop {
  key: string;
  name: string;
  time?: string;
  strong?: boolean;
  selected?: boolean;
  onPress?: () => void;
}

/** Linha vertical de paragens: início a azul, intermédias em anel e destino a amarelo. */
export function StopTimeline({ stops }: { stops: TimelineStop[] }) {
  return (
    <View>
      {stops.map((s, i) => {
        const first = i === 0;
        const last = i === stops.length - 1;
        const dot = last ? k.dotEnd : first || s.selected ? k.dotStart : k.dotMiddle;
        const row = (
          <View style={k.tlRow}>
            <View style={k.tlRail}>
              {!first ? <View style={[k.tlLine, { top: 0, height: "50%" }]} /> : null}
              {!last ? <View style={[k.tlLine, { bottom: 0, height: "50%" }]} /> : null}
              <View style={[k.tlDot, dot]} />
            </View>
            <Text style={[k.tlName, (s.strong || s.selected) && { fontWeight: "700" }]}>{s.name}</Text>
            {s.time ? <Text style={[k.tlTime, (s.strong || s.selected) && { color: c.primary, fontWeight: "700" }]}>{s.time}</Text> : null}
          </View>
        );
        return s.onPress ? (
          <Pressable key={s.key} onPress={s.onPress} accessibilityRole="button" accessibilityState={{ selected: !!s.selected }} aria-label={s.name}>
            {row}
          </Pressable>
        ) : (
          <View key={s.key}>{row}</View>
        );
      })}
    </View>
  );
}

export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[k.bottom, { paddingBottom: 16 + insets.bottom }]}>{children}</View>;
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "danger" | "info" | "neutral" | "accent" }) {
  const t = PILL[tone];
  return (
    <View style={[k.pill, { backgroundColor: t.bg }]}>
      <Text style={[k.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const PILL = {
  success: { bg: "#E3F4EA", fg: "#17703D" },
  warning: { bg: "#FDF1DC", fg: "#8A5300" },
  danger: { bg: "#FBE4E4", fg: "#A32020" },
  info: { bg: c.primaryLight, fg: c.primary },
  neutral: { bg: "#ECEFF4", fg: c.textMuted },
  accent: { bg: c.accent, fg: c.primaryDark },
} as const;

/** Tom e texto dos lugares livres de uma viagem. */
export function seatsPill(seats: number | null | undefined): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (seats === null || seats === undefined) return { label: "Sem viagens marcadas", tone: "neutral" };
  if (seats === 0) return { label: "Lotada", tone: "danger" };
  return { label: seats === 1 ? "1 lugar" : `${seats} lugares`, tone: seats <= 3 ? "warning" : "success" };
}

const SHADOW = "0 6px 20px rgba(19, 43, 99, 0.08)";

const k = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  body: { paddingHorizontal: 20, gap: 16 },
  hero: {
    backgroundColor: c.primary,
    paddingHorizontal: 20,
    gap: 14,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden",
  },
  orb: { position: "absolute", width: 300, height: 300, borderRadius: 150, top: -120, right: -110, backgroundColor: c.primaryDark, opacity: 0.6 },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "800", letterSpacing: 0.2 },
  heroText: { color: "rgba(255,255,255,0.82)", fontSize: 15, lineHeight: 21 },
  heroChip: { backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  heroChipText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconButton: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconButtonLight: { backgroundColor: "rgba(255,255,255,0.16)" },
  iconButtonSurface: { backgroundColor: c.surface, boxShadow: SHADOW },
  dot: { position: "absolute", top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent, borderWidth: 1.5, borderColor: c.primary },
  avatar: { backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: c.text },
  sectionAction: { fontSize: 14, color: c.primary, fontWeight: "600" },
  panel: { backgroundColor: c.surface, borderRadius: 22, padding: 20, gap: 12, boxShadow: SHADOW },
  panelHighlighted: { borderWidth: 2, borderColor: c.primary },
  eyebrow: { fontSize: 13, fontWeight: "700", letterSpacing: 1, color: c.textMuted, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: "#EDF0F5" },
  rowIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryLight, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 16, fontWeight: "600", color: c.text },
  rowSubtitle: { fontSize: 14, color: c.textMuted },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#B8C0CE", alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary },
  timeBar: { flexDirection: "row", alignItems: "center", gap: 10 },
  time: { fontSize: 16, fontWeight: "700", color: c.primary },
  timeLine: { flex: 1, height: 2, backgroundColor: "#DDE2EA", borderRadius: 1 },
  timeMiddle: { fontSize: 13, color: c.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: c.primaryLight, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.primary },
  tlRow: { flexDirection: "row", alignItems: "center", minHeight: 46, gap: 14 },
  tlRail: { width: 18, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  tlLine: { position: "absolute", width: 2, backgroundColor: "#D3D9E4" },
  tlDot: { width: 16, height: 16, borderRadius: 8 },
  dotStart: { backgroundColor: c.primary },
  dotMiddle: { backgroundColor: c.surface, borderWidth: 3, borderColor: c.primary },
  dotEnd: { backgroundColor: c.accent },
  tlName: { flex: 1, fontSize: 16, color: c.text },
  tlTime: { fontSize: 15, color: c.textMuted },
  bottom: { backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 14, gap: 10, borderTopWidth: 1, borderTopColor: "#E8ECF2", flexDirection: "row" },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, alignSelf: "flex-start" },
  pillText: { fontSize: 13, fontWeight: "700" },
});
