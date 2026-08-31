import {
  applyContactProfile,
  buildContactProfileUpdate,
} from "@chatbotx.io/business"
import type { UpdateMessengerContactDataStepSchema } from "@chatbotx.io/flow-config"
import type { IncomingContact } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"
import { resolveMessengerUserContext } from "./messenger-context"

/**
 * Re-sync a Messenger contact's profile (name, avatar, locale, timezone,
 * gender) from Facebook, overwriting the contact's current values. Best-effort
 * and fire-and-forget: a contact with no Messenger inbox, an expired page
 * token, or a Graph error is a silent no-op so the flow always continues.
 *
 * Field mapping (`buildContactProfileUpdate`) and the write + managed-avatar
 * compensation (`applyContactProfile`) are shared with
 * `packages/business/src/contact/profile-refresh` — this step keeps its own
 * "overwrite even when a name already exists" semantics and does not go
 * through `contactProfileRefreshService.refresh`.
 */
export async function updateMessengerContactData(
  props: ExecuteStepProps<UpdateMessengerContactDataStepSchema>,
): Promise<void> {
  const { conversation } = props

  const context = await resolveMessengerUserContext(props)
  if (!context) {
    return
  }

  try {
    const profile = (await context.integration.runChannelHandler(
      "contact",
      "getProfile",
      { ctx: context.ctx, data: { sourceId: context.psid } },
    )) as IncomingContact | undefined

    if (!profile) {
      return
    }

    const update = buildContactProfileUpdate(profile)
    if (Object.keys(update).length === 0) {
      return
    }

    await applyContactProfile({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      update,
    })
  } catch (error) {
    logger.error(error, "updateMessengerContactData failed")
  }
}
