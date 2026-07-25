import type { FacebookLeadAdsAutomationModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { flowResource } from "@/features/flows/schemas/resource"
import { facebookLeadAdsAutomationResource } from "./resource"

export const listFacebookLeadAdsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  sort: getSortingStateParser<FacebookLeadAdsAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listFacebookLeadAdsSearchParamsCache = createSearchParamsCache(
  listFacebookLeadAdsSearchParams,
)

export type ListFacebookLeadAdsRequest = Awaited<
  ReturnType<typeof listFacebookLeadAdsSearchParamsCache.parse>
> & { workspaceId: string }

export const listFacebookLeadAdItem = facebookLeadAdsAutomationResource.and(
  z.object({
    flow: flowResource.nullable(),
  }),
)
export type ListFacebookLeadAdItem = z.infer<typeof listFacebookLeadAdItem>

export const listFacebookLeadAdsResponse = z.object({
  data: z.array(listFacebookLeadAdItem),
  pageCount: z.number(),
})
export type ListFacebookLeadAdsResponse = z.infer<
  typeof listFacebookLeadAdsResponse
>
