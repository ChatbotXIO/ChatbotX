"use server"

import { connectionService } from "@chatbotx.io/connections"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/**
 * Generic disconnect for the unified `Connection` domain — the successor to
 * the per-channel/per-provider `disconnect*.action.ts` files (messenger,
 * whatsapp, active-campaign, …), on the same `workspaceActionClientAllowExpired`
 * client so disconnect stays available once a workspace's trial has expired.
 *
 * Scope note: the ~24 existing per-provider disconnect actions are NOT
 * converted to thin wrappers around this action. Several carry bespoke
 * side effects this generic path deliberately does not replicate — the
 * messenger/instagram shared-Facebook-page `general_info` preservation,
 * WhatsApp's coexist/staging cleanup, per-provider audit-log strings, and
 * `afterDisconnect` cache-invalidation hooks (e.g. the AI providers). Folding
 * those into `ConnectionService.disconnect` without a live database to
 * verify each one against would risk a silent regression in a
 * quota/billing-critical path. They continue to call their own service's
 * `disconnect` directly; this action is for new `Connection`-based UI only.
 */
export const disconnectConnectionAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await connectionService.disconnect({ connectionId: id, workspaceId })
  })
