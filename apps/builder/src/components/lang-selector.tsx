"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type React from "react"
import { useState, useTransition } from "react"
import { isLocale, localeMeta, locales, resolveLocale } from "@/i18n/config"
import { setUserLocale } from "@/lib/locale"

const items = locales.map((value) => ({
  value,
  label: localeMeta[value].nativeLabel,
}))

export const LangSelector: React.FC = () => {
  const locale = resolveLocale(useLocale())
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const t = useTranslations()

  function onChangeLocale(value: string) {
    if (!isLocale(value)) {
      return
    }
    startTransition(async () => {
      await setUserLocale(value)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-expanded={open}
            aria-label={t("fields.language.label")}
            className="w-45 justify-between"
            disabled={isPending}
            role="combobox"
            variant="outline"
          >
            <span className="truncate">{localeMeta[locale].nativeLabel}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-45 p-0">
        <Command>
          <CommandInput className="h-9" placeholder={t("actions.search")} />
          <CommandList>
            <CommandEmpty>{t("actions.noRecordFound")}</CommandEmpty>
            {items.map((item) => (
              <CommandItem
                disabled={isPending}
                key={item.value}
                onSelect={() => onChangeLocale(item.value)}
                value={item.label}
              >
                {item.label}
                <Check
                  className={cn(
                    "ms-auto size-4",
                    locale === item.value ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
