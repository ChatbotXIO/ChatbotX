import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { flowVersionResource } from "@/features/flow-versions/schema/resource"
import { parseAsBigInt } from "@/lib/nuqs"
import { basePaginationRequest } from "@/lib/pagination"
import { type FlowResource, flowResource } from "./resource"

export const listFlowsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<FlowResource>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString,
  folderId: parseAsBigInt,
  active: parseAsBoolean,
})

export type ListFlowsSearchParams = Awaited<
  ReturnType<typeof listFlowsSearchParams.parse>
> & {
  workspaceId: string
}

export const listFlowsRequest = basePaginationRequest.extend({
  name: z.string().nullish(),
  folderId: zodBigintAsString().nullish(),
  active: z.boolean().nullish(),
  startType: z.string().nullish(),
  integrationWhatsappId: zodBigintAsString().nullish(),
})
export type ListFlowsRequest = z.infer<typeof listFlowsRequest>

export const listFlowsResponse = z.object({
  data: z.array(
    flowResource.and(
      z.object({
        flowVersions: z.array(flowVersionResource),
      }),
    ),
  ),
  pageCount: z.number(),
})
export type ListFlowsResponse = z.infer<typeof listFlowsResponse>

export type FindFlowParams = {
  id: string
  workspaceId: string
}
