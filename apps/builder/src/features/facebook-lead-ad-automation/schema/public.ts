import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import {
  createFacebookLeadAdAutomationRequest,
  updateFacebookLeadAdAutomationRequest,
} from "./action"
import { facebookLeadAdsAutomationResource } from "./resource"

export const listFacebookLeadAdsPublicRequest = publicListRequest.extend({
  keyword: z.string().optional(),
  sort: z
    .array(
      z.object({
        id: z.string(),
        desc: z.boolean(),
      }),
    )
    .optional(),
})

const facebookLeadAdPublicItem = facebookLeadAdsAutomationResource
  .omit({ workspaceId: true })
  .and(
    z.object({
      flow: z.object({ id: z.string(), name: z.string() }).nullable(),
    }),
  )

export const listFacebookLeadAdsPublicResponse = publicListResponse(
  facebookLeadAdPublicItem,
)

export const getFacebookLeadAdPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const createFacebookLeadAdPublicRequest =
  createFacebookLeadAdAutomationRequest

export const updateFacebookLeadAdPublicRequest =
  updateFacebookLeadAdAutomationRequest.extend({
    id: zodBigintAsString(),
  })

export const deleteFacebookLeadAdPublicRequest = z.object({
  id: zodBigintAsString(),
})
export const facebookLeadAdPublicDetailResource = facebookLeadAdPublicItem

export const listFacebookLeadAdsPagesPublicResponse = z.object({
  pages: z.array(
    z.object({
      pageId: z.string(),
      pageName: z.string(),
      eligible: z.boolean(),
    }),
  ),
})

export const listFacebookLeadAdsFormsPublicRequest = z.object({
  pageId: z.string(),
})

const facebookLeadAdFormQuestion = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  id: z.string(),
})

export const listFacebookLeadAdsFormsPublicResponse = z.object({
  forms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      questions: z.array(facebookLeadAdFormQuestion).optional(),
    }),
  ),
})

export const facebookLeadAdPublicResource =
  facebookLeadAdsAutomationResource.omit({ workspaceId: true })
