"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { ClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  eventConsentDeliveryLabelKey,
  eventConsentStatusLabelKey,
} from "../lib/status"
import type { GoogleAdsEventResource } from "../schema/events"

const DEDUP_ID_PREVIEW_LENGTH = 16
const EMPTY = "—"

const focusableCellClass =
  "block rounded-sm text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

const truncateId = (id: string): string =>
  id.length > DEDUP_ID_PREVIEW_LENGTH
    ? `${id.slice(0, DEDUP_ID_PREVIEW_LENGTH)}…`
    : id

/** "Per click", "Every run" or "ID: {id}" (cut to 16 characters; the full value is the tooltip). */
export const DedupCell = ({
  identity,
}: {
  identity: GoogleAdsEventResource["identity"]
}) => {
  const t = useTranslations()
  if (!identity) {
    return <>{EMPTY}</>
  }
  if (identity.mode === "event") {
    return <>{t("googleAds.events.dedup.event")}</>
  }
  if (identity.mode === "click" || identity.id === null) {
    return <>{t("googleAds.events.dedup.click")}</>
  }
  const full = t("googleAds.events.dedup.id", { id: identity.id })
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={full}
            className={`${focusableCellClass} font-mono text-xs`}
            type="button"
          />
        }
      >
        {t("googleAds.events.dedup.id", { id: truncateId(identity.id) })}
      </TooltipTrigger>
      <TooltipContent className="max-w-80 break-all">{full}</TooltipContent>
    </Tooltip>
  )
}

/** Marks a conversion time that came from the step instead of from when it ran. */
export const ProvidedTimeMarker = () => {
  const t = useTranslations()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            className={`${focusableCellClass} mt-1 inline-flex items-center gap-1 text-xs`}
            type="button"
          />
        }
      >
        <ClockIcon aria-hidden="true" className="size-3" />
        {t("googleAds.events.timeProvided")}
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        {t("googleAds.events.timeProvidedTooltip")}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * What consent the event carried. A skipped event never uploaded, so it only
 * says so; otherwise short labels show in the cell and the full ones are the
 * accessible name and tooltip.
 */
export const ConsentSnapshotCell = ({
  snapshot,
}: {
  snapshot: GoogleAdsEventResource["consentSnapshot"]
}) => {
  const t = useTranslations()
  if (!snapshot) {
    return <>{EMPTY}</>
  }
  const delivery =
    snapshot.delivery === "sent"
      ? null
      : t(eventConsentDeliveryLabelKey[snapshot.delivery])
  if (snapshot.delivery === "notSent") {
    return <>{delivery}</>
  }
  const userData = t(eventConsentStatusLabelKey[snapshot.adUserData])
  const personalization = t(
    eventConsentStatusLabelKey[snapshot.adPersonalization],
  )
  const full = [
    delivery,
    t("googleAds.events.consent.adUserDataFull", { status: userData }),
    t("googleAds.events.consent.adPersonalizationFull", {
      status: personalization,
    }),
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={full}
            className={`${focusableCellClass} text-xs`}
            type="button"
          />
        }
      >
        {delivery ? (
          <span className="block font-medium">{delivery}</span>
        ) : null}
        <span className="block">
          {t("googleAds.events.consent.adUserDataShort", { status: userData })}
        </span>
        <span className="block">
          {t("googleAds.events.consent.adPersonalizationShort", {
            status: personalization,
          })}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{full}</TooltipContent>
    </Tooltip>
  )
}

const matchingFieldLabelKey = {
  email: "googleAds.conversionFields.matchEmailLabel",
  phone: "googleAds.conversionFields.matchPhoneLabel",
} as const

const matchingStatusLabelKey = {
  enabled: "googleAds.events.matching.enabled",
  withheldConsent: "googleAds.events.matching.withheldConsent",
  unsupportedTransport: "googleAds.events.matching.unsupportedTransport",
} as const

/** Which identifiers customer matching was set to send and whether it could: never their values. */
export const MatchingCell = ({
  matching,
}: {
  matching: GoogleAdsEventResource["customerMatching"]
}) => {
  const t = useTranslations()
  if (!matching) {
    return <>{EMPTY}</>
  }
  const fields = matching.fields
    .map((field) => t(matchingFieldLabelKey[field]))
    .join(", ")
  return <>{t(matchingStatusLabelKey[matching.status], { fields })}</>
}

const propertyLabelKey = {
  customerType: "googleAds.conversionFields.customerTypeLabel",
  customerValueBucket: "googleAds.conversionFields.customerValueBucketLabel",
} as const

/** The recorded customer properties: their values when sent, otherwise why they are not. */
export const CustomerPropertiesCell = ({
  properties,
}: {
  properties: GoogleAdsEventResource["customerProperties"]
}) => {
  const t = useTranslations()
  if (!properties) {
    return <>{EMPTY}</>
  }
  if (properties.status === "enabled") {
    return (
      <>
        {[properties.customerType, properties.customerValueBucket]
          .filter(Boolean)
          .join(" · ")}
      </>
    )
  }
  const fields = (["customerType", "customerValueBucket"] as const)
    .filter((key) => properties[key])
    .map((key) => t(propertyLabelKey[key]))
    .join(", ")
  return <>{t(matchingStatusLabelKey[properties.status], { fields })}</>
}
