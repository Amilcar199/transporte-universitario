import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { Icon } from "./kit.tsx";
import { c } from "./ui.tsx";

export interface SketchPoint {
  id: string;
  lat: number;
  lng: number;
}

/**
 * Esquema do percurso com as coordenadas reais das paragens. Não é um mapa de ruas: não existe
 * fornecedor de mapas configurado, e o rótulo diz isso ao utilizador.
 */
export function RouteSketch({
  stops,
  connect = true,
  dashed = false,
  highlightId,
  endLabel,
  bus,
  me,
  height,
  passedIndex,
  insetTop = 0,
}: {
  stops: SketchPoint[];
  connect?: boolean;
  dashed?: boolean;
  highlightId?: string | null;
  /** Rótulo curto do destino (último ponto), por exemplo a sigla da universidade. */
  endLabel?: string;
  bus?: { lat: number; lng: number } | null;
  me?: { lat: number; lng: number } | null;
  /** Altura fixa; sem ela, o esquema ocupa o espaço disponível. */
  height?: number;
  /** Índice da última paragem já percorrida (o troço até aí fica mais claro). */
  passedIndex?: number;
  /** Espaço no topo tapado por controlos sobrepostos, onde não se desenham pontos. */
  insetTop?: number;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = size.width;
  const boxHeight = height ?? size.height;
  const all = [...stops, ...(bus ? [bus] : []), ...(me ? [me] : [])];
  const project = projector(all, width, boxHeight, insetTop);
  const pts = stops.map(project);

  return (
    <View style={[s.box, height ? { height } : { flex: 1 }]} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {width > 0 && boxHeight > 0 ? (
        <>
          <Svg width={width} height={boxHeight} style={StyleSheet.absoluteFill}>
            {GRID.map((g) => (
              <Line key={`v${g}`} x1={width * g} y1={0} x2={width * g} y2={boxHeight} stroke="#D7DEEA" strokeWidth={1} />
            ))}
            {GRID.map((g) => (
              <Line key={`h${g}`} x1={0} y1={boxHeight * g} x2={width} y2={boxHeight * g} stroke="#D7DEEA" strokeWidth={1} />
            ))}
            {connect && pts.length > 1 ? (
              <Polyline
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={c.primary}
                strokeWidth={dashed ? 4 : 6}
                strokeDasharray={dashed ? "2 9" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {connect && passedIndex !== undefined && passedIndex > 0 ? (
              <Polyline
                points={pts.slice(0, passedIndex + 1).map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#9DB0DA"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </Svg>
          {stops.map((stop, i) => {
            const p = pts[i]!;
            const last = i === stops.length - 1 && endLabel;
            if (last) {
              return (
                <View key={stop.id} style={[s.end, { left: p.x - 20, top: p.y - 18 }]}>
                  <Text style={s.endText} numberOfLines={1}>
                    {endLabel}
                  </Text>
                </View>
              );
            }
            if (stop.id === highlightId) {
              return (
                <View key={stop.id} style={[s.highlight, { left: p.x - 22, top: p.y - 22 }]}>
                  <View style={s.highlightCore} />
                </View>
              );
            }
            const passed = passedIndex !== undefined && i <= passedIndex;
            return <View key={stop.id} style={[s.stop, passed && { borderColor: "#9DB0DA" }, { left: p.x - 13, top: p.y - 13 }]} />;
          })}
          {me ? (
            <View style={[s.meHalo, { left: project(me).x - 18, top: project(me).y - 18 }]}>
              <View style={s.me} />
            </View>
          ) : null}
          {bus ? (
            <View style={[s.bus, { left: project(bus).x - 24, top: project(bus).y - 24 }]}>
              <Icon name="bus" color={c.primaryDark} size={22} />
            </View>
          ) : null}
        </>
      ) : null}
      {stops.length > 0 || bus ? (
        <View style={s.caption}>
          <Text style={s.captionText}>Esquema do percurso · sem mapa de ruas</Text>
        </View>
      ) : null}
    </View>
  );
}

const GRID = [0.2, 0.4, 0.6, 0.8];
const GENERIC = new Set(["campus", "univ", "univ.", "universidade", "entrada", "paragem", "de", "do", "da", "dos", "das", "e", "-", "–", "—"]);

/** Rótulo curto de um destino: uma sigla do nome («Campus UÓR» → «UÓR», «Univ. Óscar Ribas» → «ÓR»). */
export function shortLabel(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !GENERIC.has(w.toLocaleLowerCase("pt")));
  const acronym = words.find((w) => w.length >= 2 && w === w.toLocaleUpperCase("pt") && /\p{L}/u.test(w));
  if (acronym) return acronym.slice(0, 4);
  const letters = words.map((w) => w[0]!).join("").toLocaleUpperCase("pt");
  return letters.slice(0, 3) || name.slice(0, 3).toLocaleUpperCase("pt");
}

/** Projecção equirectangular simples, ajustada à caixa com margem. */
function projector(points: { lat: number; lng: number }[], width: number, height: number, insetTop: number) {
  if (points.length === 0 || width === 0) return () => ({ x: width / 2, y: (height + insetTop) / 2 });
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-4);
  const spanY = Math.max(maxLat - minLat, 1e-4);
  const pad = 44;
  const usable = Math.max(height - insetTop, pad * 3);
  const scale = Math.min((width - pad * 2) / spanX, (usable - pad * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = height - usable + (usable - spanY * scale) / 2;
  return (p: { lat: number; lng: number }) => ({
    x: offX + (p.lng - minLng) * k * scale,
    y: offY + (maxLat - p.lat) * scale,
  });
}

const s = StyleSheet.create({
  box: { backgroundColor: "#E6EBF4", overflow: "hidden" },
  stop: { position: "absolute", width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff", borderWidth: 5, borderColor: c.primary },
  highlight: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.accent,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(19, 43, 99, 0.25)",
  },
  highlightCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.primaryDark },
  end: {
    position: "absolute",
    minWidth: 40,
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: c.primary,
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  endText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  meHalo: { position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(37, 99, 235, 0.22)", alignItems: "center", justifyContent: "center" },
  me: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#2563EB", borderWidth: 3, borderColor: "#fff" },
  bus: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.accent,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(19, 43, 99, 0.25)",
  },
  caption: { position: "absolute", right: 10, bottom: 38, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  captionText: { fontSize: 11, color: c.textMuted },
});
