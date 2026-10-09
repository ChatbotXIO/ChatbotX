"use client"

import type { ValidateConsentSummary } from "@chatbotx.io/business"
import { useTranslations } from "next-intl"

export type ValidateConsentResult = {
  consentSummary: ValidateConsentSummary
  variableSkipped: boolean
  /** The fixed ad personalization value the legacy method cannot send. */
  withheldAdPersonalization?: "granted" | "denied"
}

const statusKey = {
  granted: "googleAds.events.consent.status.granted",
  denied: "googleAds.events.consent.status.denied",
} as const

/** Renders only what the test upload carried, never the stored settings. */
export const ValidateConsentLines = ({
  result,
}: {
  result: ValidateConsentResult
}) => {
  const t = useTranslations()
  const { adUserData, adPersonalization } = result.consentSummary
  const included: string[] = []
  if (adUserData !== "omitted") {
    included.push(
      t("googleAds.events.consent.adUserDataFull", {
        status: t(statusKey[adUserData]),
      }),
    )
  }
  if (
    adPersonalization !== "omitted" &&
    adPersonalization !== "notSentLegacy"
  ) {
    included.push(
      t("googleAds.events.consent.adPersonalizationFull", {
        status: t(statusKey[adPersonalization]),
      }),
    )
  }
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-xs">
      <li>
        {included.length > 0
          ? t("googleAds.validate.consentIncluded", {
              values: included.join(", "),
            })
          : t("googleAds.validate.consentNone")}
      </li>
      {adPersonalization === "notSentLegacy" &&
      result.withheldAdPersonalization ? (
        <li>
          {t("googleAds.validate.consentNotSentLegacy", {
            status: t(statusKey[result.withheldAdPersonalization]),
          })}
        </li>
      ) : null}
      {result.variableSkipped ? (
        <li>{t("googleAds.validate.consentVariableSkipped")}</li>
      ) : null}
    </ul>
  )
}
