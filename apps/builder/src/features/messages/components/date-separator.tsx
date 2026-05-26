"use client"

import { format, isToday, isYesterday } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useTranslations } from "next-intl"

type DateSeparatorProps = {
  date: Date | string
}

// Pixel-perfect Respond.io 2026-05-25 (FASE B + iteração 11):
// Pill cinza centralizado mostrando "Hoje" / "Ontem" / "DD/MM/YYYY"
// no topo do bloco de mensagens daquele dia. Aparece dentro do
// scroll da timeline (não fixed) e some quando rola pra cima do dia
// anterior.
// REGRA Pedro 2026-05-25 (feedback_pedro_radius_pills.md): NUNCA usar
// rounded-full em pills com texto — Respond.io usa radius=4px exato
// (v-chip --size-small confirmado via Chrome MCP getComputedStyle:
// borderRadius "4px", bg #2F2F32, font 12/600, padding 2 4 2 4).
export function DateSeparator({ date }: DateSeparatorProps) {
  const t = useTranslations()
  const d = typeof date === "string" ? new Date(date) : date

  let label: string
  if (isToday(d)) {
    label = t("conversations.todayLabel")
  } else if (isYesterday(d)) {
    label = t("conversations.yesterdayLabel")
  } else {
    label = format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  }

  return (
    <div className="my-3 flex w-full items-center justify-center">
      <span className="inline-flex h-6 items-center rounded-[4px] bg-app-surface-2 px-2 font-semibold text-[12px] text-text-secondary">
        {label}
      </span>
    </div>
  )
}
