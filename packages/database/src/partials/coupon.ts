import { z } from "zod"

export const couponTopicStatuses = z.enum(["active", "archived"])
export type CouponTopicStatus = z.infer<typeof couponTopicStatuses>

export const couponIssueStatuses = z.enum(["published", "unpublished"])
export type CouponIssueStatus = z.infer<typeof couponIssueStatuses>

export const couponUsageStatuses = z.enum(["used", "notUsed"])
export type CouponUsageStatus = z.infer<typeof couponUsageStatuses>
