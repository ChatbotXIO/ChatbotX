"use server"

import {
  type CallPermissionStatus,
  canCallConversation,
  conversationService,
  whatsappCallPermissionService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getCallingSettings,
  type WhatsappCallingSettings,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { withCache } from "@chatbotx.io/redis"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { getWhatsappCallingPreflight } from "@/features/integration-whatsapp/calling/get-whatsapp-calling-preflight"
import { logger } from "@/lib/log"
import { callingActionClient } from "@/lib/safe-action"
import { callingSettingsCacheKey } from "../lib/calling-settings-cache"
import {
  readMetaCallPermissions,
  toCallPermissionStatus,
  toPermissionExpirationTimestamp,
} from "../lib/meta-call-permission"
import { BLOCKED_OUTBOUND_COUNTRIES } from "./blocked-outbound-countries"
import {
  type OutboundDialContactInbox,
  resolveContactInbox,
  resolveDialIdentity,
} from "./outbound-dial-target"

/**
 * Without a cache, getCallingSettings would fire once per conversation open,
 * needlessly hitting Meta's rate limit for something that rarely changes. 5
 * minutes is short enough not to leave a just-toggled setting stale for long.
 */
const CALLING_SETTINGS_CACHE_TTL_SECONDS = 5 * 60

/**
 * Cached wrapper around getCallingSettings. Cached only on success, so a
 * rejected/expired token is reflected on the very next call rather than waiting
 * out the TTL.
 */
async function getCachedCallingSettings(
  auth: WhatsappAuthValue,
  integrationId: string,
): Promise<WhatsappCallingSettings> {
  return await withCache(
    callingSettingsCacheKey(integrationId),
    () => getCallingSettings(auth),
    { ttl: CALLING_SETTINGS_CACHE_TTL_SECONDS },
  )
}

/**
 * Meta's answer for a contact the local mirror knows nothing about. undefined
 * on any failure or unmapped status, so an unreachable Meta leaves the control
 * where an empty mirror already put it - the dial itself reports what Meta
 * says rather than this resolve second-guessing it.
 */
async function resolveMetaPermissionStatus(props: {
  auth: WhatsappAuthValue
  workspaceId: string
  integrationId: string
  contactInbox: OutboundDialContactInbox
}): Promise<CallPermissionStatus | undefined> {
  const { permissionTarget } = resolveDialIdentity(props.contactInbox)
  const result = await readMetaCallPermissions({
    auth: props.auth,
    integrationId: props.integrationId,
    contactInboxId: props.contactInbox.id,
    target: permissionTarget,
  })
  if (!result.ok) {
    return
  }

  const status = toCallPermissionStatus(result.permissions)
  if (!status) {
    return
  }

  // Mirror a grant so this contact is answered locally from here on; otherwise
  // the record stays empty forever for a reply that will never be sent again,
  // and every open pays another Meta round trip. This is a read path, so a
  // failed write only costs the next read another lookup.
  try {
    await whatsappCallPermissionService.mirrorProviderGrant({
      workspaceId: props.workspaceId,
      contactInboxId: props.contactInbox.id,
      status,
      expirationTimestamp: toPermissionExpirationTimestamp(result.permissions),
    })
  } catch (error) {
    logger.warn(
      { err: error, contactInboxId: props.contactInbox.id },
      "Whatsapp calling: could not mirror the call permission Meta reported",
    )
  }

  return status
}

const resolveOutboundCallModeSchema = z.object({
  conversationId: zodBigintAsString(),
  /**
   * Pins resolution to a specific WhatsApp ContactInbox of this conversation's
   * contact rather than any WhatsApp inbox it has, ownership-checked the same
   * way an actual outbound dial checks it. A foreign id resolves to nothing;
   * omitted, falls back to any WhatsApp inbox the contact has.
   */
  contactInboxId: zodBigintAsString().optional(),
})

export type OutboundCallPermissionStatus = CallPermissionStatus

/**
 * Which outbound call control the thread should render for this conversation's
 * WhatsApp number, and why.
 */
export type NoneCallModeReason =
  | "ineligibleNumber"
  | "notWhatsappConversation"
  /**
   * Calling is off for this number — either the workspace hasn't enabled it or
   * Meta's calling.status isn't ENABLED. Both render the same settings-page
   * dialog.
   */
  | "callingNotEnabled"
  /**
   * The owning app is not subscribed to the calls webhook field, so call events
   * can never reach ChatbotX (Meta error 138018).
   */
  | "webhookNotSubscribed"
  /**
   * The stored token/credential was rejected by Meta when checking calling
   * eligibility.
   */
  | "tokenInvalid"
  /**
   * Access denial: canCallConversation returned false. Not distinguishable from
   * "no such conversation" by a probing caller, same non-disclosure as
   * assertCallAccessOrThrow's thrown error, returned as data instead so a
   * failed resolution doesn't leave the starter's isResolvingMode stuck.
   */
  | "callAccessDenied"

export type ResolveOutboundCallModeResult =
  | {
      mode: "voip"
      permissionStatus: OutboundCallPermissionStatus | undefined
      /**
       * True only for a manually-connected integration with no Meta App Secret
       * configured — the client shows a warning dialog rather than blocking the
       * call outright. Never true for a platform-credential integration.
       */
      unsignedWebhookWarning: boolean
      /**
       * True for every manually-connected integration regardless of app secret,
       * since neither ChatbotX nor this action can confirm the customer's own
       * Meta app is subscribed to the calls webhook field. Always false for a
       * platform-credential integration.
       */
      manualCallsSubscriptionUnverified: boolean
      /**
       * The integration backing this conversation's WhatsApp number — scopes
       * the client's manual-integration warning acknowledgement to it, so
       * switching numbers shows the warning again.
       */
      integrationId: string
    }
  | { mode: "none"; reason: NoneCallModeReason }
  | undefined

/**
 * Resolves whether a conversation's number should render the VoIP call control
 * or none, mirroring the outbound eligibility gate without touching Meta's
 * rate-limited call_permissions GET; permissionStatus is local-only and
 * undefined when no reply has been recorded.
 */
export const resolveOutboundCallModeAction = callingActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(resolveOutboundCallModeSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
      ctx,
    }): Promise<ResolveOutboundCallModeResult> => {
      const t = await getTranslations()

      const conversation = await conversationService.findBy({
        where: { id: parsedInput.conversationId, workspaceId },
      })
      if (!conversation) {
        throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
      }

      // Mirrors the outbound-dial gate: an assigned-only agent must not even
      // learn which call mode another agent's conversation would use. Uses non-
      // throwing canCallConversation and returns mode: none instead of
      // throwing, since a thrown error left the client's isResolvingMode stuck.
      const hasCallAccess = await canCallConversation({
        workspaceId,
        conversationId: conversation.id,
        userId: ctx.user.id,
      })
      if (!hasCallAccess) {
        return { mode: "none", reason: "callAccessDenied" }
      }

      // Reuses the same ownership-scoped lookup an actual outbound dial uses
      // rather than duplicating the check — a foreign id resolves to null, and
      // omitting contactInboxId falls through to any WhatsApp inbox this
      // contact has.
      const contactInbox = await resolveContactInbox({
        contactId: conversation.contactId,
        contactInboxId: parsedInput.contactInboxId,
      })
      if (!contactInbox) {
        return { mode: "none", reason: "notWhatsappConversation" }
      }

      const integration =
        await integrationWhatsappRepository.findByInboxIdForWorkspace({
          workspaceId,
          inboxId: contactInbox.inboxId,
        })
      if (!integration) {
        return { mode: "none", reason: "notWhatsappConversation" }
      }

      const auth = integration.auth as WhatsappAuthValue

      // Mirrors the Calls settings card, cached per-integration so opening
      // every conversation doesn't fire a fresh Meta GET. A rejected token
      // surfaces as tokenInvalid. The workspace's own switch is checked before
      // Meta's, off by default until an admin enables it in Settings.
      if (integration.callingEnabled !== true) {
        return { mode: "none", reason: "callingNotEnabled" }
      }

      let callingSettings: WhatsappCallingSettings
      try {
        callingSettings = await getCachedCallingSettings(auth, integration.id)
      } catch {
        return { mode: "none", reason: "tokenInvalid" }
      }
      if (callingSettings.status !== "ENABLED") {
        return { mode: "none", reason: "callingNotEnabled" }
      }

      // Backstops Meta's eligibility errors with a human-readable reason,
      // reusing the same read-only preflight the Calls settings card runs. A
      // manual integration has no app credential to run it against, so the
      // client shows a warning dialog instead of blocking outright; only a
      // platform-credential integration with a confirmed missing subscription
      // is blocked here.
      const workspace = await workspaceService.findById({ id: workspaceId })
      const preflight = await getWhatsappCallingPreflight({
        workspace,
        auth,
        inboxId: contactInbox.inboxId,
      }).catch(() => null)
      if (preflight?.hasAppCredential && preflight.callsSubscribed === false) {
        return { mode: "none", reason: "webhookNotSubscribed" }
      }

      const businessCountry = parsePhoneNumberFromString(
        integration.displayPhoneNumber,
      )?.country
      if (businessCountry && BLOCKED_OUTBOUND_COUNTRIES.has(businessCountry)) {
        return { mode: "none", reason: "ineligibleNumber" }
      }

      // The local mirror answers first since it's free and current once a reply
      // has landed. Only its absence falls through to Meta, because "no record"
      // and "no permission" differ — rendering request-permission for the
      // former would strand an agent who could otherwise dial.
      const permissionStatus =
        (await whatsappCallPermissionService.resolveStatus(contactInbox.id)) ??
        (await resolveMetaPermissionStatus({
          auth,
          workspaceId,
          integrationId: integration.id,
          contactInbox,
        }))

      const isManualIntegration = auth.metadata.isManual === true
      const unsignedWebhookWarning = isManualIntegration && !auth.clientSecret

      return {
        mode: "voip",
        permissionStatus,
        unsignedWebhookWarning,
        manualCallsSubscriptionUnverified: isManualIntegration,
        integrationId: integration.id,
      }
    },
  )
