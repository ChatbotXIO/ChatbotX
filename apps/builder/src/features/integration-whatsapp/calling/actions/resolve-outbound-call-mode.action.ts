"use server"

import {
  contactInboxService,
  conversationService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationWhatsappRepository,
  whatsappCallPermissionRepository,
} from "@chatbotx.io/database/repositories"
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
import { workspaceActionClient } from "@/lib/safe-action"
import { BLOCKED_OUTBOUND_COUNTRIES } from "./blocked-outbound-countries"

/**
 * `getCallingSettings` is a live Meta GET — without a cache it would fire
 * once per conversation open (every click into a WhatsApp thread), needlessly
 * hitting Meta and eating into its rate limit for something that changes
 * rarely (an admin toggling calling on/off in Settings). 5 minutes is well
 * short of anything that would leave a just-toggled setting stuck stale for
 * long, while still cutting the vast majority of redundant per-open GETs.
 */
const CALLING_SETTINGS_CACHE_TTL_SECONDS = 5 * 60

const callingSettingsCacheKey = (integrationId: string): string =>
  `whatsapp-outbound-call-mode:calling-settings:${integrationId}`

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

const resolveOutboundCallModeSchema = z.object({
  conversationId: zodBigintAsString(),
})

export type OutboundCallPermissionStatus =
  | "no_permission"
  | "temporary"
  | "permanent"

/**
 * Which outbound call control the thread should render for this
 * conversation's WhatsApp number, and why. Drives the button/dialog in a
 * later (client) wave.
 */
export type NoneCallModeReason =
  | "ineligibleNumber"
  | "notWhatsappConversation"
  /** `calling.status` is not `ENABLED` on this WhatsApp number. */
  | "callingNotEnabled"
  /** The owning app is not subscribed to the `calls` webhook field, so call
   * events can never reach ChatbotX (Meta error 138018). */
  | "webhookNotSubscribed"
  /** A manually-connected number has no app credential to run the
   * subscription/eligibility preflight against. */
  | "manualIntegrationNoCredentials"
  /** The stored token/credential was rejected by Meta when checking calling
   * eligibility (expired, revoked, or otherwise invalid). */
  | "tokenInvalid"

export type ResolveOutboundCallModeResult =
  | {
      mode: "voip"
      permissionStatus: OutboundCallPermissionStatus | undefined
    }
  | { mode: "none"; reason: NoneCallModeReason }

/**
 * Derives the local permission display state from the `WhatsappCallPermission`
 * table (`response`/`isPermanent`/`expiresAt`) — NEVER Meta's `GET
 * call_permissions`, which is itself rate-limited. The live Meta GET only happens at dial time, inside
 * `initiateOutboundVoipCallAction`.
 */
function derivePermissionStatus(
  row:
    | {
        response: "accept" | "reject"
        isPermanent: boolean
        expiresAt: Date | null
      }
    | undefined,
): OutboundCallPermissionStatus | undefined {
  if (!row) {
    return
  }
  if (row.response === "reject") {
    return "no_permission"
  }
  if (row.isPermanent) {
    return "permanent"
  }
  if (row.expiresAt && row.expiresAt.getTime() > Date.now()) {
    return "temporary"
  }
  return "no_permission"
}

/**
 * Resolves whether a conversation's WhatsApp number should render the VoIP
 * (browser WebRTC) call control or no call control at all — mirrors the
 * eligibility gate in `initiateOutboundVoipCallAction` (country block)
 * without touching Meta's rate-limited `call_permissions` GET;
 * `permissionStatus` comes from the local table only, and is `undefined`
 * when no reply has ever been recorded for this contact (the client renders
 * a neutral "request permission" affordance).
 */
export const resolveOutboundCallModeAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(resolveOutboundCallModeSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }): Promise<ResolveOutboundCallModeResult> => {
      const t = await getTranslations()

      const conversation = await conversationService.findBy({
        where: { id: parsedInput.conversationId, workspaceId },
      })
      if (!conversation) {
        throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
      }

      const contactInbox = await contactInboxService.findBy({
        where: {
          contactId: conversation.contactId,
          channel: channelTypes.enum.whatsapp,
        },
      })
      if (
        !contactInbox ||
        contactInbox.channel !== channelTypes.enum.whatsapp
      ) {
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
      const workspace = await workspaceService.findById({ id: workspaceId })
      const preflight = await getWhatsappCallingPreflight({
        workspace,
        auth,
      }).catch(() => null)
      if (preflight?.isManual) {
        return { mode: "none", reason: "manualIntegrationNoCredentials" }
      }
      if (preflight?.hasAppCredential && preflight.callsSubscribed === false) {
        return { mode: "none", reason: "webhookNotSubscribed" }
      }

      const businessCountry = parsePhoneNumberFromString(
        integration.displayPhoneNumber,
      )?.country
      if (businessCountry && BLOCKED_OUTBOUND_COUNTRIES.has(businessCountry)) {
        return { mode: "none", reason: "ineligibleNumber" }
      }

      const permissionRow =
        await whatsappCallPermissionRepository.findByContactInboxId(
          contactInbox.id,
        )

      const permissionStatus = derivePermissionStatus(permissionRow)
      logger.info(
        {
          contactInboxId: contactInbox.id,
          permissionStatus: permissionStatus ?? "none",
          hasRow: permissionRow != null,
          rowResponse: permissionRow?.response,
          rowIsPermanent: permissionRow?.isPermanent,
          rowExpiresAt: permissionRow?.expiresAt ?? null,
        },
        "[wa-call-permission] resolved outbound call mode",
      )

      return {
        mode: "voip",
        permissionStatus,
      }
    },
  )
