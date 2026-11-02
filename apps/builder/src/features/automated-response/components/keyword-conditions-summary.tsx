"use client"

import type { KeywordCondition } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { Fragment } from "react"

/** One-line "Contains (a)(b) and Begins with (c)" view of a rule's conditions. */
export function KeywordConditionsSummary(props: {
  conditions: KeywordCondition[]
}) {
  const t = useTranslations()

  return (
    <span className="flex flex-wrap items-center gap-1">
      {props.conditions.map((condition, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no id and keep their order
        <Fragment key={index}>
          {index > 0 ? (
            <span className="text-muted-foreground">
              {t("keywords.conditions.and")}
            </span>
          ) : null}
          <span className="font-medium">
            {t(`keywords.conditions.operators.${condition.operator}`)}
          </span>
          {condition.values.map((value) => (
            <span
              className="max-w-40 truncate rounded-full bg-muted px-2 py-0.5 text-xs"
              key={value}
            >
              {value}
            </span>
          ))}
        </Fragment>
      ))}
    </span>
  )
}
