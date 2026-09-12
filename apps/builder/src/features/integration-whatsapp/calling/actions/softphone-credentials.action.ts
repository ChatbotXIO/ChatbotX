"use server"

import {
  pinWorkspaceToNode,
  softphoneCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { env } from "@/env"
import { resolveFreeswitchNodes } from "@/lib/freeswitch/nodes"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Mints/rotates the current user's softphone SIP credential for this
 * workspace: the same node the workspace is pinned to (so the
 * browser's one `SimpleUser` registers where the workspace's WhatsApp
 * numbers actually bridge agent legs), plus a short-lived TURN credential.
 * Never logged — the caller (`use-sip-user.ts`) holds this only in memory.
 *
 * No `.inputSchema()` (bind args only) — callers invoke `execute()`/call
 * the action with no trailing input argument.
 */
export const getSoftphoneCredentialsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx }) => {
    const t = await getTranslations()
    if (!env.TURN_STATIC_SECRET) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.inAppCallingUnavailable"),
      )
    }

    const nodes = resolveFreeswitchNodes()
    const nodeIds = Object.keys(nodes)
    const { nodeId } = await pinWorkspaceToNode({ workspaceId, nodeIds })

    const credentials = await softphoneCredentialService.issueCredentials({
      workspaceId,
      userId: ctx.user.id,
      nodes,
      nodeId,
      turnStaticSecret: env.TURN_STATIC_SECRET,
    })

    return credentials
  })
