"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"

/** The rank every new row gets (`rank` column default). */
export const DEFAULT_RANK = 10

const RANKS = Array.from({ length: 20 }, (_, index) => index + 1)

/**
 * Sort position as the spec draws it: "Default" or a position, lower first.
 * The select works in strings, so the form keeps the rank as one and the
 * schema coerces it back to a number.
 */
export function RankSelectField({ name = "rank" }: { name?: string }) {
  const t = useTranslations("ecommerceSettings.rank")
  return (
    <SelectField
      label={t("label")}
      name={name}
      options={[
        { value: String(DEFAULT_RANK), label: t("default") },
        ...RANKS.filter((rank) => rank !== DEFAULT_RANK).map((rank) => ({
          value: String(rank),
          label: String(rank),
        })),
      ]}
    />
  )
}
