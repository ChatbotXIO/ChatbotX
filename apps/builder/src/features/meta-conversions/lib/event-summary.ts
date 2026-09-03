import type { MetaCapiEventFieldsSchema } from "@chatbotx.io/flow-config"
import { defaultMetaCapiActionSource } from "@chatbotx.io/utils/meta-capi"
import type { useTranslations } from "next-intl"
import {
  getMetaCapiActionSourceLabel,
  getMetaCapiEventLabel,
} from "./event-label"
import { resolveMetaCapiActionSource } from "./resolve-action-source"

type MetaCapiTranslator = ReturnType<typeof useTranslations>

type MetaCapiEventSummaryInput = Partial<
  Pick<
    MetaCapiEventFieldsSchema,
    "eventName" | "actionSource" | "value" | "currency"
  >
>

/**
 * Compact summary lines shown wherever a configured CAPI event is displayed
 * without its form (flow-node viewer, step editor card): the event label,
 * the action source when it is not the default, and value+currency when
 * set. Tolerates legacy stored steps that predate `actionSource`/`eventName`.
 */
export const getMetaCapiEventSummaryLines = (
  fields: MetaCapiEventSummaryInput | undefined,
  t: MetaCapiTranslator,
): string[] => {
  const actionSource = resolveMetaCapiActionSource(fields?.actionSource)
  const lines = [
    fields?.eventName ? getMetaCapiEventLabel(fields.eventName, t) : null,
    actionSource === defaultMetaCapiActionSource
      ? null
      : getMetaCapiActionSourceLabel(actionSource, t),
    fields?.value
      ? [fields.value, fields.currency].filter(Boolean).join(" ")
      : null,
  ]
  return lines.filter((line): line is string => Boolean(line))
}
