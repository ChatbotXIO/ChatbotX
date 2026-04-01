"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useLocale, useTranslations } from "next-intl"
import type React from "react"
import { useTransition } from "react"
import type { Locale } from "@/i18n/config"
import { setUserLocale } from "@/lib/locale"

export const LangSelector: React.FC = () => {
  const locale = useLocale()
  const [, startTransition] = useTransition()
  const t = useTranslations()

  function onChangeLocale(value: string) {
    const newLocale = value as Locale
    startTransition(() => {
      setUserLocale(newLocale)
    })
  }

  return (
    <Select defaultValue={locale} onValueChange={onChangeLocale}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={t("fields.language.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">{t("fields.language.english")}</SelectItem>
        <SelectItem value="vi">{t("fields.language.vietnamese")}</SelectItem>
      </SelectContent>
    </Select>
  )
}
