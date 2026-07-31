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

  const items = [
    { value: "ar", label: "العربية" },
    { value: "en", label: "English" },
    { value: "vi", label: "Tiếng Việt" },
  ]

  return (
    <Select
      defaultValue={locale}
      items={items}
      onValueChange={(value) => onChangeLocale(value as string)}
    >
      <SelectTrigger className="w-45">
        <SelectValue placeholder={t("fields.language.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
