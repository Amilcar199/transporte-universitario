/**
 * Identidade visual provisória. Para mudar o nome, as cores ou o logótipo do produto,
 * altere apenas este ficheiro (e os ficheiros de imagem referidos em `logo`).
 */
export const brand = {
  name: "UniRota",
  tagline: "Mobilidade universitária organizada",
  legalName: "UniRota (nome provisório)",
  /** Contactos de exemplo: substituir pelos contactos oficiais antes de qualquer lançamento. */
  supportEmail: "suporte@exemplo.ao",
  supportPhone: "+244 900 000 000",
  supportContactsAreExamples: true,
  country: "Angola",
  currency: { code: "AOA", symbol: "Kz", locale: "pt-AO" },
  timeZone: "Africa/Luanda",
  colors: {
    primary: "#1D3F8F",
    primaryDark: "#132B63",
    primaryLight: "#E7EDFA",
    accent: "#F2A516",
    success: "#1E8E4E",
    warning: "#C77700",
    danger: "#C62828",
    info: "#1565C0",
    text: "#14171F",
    textMuted: "#5B6474",
    border: "#D9DEE7",
    surface: "#FFFFFF",
    background: "#F4F6FA",
  },
  radius: { sm: 6, md: 10, lg: 16 },
  font: {
    family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  logo: {
    /** Monograma usado enquanto não existir logótipo definitivo. */
    monogram: "UR",
  },
} as const;

export type Brand = typeof brand;

export function formatKz(amount: number): string {
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(amount)} ${brand.currency.symbol}`;
}
