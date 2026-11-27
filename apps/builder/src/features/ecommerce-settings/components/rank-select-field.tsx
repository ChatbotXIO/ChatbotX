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
export function RankSelectField({
  name = "rank",
  currentRank,
}: {
  name?: string
  /** A saved rank outside 1-20 (e.g. set via the API) stays selectable. */
  currentRank?: number
}) {
  const t = useTranslations("ecommerceSettings.rank")
  const extraRank =
    currentRank !== undefined && !RANKS.includes(currentRank)
      ? [{ value: String(currentRank), label: String(currentRank) }]
      : []
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
        ...extraRank,
      ]}
    />
  )
}
