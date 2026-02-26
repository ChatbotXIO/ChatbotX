import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { flowVersionResource } from "@/features/flow-versions/schema/resource"
import { basePaginationRequest } from "@/lib/pagination"
import { type FlowResource, flowResource } from "./resource"

export const listFlowsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<FlowResource>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString,
  folderId: parseAsString,
  active: parseAsBoolean,
})

export type ListFlowsSearchParams = Awaited<
  ReturnType<typeof listFlowsSearchParams.parse>
> & {
  chatbotId: string
}

export const listFlowsRequest = basePaginationRequest.extend({
  name: z.string().nullish(),
  folderId: z.string().nullish(),
  active: z.boolean().nullish(),
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
  chatbotId: string
}
