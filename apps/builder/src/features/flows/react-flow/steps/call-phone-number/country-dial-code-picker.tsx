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
import type { CountryCode } from "libphonenumber-js"
import { Check, ChevronsUpDown } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useCountryOptions } from "@/hooks/use-country-options"
import { toDialCode } from "./phone-number-parts"

type CountryDialCodePickerProps = {
  /** null = no country: the number is typed with its own `+` dial code. */
  value: CountryCode | null
  disabled: boolean
  onChange: (country: CountryCode | null) => void
}

const toFlagEmoji = (countryCode: string): string =>
  String.fromCodePoint(
    ...[...countryCode.toUpperCase()].map(
      (letter) => 0x1_f1_e6 + letter.charCodeAt(0) - "A".charCodeAt(0),
    ),
  )

/**
 * Optional flag + dial code picker, searchable by country name, ISO code or
 * dial code (`germ`, `DE`, `+49` all find Germany). Its first option clears
 * the country.
 */
export const CountryDialCodePicker = ({
  value,
  disabled,
  onChange,
}: CountryDialCodePickerProps) => {
  const t = useTranslations()
  const countryOptions = useCountryOptions()
  const [open, setOpen] = useState(false)
  const select = (country: CountryCode | null) => {
    onChange(country)
    setOpen(false)
  }

  return (
    <Popover modal onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-expanded={open}
            aria-label={t("flows.callPhoneNumber.countryLabel")}
            className="w-28 shrink-0 justify-between px-3"
            disabled={disabled}
            role="combobox"
            variant="outline"
          >
            <span className="truncate">
              {value ? `${toFlagEmoji(value)} ${toDialCode(value)}` : "+"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={t("actions.search")} />
          <CommandList>
            <CommandEmpty>{t("messages.noResults")}</CommandEmpty>
            <CommandItem
              className="text-muted-foreground"
              onSelect={() => select(null)}
              value={t("flows.callPhoneNumber.noCountry")}
            >
              <span className="min-w-0 flex-1 truncate">
                {t("flows.callPhoneNumber.noCountry")}
              </span>
              <Check
                className={cn(
                  "size-4",
                  value === null ? "opacity-100" : "opacity-0",
                )}
              />
            </CommandItem>
            {countryOptions.map(({ value: country, label }) => {
              const dialCode = toDialCode(country)
              return (
                <CommandItem
                  key={country}
                  keywords={[label, dialCode]}
                  onSelect={() => select(country)}
                  value={country}
                >
                  <span>{toFlagEmoji(country)}</span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className="text-muted-foreground">{dialCode}</span>
                  <Check
                    className={cn(
                      "size-4",
                      country === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
