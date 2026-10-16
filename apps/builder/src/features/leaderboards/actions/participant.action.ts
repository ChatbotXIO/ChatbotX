"use server"

import { leaderboardParticipantService } from "@chatbotx.io/business/leaderboard"
import { workspaceIdrequestParams } from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import {
  listLeaderboardAuditLogRequest,
  participantHistoryRequest,
  setParticipantBannedRequest,
} from "../lib/action-schemas"
import {
  adjustLeaderboardScoreRequest,
  leaderboardReasonRequest,
} from "../schema/action"

/** Manual +/- points; the reason is mandatory and lands in the audit log. */
export const adjustParticipantScoreAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(adjustLeaderboardScoreRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) =>
      await leaderboardParticipantService.adjust({
        workspaceId,
        leaderboardId: parsedInput.id,
        contactId: parsedInput.contactId,
        delta: parsedInput.delta,
        reason: parsedInput.reason,
        actorUserId: ctx.user.id,
      }),
  )

export const setParticipantBannedAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(setParticipantBannedRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    await leaderboardParticipantService.setBanned({
      workspaceId,
      leaderboardId: parsedInput.id,
      contactId: parsedInput.contactId,
      isBanned: parsedInput.isBanned,
      reason: parsedInput.reason,
      actorUserId: ctx.user.id,
    })
    return { ok: true as const }
  })

export const resetParticipantScoreAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(leaderboardReasonRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) =>
      await leaderboardParticipantService.resetOne({
        workspaceId,
        leaderboardId: parsedInput.id,
        contactId: parsedInput.contactId,
        reason: parsedInput.reason,
        actorUserId: ctx.user.id,
      }),
  )

// Reads stay available after trial expiry (read/delete-only workspaces).
export const getParticipantHistoryAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(participantHistoryRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await leaderboardParticipantService.history({
        workspaceId,
        leaderboardId: parsedInput.id,
        contactId: parsedInput.contactId,
      }),
  )

export const listLeaderboardAuditLogAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(listLeaderboardAuditLogRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await leaderboardParticipantService.auditLog({
        workspaceId,
        leaderboardId: parsedInput.id,
        page: parsedInput.page,
        perPage: 20,
      }),
  )
