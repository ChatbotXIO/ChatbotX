import { usePlatformSettings } from "@/features/platform"
import type { ContactResource } from "./schemas/resource"

export function useAvatarUrl(
  contact?: ContactResource | null,
): string | undefined {
  const { assetUrl } = usePlatformSettings()
  if (!contact) {
    return
  }

  return contact.avatar
    ? new URL(contact.avatar, assetUrl).toString()
    : undefined
}

// Pasta com 156 avatares (13 cores × 12 expressões) extraídos do CDN do
// Respond.io. Cor + expressão escolhidas por hash determinístico do nome —
// mesmo contato sempre mesmo avatar.
// 2026-05-24 — Pedro pediu pra usar os avatares reais do Respond.
const RESPOND_AVATAR_COLORS = [
  "red-lighten-2",
  "pink-lighten-2",
  "purple-lighten-2",
  "deep-purple-lighten-2",
  "indigo-lighten-2",
  "blue-darken-1",
  "teal-lighten-2",
  "light-green-darken-2",
  "lime-darken-2",
  "amber-lighten-1",
  "orange-lighten-1",
  "deep-orange-lighten-1",
  "brown-lighten-2",
] as const

// Cor base do avatar (pra fallback quando a imagem ainda tá carregando).
const RESPOND_AVATAR_HEX: Record<string, string> = {
  "red-lighten-2": "#E57373",
  "pink-lighten-2": "#F06292",
  "purple-lighten-2": "#BA68C8",
  "deep-purple-lighten-2": "#9575CD",
  "indigo-lighten-2": "#7986CB",
  "blue-darken-1": "#1E88E5",
  "teal-lighten-2": "#4DB6AC",
  "light-green-darken-2": "#558B2F",
  "lime-darken-2": "#9E9D24",
  "amber-lighten-1": "#FFCA28",
  "orange-lighten-1": "#FFA726",
  "deep-orange-lighten-1": "#FF7043",
  "brown-lighten-2": "#A1887F",
}

// DJB2 hash (sem bitwise — regra biome noBitwiseOperators). Produz inteiro
// positivo determinístico do seed. Versão anterior usava `hash << 5` + `hash |= 0`.
function hashOf(seed: string): number {
  let hash = 5381
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 33 + seed.charCodeAt(i)) % 2_147_483_647
  }
  return hash
}

export function getRespondAvatarUrl(seed: string | null | undefined): {
  url: string
  color: string
} {
  const text = seed?.trim() || "?"
  const hash = hashOf(text)
  const color = RESPOND_AVATAR_COLORS[
    hash % RESPOND_AVATAR_COLORS.length
  ] as string
  const number = (hash % 12) + 1 // 1..12
  return {
    url: `/respond-avatars/${color}/${number}.webp`,
    color: RESPOND_AVATAR_HEX[color] ?? "#0049C7",
  }
}

// Mantido por compatibilidade — devolve só a cor.
export function getAvatarColor(seed: string | null | undefined): string {
  return getRespondAvatarUrl(seed).color
}

// Regex top-level (regra biome useTopLevelRegex).
const WHITESPACE_SPLIT = /\s+/

export function getAvatarInitials(name: string | null | undefined): string {
  if (!name) {
    return "?"
  }
  const parts = name.trim().split(WHITESPACE_SPLIT).filter(Boolean)
  if (parts.length === 0) {
    return "?"
  }
  if (parts.length === 1) {
    return (parts[0] ?? "?").slice(0, 2).toUpperCase()
  }
  return (
    ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase() || "?"
  )
}
