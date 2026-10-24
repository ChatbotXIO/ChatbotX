import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { z } from "zod"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"

const periodUsageSchema = z.object({
  count: z.number().int(),
  periodEnd: z.date(),
  periodStart: z.date(),
})
const quotaSnapshotSchema = z.object({
  botMessagesUsed: z.number().int(),
  macUsed: z.number().int(),
  monthlyBotMessagesUsed: z.number().int(),
  periodEnd: z.date().nullable(),
  periodStart: z.date().nullable(),
  planName: z.string().nullable(),
  planStatus: z.string().nullable(),
})

export const workspaceDeletionRecordUsageSnapshotSchema = z.object({
  botMessages: z.array(periodUsageSchema),
  channels: z.number().int().nonnegative(),
  contacts: z.number().int().nonnegative(),
  mac: z.array(periodUsageSchema),
  ownerQuota: quotaSnapshotSchema.nullable(),
  teamMembers: z.number().int().nonnegative(),
})
export type WorkspaceDeletionRecordUsageSnapshot = z.infer<
  typeof workspaceDeletionRecordUsageSnapshotSchema
>

export const workspaceDeletionRecordDetailsSchema = z.object({
  channels: z.array(
    z.object({
      channel: z.string(),
      id: z.string(),
      name: z.string(),
      status: z.string(),
    }),
  ),
  members: z.array(
    z.object({
      email: z.string().nullable(),
      name: z.string().nullable(),
      role: z.string(),
      userId: z.string(),
    }),
  ),
  owner: z.object({
    email: z.string().nullable(),
    id: z.string(),
    name: z.string().nullable(),
    tenantId: z.string().nullable(),
  }),
  plan: z
    .object({
      periodEnd: z.date().nullable(),
      periodStart: z.date().nullable(),
      planName: z.string().nullable(),
      planStatus: z.string().nullable(),
    })
    .nullable(),
  requestedBy: z
    .object({
      email: z.string().nullable(),
      id: z.string().nullable(),
      name: z.string().nullable(),
      via: z.literal("ui"),
    })
    .nullable(),
  workspace: z.object({
    createdAt: z.date(),
    id: z.string(),
    language: z.string(),
    logo: z.string().nullable(),
    name: z.string(),
    timezone: z.string(),
  }),
})
export type WorkspaceDeletionRecordDetails = z.infer<
  typeof workspaceDeletionRecordDetailsSchema
>
/**
 * Immutable purge-time evidence. Deliberately has no foreign keys: it must
 * survive deletion of both the workspace and any referenced user.
 */
export const workspaceDeletionRecordModel = pgTable(
  "WorkspaceDeletionRecord",
  {
    ...sharedColumns,
    workspaceId: bigintAsString().notNull(),
    workspaceName: text().notNull(),
    ownerId: bigintAsString().notNull(),
    ownerEmail: text(),
    tenantId: bigintAsString().notNull(),
    deletionRequestedById: bigintAsString(),
    deletionRequestedByEmail: text(),
    deletionRequestedAt: timestamp(timestampConfig),
    scheduledDeletionAt: timestamp(timestampConfig),
    purgedAt: timestamp(timestampConfig),
    usageSnapshot: jsonb()
      .$type<WorkspaceDeletionRecordUsageSnapshot>()
      .notNull(),
    details: jsonb().$type<WorkspaceDeletionRecordDetails>().notNull(),
  },
  (table) => [
    unique("WorkspaceDeletionRecord_workspaceId_key").on(table.workspaceId),
    index("WorkspaceDeletionRecord_workspaceName_idx").on(table.workspaceName),
    index("WorkspaceDeletionRecord_ownerEmail_idx").on(table.ownerEmail),
    index("WorkspaceDeletionRecord_deletionRequestedByEmail_idx").on(
      table.deletionRequestedByEmail,
    ),
  ],
)
