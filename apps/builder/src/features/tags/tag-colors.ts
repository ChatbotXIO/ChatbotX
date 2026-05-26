/**
 * Paleta + helper de estilo do chip de Etiqueta — pixel-perfect Respond.io.
 *
 * Pedro 2026-05-26 (após inspeção ao vivo via Chrome MCP):
 *   - Chip = trio (bg escuro saturado + text MUITO claro pastel + outline médio)
 *   - O "border fininho" que Pedro viu é na verdade `outline 1px sólido`,
 *     não `border` (border-width é 0px no Respond.io)
 *   - Mapping medido: amber bg `rgb(74,54,0)` text `rgb(255,235,209)` outline
 *     `rgb(118,87,0)`. Mesmo hue, S~mantido, L varia: bg=14-20%, outline=23-44%,
 *     text=91-96%
 *
 * Pra suportar qualquer cor user-input do swatch, derivamos a tripleta via
 * HSL: mantém hue, satura mínimo 40%, e fixa L em 3 níveis.
 */

// 8 cores base — tons saturados médios pra ficarem bonitos no swatch da paleta.
// O renderer converte cada uma pro trio bg/text/outline via HSL.
export const TAG_PRESET_COLORS = [
  "#64748B", // slate-500 (cinza neutro)
  "#DC2626", // red-600
  "#EA580C", // orange-600
  "#D97706", // amber-600
  "#16A34A", // green-600
  "#2563EB", // blue-600
  "#9333EA", // purple-600
  "#DB2777", // pink-600
] as const

// Default = cinza neutro (1ª da paleta).
export const DEFAULT_TAG_COLOR = TAG_PRESET_COLORS[0]

// --- conversões HSL ---

// Regex top-level (regra biome useTopLevelRegex).
const HEX_6 = /^#([\da-fA-F]{6})$/

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = HEX_6.exec(hex)
  if (!m) {
    return { r: 100, g: 116, b: 139 } // fallback slate-500
  }
  // Decompõe via divisão/módulo em vez de bitwise (regra noBitwiseOperators).
  const v = Number.parseInt(m[1], 16)
  return {
    r: Math.floor(v / 65_536) % 256,
    g: Math.floor(v / 256) % 256,
    b: v % 256,
  }
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h *= 60
  }
  return { h, s, l }
}

function hslToCss(h: number, s: number, l: number): string {
  // saturação mínima 40% pra evitar chip "lavado" quando user escolhe cinza.
  // Pro cinza puro (s≈0) deixamos s=0 mesmo (hue irrelevante).
  const sPct = Math.round(Math.max(s * 100, s > 0.02 ? 35 : 0))
  const lPct = Math.round(Math.max(0, Math.min(100, l * 100)))
  return `hsl(${Math.round(h)} ${sPct}% ${lPct}%)`
}

/**
 * Estilo do chip RENDERIZADO (tabela + preview). Derivado da cor base do user.
 * - backgroundColor: hue mantido, L=18% (escuro saturado)
 * - color: hue mantido, L=93% (pastel claro)
 * - outlineColor: hue mantido, L=24% (sutil — quase mesma luminosidade do bg
 *   pra borda ficar bem fina visualmente, conforme Pedro 2026-05-26 "borda
 *   muito grossa ainda")
 *
 * `outline` (não `border`) pra não deslocar layout. `outline-offset: -1px`
 * desenha pra dentro do chip pra não vazar do container.
 */
export function getTagChipStyle(hex: string | null | undefined): {
  backgroundColor: string
  color: string
  outline: string
  outlineOffset: string
} {
  const safe = hex && HEX_6.test(hex) ? hex : DEFAULT_TAG_COLOR
  const { r, g, b } = hexToRgb(safe)
  const { h, s } = rgbToHsl(r, g, b)
  const bg = hslToCss(h, s, 0.18)
  const text = hslToCss(h, s, 0.93)
  // L=24% é só 6 pontos acima do bg (L=18%) — borda sutil/fina visualmente.
  const outlineColor = hslToCss(h, s, 0.24)
  return {
    backgroundColor: bg,
    color: text,
    outline: `1px solid ${outlineColor}`,
    outlineOffset: "-1px",
  }
}

/**
 * Estilo do SWATCH da paleta (bolinha no dialog). Mantém o look pastel
 * pra fácil distinção visual entre cores disponíveis.
 */
export function getSwatchStyle(hex: string): {
  backgroundColor: string
  borderColor: string
} {
  return {
    backgroundColor: `${hex}40`, // ~25% alpha
    borderColor: `${hex}80`, // ~50% alpha
  }
}
