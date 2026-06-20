import { contactInboxService } from "@chatbotx.io/business"
import {
  buildBrandingUrl,
  moveBrandingMenuLast,
} from "@chatbotx.io/business/branding"
import type { MessengerPersistentMenu } from "@chatbotx.io/database/partials"
import { findUserPersistentMenuById } from "@chatbotx.io/database/repositories"
import type { SetMessengerUserPersistentMenuStepSchema } from "@chatbotx.io/flow-config"
import { messengerMenusToCallToActions } from "@chatbotx.io/integration-messenger"
import { env } from "../../env"
import { resolveIntegrationContextFromContactInbox } from "../../services/integrations"
import type { ExecuteStepProps } from "./flow-utils"

/**
 * Set (or clear) the Messenger persistent menu for a single user (PSID) via
 * Facebook's `me/custom_user_settings` endpoint.
 *
 * - When `step.userPersistentMenuId` is empty/undefined, the page-level
 *   persistent menu (`IntegrationMessenger.persistentMenus`) is used.
 * - Otherwise the saved `UserPersistentMenu` with that id is used.
 * - When the resolved menu has no items, the user's custom menu is cleared so
 *   they fall back to the page-level menu.
 */
export async function setMessengerUserPersistentMenu(
  props: ExecuteStepProps<SetMessengerUserPersistentMenuStepSchema>,
) {
  const { conversation, contactInbox: baseContactInbox, step } = props

  const contactInbox =
    baseContactInbox?.channel === "messenger"
      ? baseContactInbox
      : await contactInboxService
          .listByContactId({ contactId: conversation.contactId })
          .then(
            (inboxes) =>
              inboxes
                .filter((i) => i.channel === "messenger")
                .sort(
                  (a, b) =>
                    new Date(b.lastMessageAt ?? 0).getTime() -
                    new Date(a.lastMessageAt ?? 0).getTime(),
                )[0],
          )

  if (!contactInbox) {
    return
  }

  const psid = contactInbox.sourceId
  if (!psid) {
    return
  }

  const { integration, ctx, integrationRow } =
    await resolveIntegrationContextFromContactInbox({
      workspaceId: conversation.workspaceId,
      contactInbox,
    })

  let menus: MessengerPersistentMenu[]
  if (step.userPersistentMenuId) {
    const userMenu = await findUserPersistentMenuById({
      id: step.userPersistentMenuId,
      workspaceId: conversation.workspaceId,
    })
    menus = userMenu?.menus ?? []
  } else {
    menus = (integrationRow.persistentMenus as MessengerPersistentMenu[]) ?? []
  }

  if (menus.length === 0) {
    await integration.runChannelHandler("contact", "deleteUserPersistentMenu", {
      ctx,
      data: { psid },
    })
    return
  }

  // Keep the self-promotion branding entry last, matching how the page-level
  // persistent menu is ordered when sent via the integration settings.
  const brandingUrl = buildBrandingUrl(
    ctx.platform.appUrl,
    "messenger",
    env.NEXT_PUBLIC_EDITION === "community",
  )
  const callToActions = messengerMenusToCallToActions(
    moveBrandingMenuLast(menus, brandingUrl),
  )

  await integration.runChannelHandler("contact", "setUserPersistentMenu", {
    ctx,
    data: {
      psid,
      persistentMenu: [
        {
          locale: "default",
          composer_input_disabled: false,
          call_to_actions: callToActions,
        },
      ],
    },
  })
}
