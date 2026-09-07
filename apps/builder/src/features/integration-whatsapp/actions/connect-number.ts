import "server-only"

import {
  integrationWhatsappService,
  platformCredentialService,
  type WhatsappSignupSessionAuthorized,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  connectSessionExpiredException,
  credentialMissingException,
  notWorkspaceMemberException,
} from "@chatbotx.io/business/errors"
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import {
  addSystemUser,
  shareCreditLine,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { normalizeWhatsappDisplayPhoneNumber } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { subscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { toConnectActionFailure } from "@/features/channel-connect/lib/connect-action-outcomes"
import { logger } from "@/lib/log"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { resolveProviderOriginForCredential } from "@/lib/provider-origin"
import {
  checkWorkspaceOwnerAccess,
  workspaceAccessDenialException,
} from "@/lib/workspace/authorize-workspace-access"
import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type ConnectWhatsappSchema,
} from "../schema"
import {
  buildConnectedExtra,
  resolveCoexistState,
  runWhatsappPostConnect,
} from "./connect-steps"
import { prepareConnectInput } from "./prepare-connect-input"
import type { PreparedConnectInput } from "./prepare-connect-shared"
import {
  buildAuthValue,
  buildWabaAuthValue,
  buildWebhookConfig,
} from "./webhook-url"

/**
 * Confirms the acting user may connect into `workspaceId` — the same
 * membership + owner-quota/trial gate `resolveConnectSession` runs for
 * Messenger/Instagram (plan §2.4 steps 2-3). WhatsApp's `workspaceId` arrives
 * on the wire directly (a client-supplied form field, or the signup
 * session's own stored value) instead of a signed pending-auth cookie, and is
 * never itself proof of membership — every non-null `workspaceId` on every
 * path (direct manual/OAuth/auto-select, AND the session's own stored value)
 * must be checked. Throws one of the session-level exceptions — callers let
 * it propagate to the action's outer catch, which maps it through
 * `toConnectActionFailure`.
 */
async function assertWorkspaceConnectAccess(params: {
  workspaceId: string
  userId: string
}): Promise<void> {
  const workspace = await workspaceService.find({
    where: { id: params.workspaceId },
  })
  if (!workspace) {
    throw notWorkspaceMemberException()
  }

  const isMember = await workspaceMemberService.isMember({
    workspaceId: workspace.id,
    userId: params.userId,
  })
  if (!isMember) {
    throw notWorkspaceMemberException()
  }

  const denialReason = await checkWorkspaceOwnerAccess({
    ownerId: workspace.ownerId,
  })
  if (denialReason) {
    throw workspaceAccessDenialException(denialReason)
  }
}

type ResolvedConnectOwner = {
  ownerId: string
  /** Present (and already verified) only on the session/picker-fan-out path. */
  session?: WhatsappSignupSessionAuthorized
}

/**
 * Resolves the platform owner (and, on the session path, the signup session
 * itself) BEFORE any credential lookup or provider call.
 *
 * Session path: the client sends only `{signupSessionId, phoneNumberId,
 * connectExisting, transferPhoneNumber}` (enforced by the schema) — never a
 * `workspaceId`, so the session row is the only source of both the owner and
 * the workspace. `findActiveSignupSessionForUser` is scoped by `id` +
 * `userId` only (no `ownerId` filter — the row hasn't been verified as this
 * user's own credential owner yet), so a forged/foreign session id would
 * otherwise let its `ownerId` (and thus its Meta app credential) leak
 * through unverified. The fix: re-derive the expected owner from
 * `resolvePlatformOwnerId({userId, workspaceId: session.workspaceId})`
 * (host still wins over workspace, same precedence as every other path) and
 * require it to match the row's stored `ownerId` — a mismatch reads exactly
 * like an expired/foreign session, since neither should ever reach the
 * credential step. When the session's own `workspaceId` is non-null, it is
 * additionally membership/quota-checked (`assertWorkspaceConnectAccess`),
 * since it was written into the row from client input with no check at
 * create time.
 *
 * Non-session paths (manual / OAuth-with-id / auto-select / the selection
 * request that creates a session): the owner comes straight from
 * `resolvePlatformOwnerId({userId, workspaceId: input.workspaceId})` — the
 * caller (`connectWhatsappAction`) has already run
 * `assertWorkspaceConnectAccess` on that same `workspaceId` before this is
 * called.
 */
async function resolveConnectOwner(params: {
  input: ConnectWhatsappSchema
  userId: string
}): Promise<ResolvedConnectOwner> {
  const { input, userId } = params

  if (!input.signupSessionId) {
    const ownerId = await resolvePlatformOwnerId({
      userId,
      workspaceId: input.workspaceId,
    })
    return { ownerId }
  }

  const session =
    await integrationWhatsappService.findActiveSignupSessionForUser({
      id: input.signupSessionId,
      userId,
    })
  if (!session) {
    throw connectSessionExpiredException(
      "Your WhatsApp signup session has expired. Please start the connection again.",
      "signupSessionExpired",
    )
  }

  const expectedOwnerId = await resolvePlatformOwnerId({
    userId,
    workspaceId: session.workspaceId,
  })
  if (session.ownerId !== expectedOwnerId) {
    throw connectSessionExpiredException(
      "Your WhatsApp signup session has expired. Please start the connection again.",
      "signupSessionExpired",
    )
  }

  if (session.workspaceId) {
    await assertWorkspaceConnectAccess({
      workspaceId: session.workspaceId,
      userId,
    })
  }

  return { ownerId: session.ownerId, session }
}

async function setupOAuthResources(
  auth: WhatsappAuthValue,
  whatsappSettings: WhatsappCredential,
): Promise<void> {
  await addSystemUser({ auth, whatsappSettings })
  logger.info("addSystemUser")

  if (whatsappSettings.businessId) {
    await shareCreditLine({ auth, whatsappSettings })
    logger.info("shareCreditLine")
  }
}

/**
 * Everything a connect needs before it may touch Meta: the workspace gate for
 * a client-supplied `workspaceId`, the owner (and signup session) the request
 * acts as, that owner's WhatsApp app credential, and the provider-facing
 * origin its URLs must live on. One job — authorize and resolve — so the
 * connect body below reads as the provider sequence it actually is.
 */
async function resolveWhatsappConnectContext({
  input,
  userId,
}: {
  input: ConnectWhatsappSchema
  userId: string
}): Promise<{
  ownerId: string
  session: WhatsappSignupSessionAuthorized | undefined
  whatsappSettings: WhatsappCredential
  originUrl: string
}> {
  // Every non-session request's `workspaceId` is client-supplied and
  // unverified — gate it before any credential lookup or provider call. A
  // null workspace (first-ever connect) stays allowed; the session path's own
  // `workspaceId` is checked separately, inside `resolveConnectOwner`, since
  // it lives on the session row rather than the wire.
  if (!input.signupSessionId && input.workspaceId) {
    await assertWorkspaceConnectAccess({
      workspaceId: input.workspaceId,
      userId,
    })
  }

  const { ownerId, session } = await resolveConnectOwner({ input, userId })

  const whatsappCredential = await platformCredentialService.resolveForOwner({
    ownerId,
    type: "whatsapp",
  })
  if (!whatsappCredential) {
    throw credentialMissingException(
      "WhatsApp app credentials are not configured for this workspace.",
    )
  }

  return {
    ownerId,
    session,
    whatsappSettings: whatsappCredential.config,
    // Provider-facing URLs (the webhook override_callback_uri sent to Meta on
    // manual connect, and the stored OAuth redirectUrl) must live on a host
    // registered with Meta: the reseller's own custom domain for a
    // tenant-owned credential (their own app), otherwise the broker. Mirrors
    // the pattern messenger/instagram use (lib/provider-origin.ts).
    originUrl: await resolveProviderOriginForCredential(whatsappCredential),
  }
}

type DirectConnectInput = Extract<PreparedConnectInput, { source: "direct" }>

/**
 * The WABA-level setup Meta needs before a number on that WABA may be stored
 * — only the OAuth paths do it; a manual connect brings its own WABA.
 */
async function provisionWabaResources({
  prepared,
  whatsappSettings,
  originUrl,
}: {
  prepared: DirectConnectInput
  whatsappSettings: WhatsappCredential
  originUrl: string
}): Promise<void> {
  const wabaAuth = buildWabaAuthValue({
    whatsappSettings,
    accessToken: prepared.accessToken,
    wabaId: prepared.wabaId,
    businessId: prepared.businessId,
    originUrl,
    phoneNumber: prepared.phoneNumber,
  })

  await setupOAuthResources(wabaAuth, whatsappSettings)
  await subscribeWebhook({ auth: wabaAuth })
}

type PersistedWhatsappNumber = {
  integrationId: string
  integrationRow: IntegrationWhatsappModel
  connectedWorkspaceId: string
  auth: WhatsappAuthValue
  webhookUrl: string
  verifyToken: string
  displayPhoneNumber: string
  phoneName: string
}

/**
 * Mints the integration id, the webhook config and the auth value it implies,
 * then stores the number.
 */
async function persistWhatsappNumber({
  prepared,
  whatsappSettings,
  originUrl,
  isManual,
  isCoexist,
  platformType,
  ownerId,
  userId,
}: {
  prepared: DirectConnectInput
  whatsappSettings: WhatsappCredential
  originUrl: string
  isManual: boolean
  isCoexist: boolean
  platformType: Awaited<ReturnType<typeof resolveCoexistState>>["platformType"]
  ownerId: string
  userId: string
}): Promise<PersistedWhatsappNumber> {
  const { accessToken, wabaId, businessId, phoneNumber, workspaceId } = prepared

  const integrationId = createId()
  const { webhookUrl, verifyToken } = buildWebhookConfig({
    isManual,
    integrationId,
    originUrl,
    whatsappSettings,
  })
  const auth = await buildAuthValue({
    whatsappSettings,
    accessToken,
    verifyToken,
    webhookUrl,
    originUrl,
    wabaId,
    phoneNumber,
    businessId,
    isManual,
  })

  const displayPhoneNumber = normalizeWhatsappDisplayPhoneNumber(
    phoneNumber.display_phone_number,
  )
  const phoneName = phoneNumber.verified_name.trim() || displayPhoneNumber

  const { workspaceId: connectedWorkspaceId, integrationRow } =
    await integrationWhatsappService.connectPhoneNumber({
      actorUserId: userId,
      ownerId,
      workspaceId,
      integrationId,
      phoneNumber: {
        id: phoneNumber.id,
        name: phoneName,
        displayPhoneNumber,
      },
      wabaId,
      businessId,
      auth,
      isCoexist,
      platformType,
      signupSession: prepared.signupSession,
    })

  return {
    integrationId,
    integrationRow,
    connectedWorkspaceId,
    auth,
    webhookUrl,
    verifyToken,
    displayPhoneNumber,
    phoneName,
  }
}

/** Best-effort — a stale members cache must never fail a connect that landed. */
async function invalidateWorkspaceMembersCache(userId: string): Promise<void> {
  try {
    await invalidateCacheByTags([`users:${userId}:workspace-members`])
  } catch (err) {
    logger.warn(
      { err },
      "Failed to invalidate workspace-members cache after WhatsApp connect",
    )
  }
}

/**
 * Connects one WhatsApp phone number — every path the form and the picker
 * can take (signup session, OAuth-with-id, auto-select, manual), as a plain
 * server function so both transports can call it: the oRPC route the picker
 * posts to in parallel (`api/connect.ts`, session path only) and the server
 * action the top-level connect form keeps using (manual/OAuth/auto-select).
 * Every failure — session-level or per-number — comes back as a typed
 * result, never a thrown exception.
 */
export async function connectWhatsappNumber({
  userId,
  input,
}: {
  userId: string
  input: ConnectWhatsappSchema
}): Promise<ConnectWhatsappResult> {
  const requestedPhoneNumberId =
    (input.manualConnect ? input.manualPhoneNumberId : input.phoneNumberId) ??
    ""
  const identity = {
    sourceId: requestedPhoneNumberId,
    name: requestedPhoneNumberId,
  }

  try {
    const { ownerId, session, whatsappSettings, originUrl } =
      await resolveWhatsappConnectContext({ input, userId })

    const isManual = input.manualConnect

    const prepared = await prepareConnectInput({
      input,
      whatsappSettings,
      originUrl,
      ownerId,
      userId,
      session,
    })
    if (prepared.source === "shortCircuit") {
      return prepared.result
    }

    if (!isManual) {
      await provisionWabaResources({ prepared, whatsappSettings, originUrl })
    }

    const { isCoexist, platformType } = await resolveCoexistState({
      parsedInput: input,
      phoneNumberId: prepared.phoneNumber.id,
      accessToken: prepared.accessToken,
      version: whatsappSettings.version,
    })

    const persisted = await persistWhatsappNumber({
      prepared,
      whatsappSettings,
      originUrl,
      isManual,
      isCoexist,
      platformType,
      ownerId,
      userId,
    })
    const { integrationRow, connectedWorkspaceId, phoneName } = persisted

    const { warning, requiresPhoneVerification, registrationError } =
      await runWhatsappPostConnect({
        isCoexist,
        isManual,
        auth: persisted.auth,
        whatsappSettings,
        phoneNumber: prepared.phoneNumber,
        integrationRow,
        connectedWorkspaceId,
        integrationId: persisted.integrationId,
      })

    await invalidateWorkspaceMembersCache(userId)

    const extra = buildConnectedExtra({
      warning,
      registration: { requiresPhoneVerification, registrationError },
      phoneNumber: prepared.phoneNumber,
      manual: isManual
        ? {
            integrationId: integrationRow.id,
            workspaceId: connectedWorkspaceId,
            webhookUrl: persisted.webhookUrl,
            verifyToken: persisted.verifyToken,
          }
        : undefined,
    })

    return {
      type: CONNECT_WHATSAPP_RESULT_TYPES.CONNECTED,
      workspaceId: connectedWorkspaceId,
      isManual,
      redirectUrl: `/space/${connectedWorkspaceId}`,
      outcome: {
        sourceId: prepared.phoneNumber.id,
        name: phoneName,
        status: "connected",
        warning,
        integrationId: integrationRow.id,
        coexistEligible: isCoexist,
        extra,
      },
    }
  } catch (error) {
    return toConnectActionFailure(error, {
      ...identity,
      log: "Failed to connect a WhatsApp phone number",
    })
  }
}
