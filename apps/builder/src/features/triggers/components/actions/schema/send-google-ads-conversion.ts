import { triggerActions } from "@chatbotx.io/database/partials"
import {
  googleAdsConversionFieldsSchema,
  withGoogleAdsConversionRefinements,
} from "@chatbotx.io/flow-config"
import z from "zod"

export const sendGoogleAdsConversion = withGoogleAdsConversionRefinements(
  googleAdsConversionFieldsSchema.extend({
    type: z.literal(triggerActions.enum.sendGoogleAdsConversion),
  }),
)
export type SendGoogleAdsConversion = z.infer<typeof sendGoogleAdsConversion>

export const defaultFn = (): SendGoogleAdsConversion => ({
  type: triggerActions.enum.sendGoogleAdsConversion,
  conversionActionId: "",
  value: undefined,
  currency: undefined,
  dedupMode: "id",
  dedupId: undefined,
  matchEmail: undefined,
  matchPhone: undefined,
  customerType: undefined,
  customerValueBucket: undefined,
  conversionTime: undefined,
})
