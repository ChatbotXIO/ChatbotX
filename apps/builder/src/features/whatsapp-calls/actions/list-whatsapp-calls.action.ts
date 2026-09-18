"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { callHistoryActionClient } from "@/lib/safe-action"
import { listWhatsappCalls } from "../queries/list-whatsapp-calls.query"
import { CALL_ACTIVITY_CHIPS } from "../schema/query"

const listWhatsappCallsSchema = z.object({
  activity: z.enum(CALL_ACTIVITY_CHIPS).optional(),
  inboxId: zodBigintAsString().optional(),
  agentUserId: zodBigintAsString().optional(),
  cursor: z.string().optional(),
})

/**
 * P5 item 6 — backs the Calls page's "Load more" button (subsequent pages
 * only; the first page renders server-side in `page.tsx` via the same
 * `listWhatsappCalls` query adapter). Gated by `callHistoryActionClient`
 * (plan D4 page access: `hasContactsAccess || analytics`) — a read action,
 * so it keeps working for an expired/blocked workspace and a support
 * session (D8).
 */
export const listWhatsappCallsAction = callHistoryActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(listWhatsappCallsSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx, parsedInput }) =>
    listWhatsappCalls(
      { workspaceId, ...parsedInput },
      { userId: ctx.user.id, permissions: ctx.workspaceMemberPermissions },
    ),
  )
