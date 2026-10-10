import type { GoogleAdsConversionFieldsSchema } from "@chatbotx.io/flow-config"
import type { useTranslations } from "next-intl"

type Translator = ReturnType<typeof useTranslations>

type ConversionSummaryInput = Partial<
  Pick<
    GoogleAdsConversionFieldsSchema,
    "conversionActionId" | "value" | "currency" | "dedupMode" | "dedupId"
  >
>

const getDedupLine = (
  fields: ConversionSummaryInput | undefined,
  t: Translator,
): string | null => {
  if (fields?.dedupMode === "click") {
    return t("googleAds.summary.dedupClick")
  }
  if (fields?.dedupMode === "event") {
    return t("googleAds.summary.dedupEvent")
  }
  return fields?.dedupId
    ? t("googleAds.summary.dedupId", { id: fields.dedupId })
    : null
}

/**
 * Compact summary lines for a configured Google Ads conversion, shown where
 * the form is not (flow-node viewer): the chosen action, value + currency and
 * the dedup choice (once per click, or the ID).
 */
export const getGoogleAdsConversionSummaryLines = (
  fields: ConversionSummaryInput | undefined,
  t: Translator,
): string[] => {
  const lines = [
    fields?.conversionActionId
      ? t("googleAds.summary.conversionAction", {
          id: fields.conversionActionId,
        })
      : t("googleAds.summary.notConfigured"),
    fields?.value
      ? [fields.value, fields.currency].filter(Boolean).join(" ")
      : null,
    getDedupLine(fields, t),
  ]
  return lines.filter((line): line is string => Boolean(line))
}
