import {
  couponIssueStatuses,
  couponUsageStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { withPublicPaging } from "@/lib/public-api/list"
import {
  contactCouponResource,
  couponResource,
  couponTopicResource,
} from "./resource"

// Explicit allow-list, not the internal resource: every field picked here
// becomes a stable contract MCP agents depend on, so `createdById` (an internal
// member id) and `deletedAt` (soft-delete bookkeeping already surfaced through
// `status`) stay out. See products/schema/public.ts for the same pattern.
export const publicCouponTopicResource = couponTopicResource.pick({
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  expiresAt: true,
  status: true,
  hasEverHadCoupon: true,
  createdAt: true,
  updatedAt: true,
})

export const listCouponTopicsPublicRequest = basePaginationRequest.extend({
  archived: z
    .boolean()
    .optional()
    .describe(
      "Restrict to archived topics when true, active topics when false.",
    ),
  search: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against the topic's name."),
})

// `list` is the only topic route that joins the coupon count; the six
// single-topic routes return the bare row, so `couponCount` belongs here rather
// than on `publicCouponTopicResource` where it would be an optional field that
// is in practice never present.
export const listCouponTopicsPublicResponse = z.object({
  data: z.array(publicCouponTopicResource.extend({ couponCount: z.number() })),
  pageCount: z.number(),
})

export const createCouponTopicPublicRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Coupon topic name."),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .describe("Optional internal description of the topic."),
  expiresAt: z.coerce
    .date()
    .optional()
    .nullable()
    .describe(
      "When coupons from this topic stop being issueable/usable, or null for never.",
    ),
})

export const updateCouponTopicPublicRequest =
  createCouponTopicPublicRequest.extend({
    id: zodBigintAsString().describe(
      "Coupon topic id. Get it from `coupons.listTopics`.",
    ),
  })

export const listCouponsPublicRequest = basePaginationRequest.extend({
  topicId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to coupons from this topic. Get it from `coupons.listTopics`.",
    ),
  issueStatus: couponIssueStatuses
    .optional()
    .describe(
      "Legacy alias for `status`. Restrict to coupons by issue status.",
    ),
  usageStatus: couponUsageStatuses
    .optional()
    .describe("Legacy alias for `usage`. Restrict to coupons by usage status."),
  search: z
    .string()
    .optional()
    .describe(
      "Legacy alias for `keyword`. Case-insensitive coupon-code match.",
    ),
  status: couponIssueStatuses
    .optional()
    .describe("Restrict to coupons by issue status."),
  usage: couponUsageStatuses
    .optional()
    .describe("Restrict to coupons by usage status."),
  keyword: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against the coupon code."),
})

export const publicListCouponsRequest = withPublicPaging(
  listCouponsPublicRequest.omit({ sort: true }),
).superRefine((input, ctx) => {
  const aliases = [
    ["status", "issueStatus"],
    ["usage", "usageStatus"],
    ["keyword", "search"],
  ] as const

  for (const [canonical, legacy] of aliases) {
    if (input[canonical] !== undefined && input[legacy] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Use either \`${canonical}\` or legacy \`${legacy}\`, not both.`,
        path: [canonical],
      })
    }
  }
})

export const listCouponsPublicResponse = z.object({
  data: z.array(couponResource),
  pageCount: z.number(),
})

export const issueCouponPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Coupon topic id. Get it from `coupons.listTopics`.",
  ),
  contactId: zodBigintAsString().describe(
    "Contact id. Get it from `contacts.list`.",
  ),
})

export const markCouponUsedPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Coupon topic id. Get it from `coupons.listTopics`.",
  ),
  contactId: zodBigintAsString().describe(
    "Contact id. Get it from `contacts.list`.",
  ),
})

export const listContactCouponsPublicResponse = z.object({
  data: z.array(contactCouponResource),
})

export const bulkCreateCouponsPublicRequest = z.object({
  topicId: zodBigintAsString().describe(
    "Coupon topic id. Get it from `coupons.listTopics`.",
  ),
  codes: z
    .array(z.string().trim().min(1).max(255))
    .min(1)
    .max(10_000)
    .describe("Coupon codes to add to this topic."),
})

export const bulkCreateCouponsPublicResponse = z.object({
  processed: z.number(),
  created: z.number(),
  existing: z.number(),
  allowedRemaining: z.number(),
  currentCount: z.number(),
})

export const startCouponImportPublicRequest = z.object({
  topicId: zodBigintAsString().describe(
    "Coupon topic id. Get it from `coupons.listTopics`.",
  ),
  fileId: zodBigintAsString().describe(
    "CSV import file id. Create one with `coupons.createImportUploadUrl` or use an existing coupon import file in this workspace.",
  ),
})

export const startCouponImportPublicResponse = z.object({
  importId: z.string(),
})

export const createCouponImportUploadUrlPublicRequest = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((fileName) => fileName.toLowerCase().endsWith(".csv"), {
      message: "Coupon import files must use the .csv extension",
    })
    .describe("CSV file name. The server generates the storage path."),
  mimeType: z
    .literal("text/csv")
    .describe("Coupon imports accept only text/csv."),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .describe("CSV size in bytes, up to 10 MiB."),
})

export const createCouponImportUploadUrlPublicResponse = z.object({
  fileId: z.string(),
  uploadUrl: z.string().url(),
})

export const startCouponExportPublicRequest = z.object({
  topicId: zodBigintAsString()
    .optional()
    .describe("Optionally restrict the export to one coupon topic."),
  issueStatus: couponIssueStatuses
    .optional()
    .describe("Optionally restrict by issue status."),
  usageStatus: couponUsageStatuses
    .optional()
    .describe("Optionally restrict by usage status."),
  search: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("Optionally restrict to coupon codes matching this text."),
})

export const startCouponExportPublicResponse = z.object({
  fileId: z.string(),
})

export const getCouponExportPublicRequest = z.object({
  fileId: zodBigintAsString().describe(
    "Coupon export file id returned by `coupons.export`.",
  ),
})

export const getCouponExportPublicResponse = z.object({
  status: z.string(),
  fileName: z.string(),
  downloadUrl: z.string().url().nullable(),
  totalRecords: z.number(),
})

export const couponIssueErrorData = z.object({
  reason: z.enum(["topicUnavailable", "noAvailableCoupon"]),
})

export const couponMarkUsedErrorData = z.object({
  reason: z.enum(["noIssuedCoupon"]),
})

// `issueCoupon`/`markCouponUsed` return the bare coupon row (no joined
// `topicName`/derived status columns), unlike `couponResource` used for
// `listCoupons`.
export const publicIssuedCouponResource = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topicId: z.string(),
  code: z.string(),
  issuedContactId: z.string().nullable(),
  issuedAt: z.date().nullable(),
  usedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
