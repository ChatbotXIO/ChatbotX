import { googleAdsClickIdTypeSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { CLICK_ID_PATTERN } from "@chatbotx.io/utils/google-click"
import { z } from "zod"

/** A Google Ads customer id is exactly ten digits (dashes are display-only). */
const googleAdsCustomerIdSchema = z.string().regex(/^\d{10}$/)

/** A conversion action id is a numeric Google resource id. */
const googleAdsConversionActionIdSchema = z.string().regex(/^\d{1,20}$/)

export const pickGoogleAdsAccountRequest = z.object({
  sessionId: zodBigintAsString(),
  customerId: googleAdsCustomerIdSchema,
})

export const cancelGoogleAdsConnectRequest = z.object({
  sessionId: zodBigintAsString(),
})

export const retryGoogleAdsEventRequest = z.object({
  eventId: zodBigintAsString(),
})

export const validateGoogleAdsRequest = z.object({
  conversionActionId: googleAdsConversionActionIdSchema,
  clickIdType: googleAdsClickIdTypeSchema,
  clickId: z.string().regex(CLICK_ID_PATTERN),
})
