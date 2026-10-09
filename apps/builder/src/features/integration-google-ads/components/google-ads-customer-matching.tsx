"use client"

import { useTranslations } from "next-intl"
import { GoogleAdsFieldDisclosure } from "./google-ads-field-disclosure"
import { GoogleAdsTemplateField } from "./google-ads-template-field"

type GoogleAdsCustomerMatchingProps = {
  emailName: string
  phoneName: string
  /** Customer matching is a Data Manager feature; the legacy uploader cannot send it. */
  isLegacyUpload: boolean
  /** The account has not accepted Google's customer data terms, so hashed identifiers are not sent. */
  termsNotAccepted: boolean
}

/**
 * Collapsed "Customer matching" section: the `{{variable}}` Google gets the
 * contact's e-mail and phone from (hashed when the conversion is sent). Off
 * while both are blank; opens when one is set.
 */
export const GoogleAdsCustomerMatching = ({
  emailName,
  phoneName,
  isLegacyUpload,
  termsNotAccepted,
}: GoogleAdsCustomerMatchingProps) => {
  const t = useTranslations()
  return (
    <GoogleAdsFieldDisclosure
      contentClassName="flex flex-col gap-3 pt-3 motion-reduce:transition-none"
      countLabel={(count) =>
        t("googleAds.conversionFields.customerMatchingCount", { count })
      }
      label={t("googleAds.conversionFields.customerMatching")}
      names={[emailName, phoneName]}
    >
      {isLegacyUpload ? (
        <p className="text-muted-foreground text-xs">
          {t("googleAds.conversionFields.customerMatchingLegacy")}
        </p>
      ) : (
        <>
          <GoogleAdsTemplateField
            deferError
            hideOptionalMarker
            label={t("googleAds.conversionFields.matchEmailLabel")}
            name={emailName}
            placeholder={t("googleAds.conversionFields.matchEmailPlaceholder")}
          />
          <GoogleAdsTemplateField
            deferError
            hideOptionalMarker
            label={t("googleAds.conversionFields.matchPhoneLabel")}
            name={phoneName}
            placeholder={t("googleAds.conversionFields.matchPhonePlaceholder")}
          />
          {termsNotAccepted ? (
            <p className="text-amber-700 text-xs dark:text-amber-400">
              {t("googleAds.conversionFields.customerMatchingTermsNotAccepted")}
            </p>
          ) : null}
        </>
      )}
    </GoogleAdsFieldDisclosure>
  )
}
