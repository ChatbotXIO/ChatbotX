import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { getDefaultAuditLogsRange } from "./query"

const defaultAuditLogsRange = getDefaultAuditLogsRange()

const auditLogUserPublicResource = z.object({
  id: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
})

export const auditLogPublicResource = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  action: z.string(),
  detail: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  source: z.string().nullable(),
  userId: z.string().nullable(),
  user: auditLogUserPublicResource.nullable(),
})

export const listAuditLogsPublicRequest = publicListRequest.extend({
  from: z.string().default(defaultAuditLogsRange.from),
  to: z.string().default(defaultAuditLogsRange.to),
  sort: z
    .array(
      z.object({
        id: z.string(),
        desc: z.boolean(),
      }),
    )
    .default([{ id: "createdAt", desc: true }]),
  keyword: z.string().optional(),
  userId: z.string().optional(),
})

export const listAuditLogsPublicResponse = publicListResponse(
  auditLogPublicResource,
)
