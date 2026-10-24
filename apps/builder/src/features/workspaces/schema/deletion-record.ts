import {
  workspaceDeletionRecordDetailsSchema,
  workspaceDeletionRecordUsageSnapshotSchema,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const workspaceDeletionRecordResource = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  ownerId: z.string(),
  ownerEmail: z.string().nullable(),
  tenantId: z.string(),
  deletionRequestedById: z.string().nullable(),
  deletionRequestedByEmail: z.string().nullable(),
  deletionRequestedAt: z.date().nullable(),
  scheduledDeletionAt: z.date().nullable(),
  purgedAt: z.date().nullable(),
  details: workspaceDeletionRecordDetailsSchema,
  usageSnapshot: workspaceDeletionRecordUsageSnapshotSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type WorkspaceDeletionRecordResource = z.infer<
  typeof workspaceDeletionRecordResource
>
