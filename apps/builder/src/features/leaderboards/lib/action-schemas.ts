import { z } from "zod"
import {
  leaderboardConfigRequest,
  leaderboardContactInput,
  leaderboardIdInput,
  leaderboardReasonRequest,
} from "../schema/action"

/** Builder create/update payload: the shared config plus "publish right away". */
export const saveLeaderboardRequest = leaderboardConfigRequest.extend({
  publish: z.boolean().default(false),
})

export const changeLeaderboardStatusRequest = z.object({
  action: z.enum(["publish", "pause", "start", "finish"]),
})
export type LeaderboardStatusChange = z.infer<
  typeof changeLeaderboardStatusRequest
>["action"]

export const resetLeaderboardPointsActionRequest = z.object({
  reason: z.string().trim().max(500).default(""),
})

export const getLeaderboardExportRequest = z.object({
  fileId: z.string().min(1),
})

export const setParticipantBannedRequest = leaderboardReasonRequest.extend({
  isBanned: z.boolean(),
})

export const listLeaderboardAuditLogRequest = leaderboardIdInput.extend({
  page: z.int().min(1).default(1),
})

export const participantHistoryRequest = leaderboardContactInput

export const listTelegramChatsRequest = z.object({
  inboxId: z.string().min(1),
})
