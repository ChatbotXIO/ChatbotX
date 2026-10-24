import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  HEAVY_WORKSPACE_TABLES,
  NO_FK_WORKSPACE_TABLES,
  PARTITIONED_WORKSPACE_TABLES,
  WORKSPACE_ANALYTICS_HYPERTABLES,
} from "../src/repositories/workspace-purge"

type SnapshotEntry = {
  columns?: Array<string | { value: string }>
  entityType: string
  name: string
  onDelete?: string
  table?: string
  tableTo?: string
}

type Snapshot = { ddl: SnapshotEntry[] }

const MIGRATION_DIRECTORY = /^\d+_/

const drizzleDirectory = join(import.meta.dirname, "../drizzle")
const snapshotPath = join(
  drizzleDirectory,
  readdirSync(drizzleDirectory)
    .filter((entry) => MIGRATION_DIRECTORY.test(entry))
    .sort()
    .at(-1) ?? "",
  "snapshot.json",
)
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot
const entriesByType = (entityType: string) =>
  snapshot.ddl.filter((entry) => entry.entityType === entityType)
const key = (table: string, columns: readonly string[]) =>
  `${table}:${columns.join(",")}`
const indexColumns = (entry: SnapshotEntry) =>
  (entry.columns ?? []).map((column) =>
    typeof column === "string" ? column : column.value,
  )
const hasPrefix = (candidate: readonly string[], expected: readonly string[]) =>
  candidate.length >= expected.length &&
  expected.every((column, index) => candidate[index] === column)

const LEGACY_UNINDEXED_FKS = [
  "AdsConversionEvent:integrationWhatsappId",
  "AdsConversionEvent:integrationMessengerId",
  "AdsConversionEvent:integrationInstagramId",
  "AdsConversionRule:integrationWhatsappId",
  "AdsConversionRule:integrationFacebookAdsId",
  "AdsConversionRule:integrationMessengerId",
  "AdsConversionRule:integrationInstagramId",
  "AIFunction:triggerFlowId",
  "AIFunction:workspaceId",
  "AIMCPServer:workspaceId",
  "Appointment:conversationId",
  "Appointment:contactInboxId",
  "AppointmentCalendar:confirmationFlowId",
  "AppointmentCalendar:cancellationFlowId",
  "AppointmentCalendar:externalConnectionId",
  "AppointmentCalendarReminder:flowId",
  "AppointmentReminderDispatch:workspaceId",
  "AppointmentReminderDispatch:reminderConfigId",
  "Account:userId",
  "Account:tenantId",
  "Invitation:workspaceId",
  "Invitation:invitedBy",
  "Session:userId",
  "AutomatedResponse:folderId",
  "AutomatedResponse:flowId",
  "BotField:folderId",
  "Broadcast:integrationWhatsappId",
  "Broadcast:integrationMessengerId",
  "CoexistSyncRun:requestedByUserId",
  "ConnectSession:targetConnectionId",
  "ConnectSession:actorUserId",
  "ConnectSession:actorTokenId",
  "Connection:createdBy",
  "ContactNote:createdById",
  "Conversation:assignedUserId",
  "Conversation:assignedInboxTeamId",
  "ConversationParticipant:userId",
  "Coupon:topicId",
  "CouponTopic:createdById",
  "CustomField:folderId",
  "DynamicImage:customFieldId",
  "AuditLog:userId",
  "File:userId",
  "Flow:folderId",
  "GoogleAdsConversionEvent:integrationGoogleAdsId",
  "Import:userId",
  "InboxTeamMember:inboxTeamId",
  "InboxTeamMember:userId",
  "IntegrationGoogleCalendar:workspaceId",
  "IntegrationGoogleSheet:workspaceId",
  "IntegrationOpenai:aiAgentId",
  "IntegrationOutlookCalendar:workspaceId",
  "Leaderboard:referralWelcomeFlowId",
  "LeaderboardAuditLog:contactId",
  "LeaderboardAuditLog:actorUserId",
  "MagicLinkStat:linkId",
  "MessagingAdOperation:createdBy",
  "MetaCatalogSyncRun:integrationMetaCatalogId",
  "MetaCatalogSyncRun:categoryId",
  "MiniAppPublication:integrationWhatsappId",
  "MiniAppPublication:whatsappFlowId",
  "MiniAppSubmission:workspaceId",
  "MiniAppUpload:workspaceId",
  "DiscountCodeRedemption:workspaceId",
  "OrderItem:productId",
  "OrderItem:vendorId",
  "Questionnaire:triggerFlowId",
  "RefLinkStat:linkId",
  "Reflink:flowId",
  "Reflink:customFieldId",
  "Reflink:widgetLogoFileId",
  "Template:createdBy",
  "TemplateInstallation:installFolderId",
  "TemplateInstallation:installedBy",
  "UserDeviceToken:workspaceId",
  "WhatsappCall:answeredByUserId",
  "WhatsappCall:initiatedByUserId",
  "WhatsappSignupSession:ownerId",
  "WhatsappSignupSession:workspaceId",
  "WorkingHoursDateOverride:workingHoursId,workspaceId",
  "WorkingHoursMember:userId",
  "WorkingHoursMember:workingHoursId,workspaceId",
  "Workspace:ownerId",
  "WorkspaceMember:userId",
]

describe("workspace purge coverage", () => {
  test("registers every workspace-scoped table outside the Workspace cascade", () => {
    const foreignKeys = entriesByType("fks")
    const cascadeReachable = new Set(["Workspace"])
    for (let changed = true; changed; ) {
      changed = false
      for (const foreignKey of foreignKeys) {
        if (
          foreignKey.onDelete === "CASCADE" &&
          foreignKey.table &&
          foreignKey.tableTo &&
          cascadeReachable.has(foreignKey.tableTo) &&
          !cascadeReachable.has(foreignKey.table)
        ) {
          cascadeReachable.add(foreignKey.table)
          changed = true
        }
      }
    }

    const registered = new Set([
      ...HEAVY_WORKSPACE_TABLES,
      ...PARTITIONED_WORKSPACE_TABLES.map(({ table }) => table),
      ...WORKSPACE_ANALYTICS_HYPERTABLES,
      ...NO_FK_WORKSPACE_TABLES.map(({ table }) => table),
    ])
    const workspaceTables = new Set(
      entriesByType("columns")
        .filter((column) => column.name === "workspaceId" && column.table)
        .map((column) => column.table as string),
    )
    const missing = [...workspaceTables]
      .filter(
        (table) => !(cascadeReachable.has(table) || registered.has(table)),
      )
      .sort()

    expect(
      missing,
      "Add the table to workspace-purge/tables.ts and follow the workspace-purge skill.",
    ).toEqual([])
  })

  test("does not add an unindexed foreign key or retain a fixed baseline entry", () => {
    const support = [
      ...entriesByType("indexes"),
      ...entriesByType("pks"),
      ...entriesByType("uniques"),
    ]
    const uncovered = entriesByType("fks")
      .filter((foreignKey) => {
        const columns = foreignKey.columns ?? []
        return !support.some(
          (entry) =>
            entry.table === foreignKey.table &&
            hasPrefix(indexColumns(entry), columns),
        )
      })
      .map((foreignKey) =>
        key(foreignKey.table ?? "", foreignKey.columns ?? []),
      )
      .sort()
    const unexpected = uncovered.filter(
      (foreignKey) => !LEGACY_UNINDEXED_FKS.includes(foreignKey),
    )
    const fixedBaseline = LEGACY_UNINDEXED_FKS.filter(
      (foreignKey) => !uncovered.includes(foreignKey),
    ).sort()

    expect(
      unexpected,
      "Add a leading FK index before adding a new foreign key.",
    ).toEqual([])
    expect(
      fixedBaseline,
      "Remove fixed FKs from LEGACY_UNINDEXED_FKS.",
    ).toEqual([])
  })
})
