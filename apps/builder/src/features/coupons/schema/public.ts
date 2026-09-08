import {
  couponIssueStatuses,
  couponUsageStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { basePaginationRequest } from "@/lib/pagination"
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
  archived: z.boolean().optional(),
  search: z.string().optional(),
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
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
})

export const updateCouponTopicPublicRequest =
  createCouponTopicPublicRequest.extend({
    id: zodBigintAsString(),
  })

export const listCouponsPublicRequest = basePaginationRequest.extend({
  topicId: zodBigintAsString().optional(),
  issueStatus: couponIssueStatuses.optional(),
  usageStatus: couponUsageStatuses.optional(),
  search: z.string().optional(),
})

export const listCouponsPublicResponse = z.object({
  data: z.array(couponResource),
  pageCount: z.number(),
})

export const issueCouponPublicRequest = z.object({
  id: zodBigintAsString(),
  contactId: zodBigintAsString(),
})

export const markCouponUsedPublicRequest = z.object({
  id: zodBigintAsString(),
  contactId: zodBigintAsString(),
})

export const listContactCouponsPublicResponse = z.object({
  data: z.array(contactCouponResource),
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
