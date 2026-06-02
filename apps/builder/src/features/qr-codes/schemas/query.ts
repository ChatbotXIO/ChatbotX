import type { ReflinkModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { flowResource } from "@/features/flows/schemas/resource"
import { qrCodeResource } from "./resource"

export const listQrCodesSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  sort: getSortingStateParser<ReflinkModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listQrCodesSearchParamsCache = createSearchParamsCache(
  listQrCodesSearchParams,
)

export type ListQrCodesRequest = Awaited<
  ReturnType<typeof listQrCodesSearchParamsCache.parse>
> & { workspaceId: string }

export const listQrCodeItem = qrCodeResource.and(
  z.object({
    flow: flowResource,
  }),
)
export type ListQrCodeItem = z.infer<typeof listQrCodeItem>

export const listQrCodesResponse = z.object({
  data: z.array(listQrCodeItem),
  pageCount: z.number(),
})
export type ListQrCodesResponse = z.infer<typeof listQrCodesResponse>
