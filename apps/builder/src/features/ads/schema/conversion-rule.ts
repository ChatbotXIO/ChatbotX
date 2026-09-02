import {
  adsConversionRuleResource,
  createAdsConversionRuleInput,
  listAdsConversionRulesInput,
  removeAdsConversionRuleInput,
  toggleAdsConversionRuleInput,
  updateAdsConversionRuleInput,
} from "@chatbotx.io/business"
import { z } from "zod"

export const createAdsConversionRuleRequest = createAdsConversionRuleInput.omit(
  {
    workspaceId: true,
  },
)
export type CreateAdsConversionRuleRequest = z.infer<
  typeof createAdsConversionRuleRequest
>

export const updateAdsConversionRuleRequest = updateAdsConversionRuleInput.omit(
  {
    workspaceId: true,
  },
)
export type UpdateAdsConversionRuleRequest = z.infer<
  typeof updateAdsConversionRuleRequest
>

export const toggleAdsConversionRuleRequest = toggleAdsConversionRuleInput.omit(
  {
    workspaceId: true,
  },
)
export type ToggleAdsConversionRuleRequest = z.infer<
  typeof toggleAdsConversionRuleRequest
>

export const deleteAdsConversionRuleRequest = removeAdsConversionRuleInput.omit(
  {
    workspaceId: true,
  },
)
export type DeleteAdsConversionRuleRequest = z.infer<
  typeof deleteAdsConversionRuleRequest
>

export const listAdsConversionRulesRequest = listAdsConversionRulesInput
export const listAdsConversionRulesResponse = z.object({
  data: z.array(adsConversionRuleResource),
})
export type ListAdsConversionRulesResponse = z.infer<
  typeof listAdsConversionRulesResponse
>
