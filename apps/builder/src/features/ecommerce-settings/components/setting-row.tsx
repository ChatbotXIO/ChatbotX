"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

/** One setting: its name, the control, and what it does. */
export function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="grid items-start gap-4 pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.5fr)]">
        <p className="font-semibold text-sm">{label}</p>
        <div className="min-w-0">{children}</div>
        <div className="text-muted-foreground text-sm">{description}</div>
      </CardContent>
    </Card>
  )
}

/** The save button under a settings group. */
export function SettingsSaveBar({ isSaving }: { isSaving: boolean }) {
  const t = useTranslations("ecommerceSettings")
  return (
    <div className="sticky bottom-0 flex justify-end bg-background/80 py-3 backdrop-blur">
      <Button disabled={isSaving} type="submit">
        {t("save")}
      </Button>
    </div>
  )
}
