import { createSearchParamsCache } from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { planResource } from "./resource"

export const listPlansSearchParams = {}
export const listPlansSearchParamsCache = createSearchParamsCache(
  listPlansSearchParams,
)

export const listPlansRequest = basePaginationRequest
export type ListPlansRequest = z.infer<typeof listPlansRequest>

export const listPlansResponse = z.object({
  data: z.array(planResource),
  pageCount: z.number(),
})
export type ListPlansResponse = z.infer<typeof listPlansResponse>
