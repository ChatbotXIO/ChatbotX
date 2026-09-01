import {
  couponIssueStatuses,
  couponUsageStatuses,
} from "@chatbotx.io/database/partials"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import {
  contactCouponResource,
  couponResource,
  couponTopicOptionResource,
  couponTopicResource,
  type getCouponExportFileResponse,
} from "./resource"

export const listCouponTopicsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  search: parseAsString,
  sort: getSortingStateParser<{ name: string }>().withDefault([
    { id: "name", desc: false },
  ]),
}

export const listCouponTopicsSearchParamsCache = createSearchParamsCache(
  listCouponTopicsSearchParams,
)

export const listCouponsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  topicId: parseAsString,
  issueStatus: parseAsString,
  usageStatus: parseAsString,
  search: parseAsString,
}

export const listCouponsSearchParamsCache = createSearchParamsCache(
  listCouponsSearchParams,
)

export const listCouponTopicsRequest = withWorkspaceIdSchema.and(
  z.object({
    archived: z.boolean().optional(),
    search: z.string().optional().nullable(),
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().optional(),
    sort: z.array(z.object({ id: z.string(), desc: z.boolean() })).optional(),
  }),
)

export const listCouponTopicsResponse = z.object({
  data: z.array(couponTopicResource.extend({ couponCount: z.number() })),
  pageCount: z.number(),
  total: z.number(),
})

export const listCouponsRequest = withWorkspaceIdSchema.and(
  z.object({
    topicId: zodBigintAsString().optional().nullable(),
    issueStatus: couponIssueStatuses.optional().nullable(),
    usageStatus: couponUsageStatuses.optional().nullable(),
    search: z.string().optional().nullable(),
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().optional(),
  }),
)

export const listCouponsResponse = z.object({
  data: z.array(couponResource),
  pageCount: z.number(),
  total: z.number(),
})

export const listCouponTopicOptionsRequest = withWorkspaceIdSchema.and(
  z.object({
    keyword: z.string().optional(),
    issueableOnly: z.boolean().optional(),
  }),
)

export const listCouponTopicOptionsResponse = z.array(couponTopicOptionResource)

export const exportCouponCountRequest = listCouponsRequest

export const getCouponExportFileRequest = withWorkspaceIdSchema.and(
  z.object({
    fileId: zodBigintAsString(),
  }),
)

export const listContactCouponsRequest = withWorkspaceIdSchema.and(
  z.object({
    contactId: zodBigintAsString(),
  }),
)

export const listContactCouponsResponse = z.array(contactCouponResource)

export type ListCouponTopicsRequest = z.infer<typeof listCouponTopicsRequest>
export type ListCouponsRequest = z.infer<typeof listCouponsRequest>
export type GetCouponExportFileRequest = z.infer<
  typeof getCouponExportFileRequest
>
export type GetCouponExportFileResponse = z.infer<
  typeof getCouponExportFileResponse
>
