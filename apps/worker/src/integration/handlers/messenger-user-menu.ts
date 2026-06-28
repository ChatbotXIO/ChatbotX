import { contactInboxService } from "@chatbotx.io/business"
import {
  buildBrandingUrl,
  moveBrandingMenuLast,
} from "@chatbotx.io/business/branding"
import type {
  MessengerPersistentMenu,
  MessengerPersona,
} from "@chatbotx.io/database/partials"
import { findUserPersistentMenuById } from "@chatbotx.io/database/repositories"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type {
  DisableMessengerComposerStepSchema,
  EnableMessengerComposerStepSchema,
  SetMessengerPersonaStepSchema,
  SetMessengerUserPersistentMenuStepSchema,
} from "@chatbotx.io/flow-config"
import {
  findRegisteredPersona,
  messengerMenusToCallToActions,
} from "@chatbotx.io/integration-messenger"
import type { FacebookButton } from "@chatbotx.io/integration-messenger/schema"
import type { UserCustomSettings } from "@chatbotx.io/sdk"
import { env } from "../../env"
import { logger } from "../../lib/logger"
import { resolveIntegrationContextFromContactInbox } from "../../services/integrations"
import type { ExecuteStepProps } from "./flow-utils"

type ResolvedIntegrationContext = Awaited<
  ReturnType<typeof resolveIntegrationContextFromContactInbox>
>

type ResolvedMessengerUserContext = ResolvedIntegrationContext & {
  psid: string
  contactInbox: ContactInboxModel
}

/**
 * Resolve the Messenger contact-inbox (PSID) for the conversation and the
 * integration context needed to call the Facebook APIs. Returns `null` when the
 * contact has no Messenger inbox or the inbox has no source PSID.
 */
async function resolveMessengerUserContext(
  props: Pick<ExecuteStepProps<unknown>, "conversation" | "contactInbox">,
): Promise<ResolvedMessengerUserContext | null> {
  const { conversation, contactInbox: baseContactInbox } = props

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
    return null
  }

  const psid = contactInbox.sourceId
  if (!psid) {
    return null
  }

  const resolved = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  return { ...resolved, psid, contactInbox }
}

/**
 * Build the workspace's page-level persistent menu as Facebook call-to-actions,
 * keeping the self-promotion branding entry last (matching how the page-level
 * persistent menu is ordered when sent via the integration settings).
 */
function buildWorkspaceCallToActions(
  context: ResolvedMessengerUserContext,
): FacebookButton[] {
  const { ctx, integrationRow } = context
  const menus =
    (integrationRow.persistentMenus as MessengerPersistentMenu[]) ?? []
  if (menus.length === 0) {
    return []
  }

  const brandingUrl = buildBrandingUrl(
    ctx.platform.appUrl,
    "messenger",
    env.NEXT_PUBLIC_EDITION === "community",
  )
  return messengerMenusToCallToActions(moveBrandingMenuLast(menus, brandingUrl))
}

/**
 * Write the user-level persistent menu via `me/custom_user_settings`, resolving
 * the composer state and call-to-actions from the current settings when not
 * provided explicitly.
 *
 * - `composerInputDisabled` undefined → preserve the current user-level value
 *   (defaulting to `false` when there is no user-level menu yet).
 * - `callToActions` undefined → fall back to the current user-level menu, then
 *   the page-level menu, then the workspace-configured page persistent menu.
 * - Facebook rejects `composer_input_disabled: true` without `call_to_actions`,
 *   so when disabling with no menu available we skip and log a warning.
 * - When the composer is enabled and there are no menu items, the user's custom
 *   menu is cleared so they fall back to the page-level menu.
 */
async function applyUserComposerAndMenu(args: {
  context: ResolvedMessengerUserContext
  callToActions?: FacebookButton[]
  composerInputDisabled?: boolean
}): Promise<void> {
  const { context, callToActions, composerInputDisabled } = args
  const { integration, ctx, psid } = context

  const current = (await integration.runChannelHandler(
    "contact",
    "getUserCustomSettings",
    { ctx, data: { psid } },
  )) as UserCustomSettings | undefined

  const composer =
    composerInputDisabled ??
    current?.userLevel?.composer_input_disabled ??
    false

  const callToActionsToApply =
    callToActions ??
    current?.userLevel?.call_to_actions ??
    current?.pageLevel?.call_to_actions ??
    buildWorkspaceCallToActions(context)

  const hasCallToActions = callToActionsToApply.length > 0

  if (composer && !hasCallToActions) {
    logger.warn(
      { psid },
      "Skipping disable Messenger composer: no persistent menu items available",
    )
    return
  }

  if (!(composer || hasCallToActions)) {
    // No composer lock and no menu items → clear the user's custom menu.
    await integration.runChannelHandler("contact", "deleteUserPersistentMenu", {
      ctx,
      data: { psid },
    })
    return
  }

  await integration.runChannelHandler("contact", "setUserPersistentMenu", {
    ctx,
    data: {
      psid,
      persistentMenu: [
        {
          locale: "default",
          composer_input_disabled: composer,
          call_to_actions: callToActionsToApply,
        },
      ],
    },
  })
}

/**
 * Set (or clear) the Messenger persistent menu for a single user (PSID).
 *
 * - When `step.userPersistentMenuId` is empty/undefined, the page-level
 *   persistent menu (`IntegrationMessenger.persistentMenus`) is used.
 * - Otherwise the saved `UserPersistentMenu` with that id is used.
 * - The current composer state is preserved (the menu write never forces the
 *   composer back on).
 */
export async function setMessengerUserPersistentMenu(
  props: ExecuteStepProps<SetMessengerUserPersistentMenuStepSchema>,
) {
  const { conversation, step } = props

  const context = await resolveMessengerUserContext(props)
  if (!context) {
    return
  }

  let menus: MessengerPersistentMenu[]
  if (step.userPersistentMenuId) {
    const userMenu = await findUserPersistentMenuById({
      id: step.userPersistentMenuId,
      workspaceId: conversation.workspaceId,
    })
    menus = userMenu?.menus ?? []
  } else {
    menus =
      (context.integrationRow.persistentMenus as MessengerPersistentMenu[]) ??
      []
  }

  // Keep the self-promotion branding entry last, matching how the page-level
  // persistent menu is ordered when sent via the integration settings.
  const brandingUrl = buildBrandingUrl(
    context.ctx.platform.appUrl,
    "messenger",
    env.NEXT_PUBLIC_EDITION === "community",
  )
  const callToActions =
    menus.length === 0
      ? []
      : messengerMenusToCallToActions(moveBrandingMenuLast(menus, brandingUrl))

  await applyUserComposerAndMenu({ context, callToActions })
}

/**
 * Enable the Messenger composer (free-text input) for a single user (PSID),
 * preserving any existing user-level persistent menu items.
 */
export async function enableMessengerComposer(
  props: ExecuteStepProps<EnableMessengerComposerStepSchema>,
) {
  const context = await resolveMessengerUserContext(props)
  if (!context) {
    return
  }

  await applyUserComposerAndMenu({ context, composerInputDisabled: false })
}

/**
 * Disable the Messenger composer (free-text input) for a single user (PSID).
 * Facebook requires `call_to_actions` when the composer is disabled, so the
 * menu items are sourced from the current user-level menu, then the page-level
 * menu, then the workspace-configured page persistent menu.
 */
export async function disableMessengerComposer(
  props: ExecuteStepProps<DisableMessengerComposerStepSchema>,
) {
  const context = await resolveMessengerUserContext(props)
  if (!context) {
    return
  }

  await applyUserComposerAndMenu({ context, composerInputDisabled: true })
}

/**
 * Set (or clear) the Messenger persona for a single contact connection.
 *
 * - Empty `step.personaId` clears the contact's persona (falls back to the
 *   page default persona at send time).
 * - Otherwise the persona is stored only when it belongs to this contact's page
 *   and is registered with Facebook (has a `facebookPersonaId`). A persona from
 *   a different page is skipped (no-op) and the flow continues.
 *
 * The stored value is the persona's stable local id; the Messenger send path
 * resolves it to the page's current Facebook persona id.
 */
export async function setMessengerPersona(
  props: ExecuteStepProps<SetMessengerPersonaStepSchema>,
) {
  const { conversation, step } = props

  const context = await resolveMessengerUserContext(props)
  if (!context) {
    return
  }

  const { contactInbox, integrationRow } = context

  const persona = step.personaId
    ? findRegisteredPersona(
        integrationRow.personas as MessengerPersona[] | undefined,
        step.personaId,
      )
    : undefined

  // A configured persona that can't be resolved on this contact's page (e.g. a
  // cross-page selection or a since-deleted persona) must not silently leave a
  // stale persona in place. Reset to the page default and surface why, so the
  // step's effect is observable instead of a confusing no-op.
  if (step.personaId && !persona) {
    logger.warn(
      `Set Persona: persona ${step.personaId} is not available on this page; resetting contact ${conversation.contactId} to the page default`,
    )
  }

  await contactInboxService.setPersona({
    contactInboxId: contactInbox.id,
    contactId: conversation.contactId,
    personaId: persona?.id ?? null,
  })
}
