import {
  couponIssueStatuses,
  couponUsageStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import type { exportCouponResponse, importCouponResponse } from "./resource"

const optionalDescription = z.string().trim().max(1000).optional().nullable()

export const createCouponTopicRequest = withWorkspaceIdSchema.and(
  z.object({
    name: z.string().trim().min(1).max(255),
    description: optionalDescription,
    expiresAt: z.coerce.date().optional().nullable(),
  }),
)

export const updateCouponTopicRequest = createCouponTopicRequest.and(
  z.object({
    topicId: zodBigintAsString(),
  }),
)

export const topicIdRequest = withWorkspaceIdSchema.and(
  z.object({
    topicId: zodBigintAsString(),
  }),
)

export const importCouponRequest = z.object({
  topicId: zodBigintAsString(),
  fileId: zodBigintAsString(),
})

export const exportCouponRequest = z.object({
  topicId: zodBigintAsString().optional().nullable(),
  issueStatus: couponIssueStatuses.optional().nullable(),
  usageStatus: couponUsageStatuses.optional().nullable(),
  search: z.string().optional().nullable(),
})

export type CreateCouponTopicRequest = z.infer<typeof createCouponTopicRequest>
export type UpdateCouponTopicRequest = z.infer<typeof updateCouponTopicRequest>
export type ImportCouponRequest = z.infer<typeof importCouponRequest>
export type ImportCouponResponse = z.infer<typeof importCouponResponse>
export type ExportCouponRequest = z.infer<typeof exportCouponRequest>
export type ExportCouponResponse = z.infer<typeof exportCouponResponse>
