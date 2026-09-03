import {
  defaultMetaCapiActionSource,
  type MetaCapiActionSource,
  metaCapiActionSourceSchema,
} from "@chatbotx.io/utils/meta-capi"

/**
 * Flow versions saved before `actionSource` existed on this step/action
 * carry no value for it at all, and the flow-step editor restores node data
 * raw (no zod defaults applied on load) — so any UI reading `actionSource`
 * off a legacy step must treat a missing or invalid value as
 * `business_messaging` rather than passing it straight to a translator or a
 * lookup keyed by `MetaCapiActionSource`.
 */
export const resolveMetaCapiActionSource = (
  value: string | undefined,
): MetaCapiActionSource => {
  const result = metaCapiActionSourceSchema.safeParse(value)
  return result.success ? result.data : defaultMetaCapiActionSource
}
