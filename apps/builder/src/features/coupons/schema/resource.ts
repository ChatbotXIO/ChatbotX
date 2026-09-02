import {
  couponIssueStatuses,
  couponTopicStatuses,
  couponUsageStatuses,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

export const couponTopicResource = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  expiresAt: z.date().nullable(),
  status: couponTopicStatuses,
  deletedAt: z.date().nullable(),
  hasEverHadCoupon: z.boolean(),
  createdById: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  couponCount: z.number().optional(),
})

export const couponResource = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topicId: z.string(),
  topicName: z.string(),
  code: z.string(),
  issuedContactId: z.string().nullable(),
  issuedAt: z.date().nullable(),
  usedAt: z.date().nullable(),
  issueStatus: couponIssueStatuses,
  usageStatus: couponUsageStatuses,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const couponTopicOptionResource = z.object({
  id: z.string(),
  name: z.string(),
  expiresAt: z.date().nullable(),
})

export const contactCouponResource = z.object({
  id: z.string(),
  topicId: z.string(),
  topicName: z.string(),
  code: z.string(),
  usedAt: z.date().nullable(),
  issuedAt: z.date().nullable(),
})

export const exportCouponCountResponse = z.object({
  count: z.number(),
})

export const exportCouponResponse = z.object({
  fileId: z.string(),
})

export const getCouponExportFileResponse = z.object({
  status: fileStatuses,
  fileName: z.string(),
  downloadUrl: z.string().nullable(),
  totalRecords: z.number().nullable(),
})

export const importCouponResponse = z.object({
  importId: z.string(),
})

export type CouponTopicResource = z.infer<typeof couponTopicResource>
export type CouponResource = z.infer<typeof couponResource>
