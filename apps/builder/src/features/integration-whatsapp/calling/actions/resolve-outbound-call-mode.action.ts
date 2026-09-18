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
 * `getCallingSettings` is a live Meta GET — without a cache it would fire
 * once per conversation open (every click into a WhatsApp thread), needlessly
 * hitting Meta and eating into its rate limit for something that changes
 * rarely (an admin toggling calling on/off in Settings). 5 minutes is well
 * short of anything that would leave a just-toggled setting stuck stale for
 * long, while still cutting the vast majority of redundant per-open GETs.
 */
const CALLING_SETTINGS_CACHE_TTL_SECONDS = 5 * 60

/**
 * Cached wrapper around {@link getCallingSettings} — see
 * {@link CALLING_SETTINGS_CACHE_TTL_SECONDS}. Cached only on success: a
 * thrown error (rejected/expired token) never gets stored, so a fixed
 * credential is reflected on the very next call rather than waiting out the
 * TTL.
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
 * Meta's answer for a contact the local mirror knows nothing about, in the
 * mirror's own vocabulary. `undefined` on any failure or unmapped status, so
 * an unreachable Meta leaves the control exactly where an empty mirror
 * already put it rather than inventing a permission.
 */
async function resolveMetaPermissionStatus(props: {
  auth: WhatsappAuthValue
  workspaceId: string
  integrationId: string
  contactInbox: OutboundDialContactInbox
}): Promise<CallPermissionStatus | undefined> {
  const { permissionTarget } = resolveDialIdentity(props.contactInbox)
  const permissions = await readMetaCallPermissions({
    auth: props.auth,
    integrationId: props.integrationId,
    contactInboxId: props.contactInbox.id,
    target: permissionTarget,
  })
  if (!permissions) {
    return
  }

  const status = toCallPermissionStatus(permissions)
  if (!status) {
    return
  }

  // Mirror a grant so this contact is answered locally from here on. Without
  // it the record stays empty forever for everyone who granted permission
  // before their reply could be recorded — a reply they will never send
  // again — and every conversation open pays another Meta round trip.
  // `mirrorProviderGrant` decides what is safe to write; this is a read path,
  // so a failed write only costs the next read another lookup.
  try {
    await whatsappCallPermissionService.mirrorProviderGrant({
      workspaceId: props.workspaceId,
      contactInboxId: props.contactInbox.id,
      status,
      expirationTimestamp: toPermissionExpirationTimestamp(permissions),
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
   * Pins resolution to a SPECIFIC WhatsApp `ContactInbox` of this
   * conversation's contact (e.g. the contact panel dialing one of several
   * numbers) rather than "whichever WhatsApp inbox this contact has" —
   * ownership-checked the same way `resolveContactInbox` checks it for an
   * actual outbound dial (`outbound-dial-target.ts`), so a foreign id (one
   * that does not belong to this conversation's contact) resolves to
   * nothing, never leaking another contact's number. Omitted, mode is
   * identical to before this parameter existed.
   */
  contactInboxId: zodBigintAsString().optional(),
})

export type OutboundCallPermissionStatus = CallPermissionStatus

/**
 * Which outbound call control the thread should render for this
 * conversation's WhatsApp number, and why. Drives the button/dialog in a
 * later (client) wave.
 */
export type NoneCallModeReason =
  | "ineligibleNumber"
  | "notWhatsappConversation"
  /**
   * Calling is off for this number — either the workspace has not turned it
   * on (the default for every number, old and new) or Meta's own
   * `calling.status` is not `ENABLED`. One reason for both: the dialog it
   * renders sends the admin to the same settings page either way.
   */
  | "callingNotEnabled"
  /** The owning app is not subscribed to the `calls` webhook field, so call
   * events can never reach ChatbotX (Meta error 138018). */
  | "webhookNotSubscribed"
  /** The stored token/credential was rejected by Meta when checking calling
   * eligibility (expired, revoked, or otherwise invalid). */
  | "tokenInvalid"
  /** D3 access denial: `canCallConversation` returned false (an
   * assigned-only agent resolving a conversation assigned to someone else).
   * Never distinguishable from "no such call/conversation" by a caller
   * probing this reason — same non-disclosure guarantee
   * `assertCallAccessOrThrow`'s thrown `CALL_ACCESS_DENIED_CODE` gives the
   * other calling actions, just returned as data instead of thrown so a
   * failed mode resolution does not leave the starter's `isResolvingMode`
   * stuck forever. */
  | "callAccessDenied"

export type ResolveOutboundCallModeResult =
  | {
      mode: "voip"
      permissionStatus: OutboundCallPermissionStatus | undefined
      /** True only for a manually-connected integration with no Meta App
       * Secret configured (`auth.clientSecret` empty) — manual
       * integrations without a secret stay unsigned/unverified rather than
       * being blocked from calling. The client shows a warning dialog before
       * dialing rather than gating the call outright. Never true for a
       * platform-credential integration (those always carry a secret). */
      unsignedWebhookWarning: boolean
      /** True for EVERY manually-connected integration (`auth.metadata.isManual`),
       * regardless of whether an app secret is configured. Neither ChatbotX's
       * platform app nor this action can confirm that the customer's own Meta
       * app is subscribed to the `calls` webhook field for a manual
       * integration (`hasAppCredential` is always false there, so the
       * `webhookNotSubscribed` preflight gate never runs) — if it is not
       * subscribed, outbound calls never receive Meta's SDP answer/status
       * webhooks and inbound calls never ring. Always false for a
       * platform-credential integration, where ChatbotX verifies/auto-
       * subscribes the field. Never derived from or exposing a secret. */
      manualCallsSubscriptionUnverified: boolean
      /** The integration backing this conversation's WhatsApp number —
       * scopes the client's manual-integration warning acknowledgement to
       * this specific integration, so switching to a different WhatsApp
       * number/conversation shows the warning again rather than silently
       * reusing an acknowledgement from an unrelated integration. */
      integrationId: string
    }
  | { mode: "none"; reason: NoneCallModeReason }
  | undefined

/**
 * Resolves whether a conversation's WhatsApp number should render the VoIP
 * (browser WebRTC) call control or no call control at all — mirrors the
 * eligibility gate in `initiateOutboundVoipCallAction` (country block)
 * without touching Meta's rate-limited `call_permissions` GET;
 * `permissionStatus` comes from the local table only, and is `undefined`
 * when no reply has ever been recorded for this contact (the client renders
 * a neutral "request permission" affordance).
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

      // P2 item 5 (plan D3): mirrors the outbound-dial gate — an
      // assigned-only agent must not even be told which call mode another
      // agent's conversation would use. Uses the non-throwing
      // `canCallConversation` (rather than `assertCallAccessOrThrow`) and
      // returns `{ mode: "none", reason: "callAccessDenied" }` instead of
      // throwing (review B1): a thrown error here left the client's
      // `isResolvingMode` stuck `true` forever (a permanently disabled call
      // button with no feedback), since `outboundCallMode` never resolves to
      // a value on a query error. Returning data instead lets the shared
      // starter's `mode: "none"` alert path handle it uniformly with every
      // other denial reason.
      const hasCallAccess = await canCallConversation({
        workspaceId,
        conversationId: conversation.id,
        userId: ctx.user.id,
      })
      if (!hasCallAccess) {
        return { mode: "none", reason: "callAccessDenied" }
      }

      // Reuses the exact same ownership-scoped lookup an actual outbound
      // dial uses (`resolveContactInbox`, `outbound-dial-target.ts`) rather
      // than duplicating the "does this contactInboxId belong to this
      // conversation's contact" check — a foreign id simply resolves to
      // `null` here too, the channel filter is baked into the query, and
      // omitting `contactInboxId` falls through to "whichever WhatsApp
      // inbox this contact has", identical to before this parameter existed.
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

      // `calling.status` check — mirrors the Calls settings card
      // (`WhatsappCallsPage`), cached per-integration for
      // `CALLING_SETTINGS_CACHE_TTL_SECONDS` so opening every
      // conversation does not fire a fresh Meta GET. A rejected/expired token
      // surfaces as `tokenInvalid` rather than throwing, so the header button
      // always gets a definite answer to branch its capability dialog on.
      // The workspace's own switch, checked before Meta's: calling stays off
      // for every number until an admin turns it on in
      // Settings > Channels > WhatsApp > Calls, both for numbers connected
      // before this feature existed and for new ones. `callingNotEnabled`
      // already renders the dialog that says exactly where to go.
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

      // Backstops Meta's 138013/138018/138014 eligibility errors with a
      // human-readable reason up front, reusing the same read-only preflight
      // the Calls settings card runs (`getWhatsappCallingPreflight`) rather
      // than a second bespoke check.
      // A manual integration has no app credential to run the subscription
      // preflight against (`hasAppCredential` is always false for it) — per
      // This no longer blocks calling outright; the client instead
      // shows a warning dialog (`unsignedWebhookWarning`) when the manual
      // integration also has no app secret configured. Only a
      // platform-credential integration with a confirmed missing webhook
      // subscription is blocked here.
      const workspace = await workspaceService.findById({ id: workspaceId })
      const preflight = await getWhatsappCallingPreflight({
        workspace,
        auth,
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

      // The local mirror answers first: it costs nothing and, once a
      // `call_permission_reply` has landed, it is as current as Meta. Only
      // its ABSENCE — no reply ever recorded for this contact — falls
      // through to Meta's own answer, because "no record" and "no
      // permission" are not the same thing and rendering the
      // request-permission control for the former strands the agent: the
      // dial path they can no longer reach is the one that would have read
      // Meta and succeeded. See `meta-call-permission.ts`.
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
