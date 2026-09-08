import type { WhatsappSignupSessionAuthorized } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import {
  appAccessToken,
  exchangeAccessToken,
} from "@chatbotx.io/integration-whatsapp/api/auth"
import { findWaba } from "@chatbotx.io/integration-whatsapp/api/waba"
import { resolveOwningWabaId } from "@chatbotx.io/integration-whatsapp/api/waba-owner"
import { getTranslations } from "next-intl/server"
import { notSelectableOutcome } from "@/features/channel-connect/lib/connect-action-outcomes"
import {
  isCoexistOnboardingIntent,
  WHATSAPP_OAUTH_CALLBACK_PATH,
} from "../libs/embedded-signup"
import type { ConnectWhatsappResult, ConnectWhatsappSchema } from "../schema"
import { prepareBusinessAppInput } from "./prepare-business-app-input"
import {
  createPhoneNumberSelectionResult,
  createUnavailablePhoneNumberResult,
  getAvailablePhoneNumbers,
  type PreparedConnectInput,
  partitionDirectPhoneNumber,
  toDirectInput,
  toShortCircuit,
} from "./prepare-connect-shared"

async function resolveAccessToken(
  input: ConnectWhatsappSchema,
  whatsappSettings: WhatsappCredential,
  originUrl: string,
): Promise<string> {
  if (input.accessToken) {
    return input.accessToken
  }

  if (input.code) {
    const exchangeResult = await exchangeAccessToken(
      whatsappSettings,
      input.code,
      new URL(WHATSAPP_OAUTH_CALLBACK_PATH, originUrl).toString(),
    )
    return exchangeResult.access_token
  }

  throw new ChatbotXException("WhatsApp access token is required.")
}

/**
 * Reconstruct the connect inputs (WABA / phone number / business) server-side
 * from the access token. The Facebook OAuth dialog returns only a `code`; the
 * SDK-only `WA_EMBEDDED_SIGNUP` postMessage that normally carries these ids never
 * fires for a directly-opened dialog. The token's `whatsapp_business_management`
 * grant identifies the WABA, and the WABA exposes its phone numbers + owning
 * business.
 *
 * The grant can name several targets, so `resolveOwningWabaId` classifies them
 * by node type and keeps the WABA that owns the numbers — `phoneNumberIds`
 * passes on the number the request already named so a login granting two real
 * WABAs still lands on the right one.
 */
async function deriveSignupTargets(params: {
  accessToken: string
  appAccessToken: string
  version: string
  systemUserToken: string
  systemUserId: string
  phoneNumberIds: string[]
}): Promise<{
  wabaId: string
  businessId: string
} | null> {
  const { accessToken, version } = params
  const wabaId = await resolveOwningWabaId({
    accessToken,
    appAccessToken: params.appAccessToken,
    version,
    systemUserToken: params.systemUserToken,
    systemUserId: params.systemUserId,
    phoneNumberIds: params.phoneNumberIds,
  })
  if (!wabaId) {
    return null
  }

  const waba = await findWaba({
    wabaId,
    accessToken,
    version,
    fields: "owner_business_info",
  })

  return {
    wabaId,
    businessId: waba.owner_business_info?.id ?? "",
  }
}

/**
 * No granted target owned the numbers (`resolveOwningWabaId` logged which
 * targets it saw and why it dropped each one). The operator gets a typed
 * `notSelectable` row carrying the same translated sentence the reconnect
 * path already uses, rather than the generic "Something went wrong."
 */
async function unresolvedWabaOutcome(
  phoneNumberId: string | null | undefined,
): Promise<ConnectWhatsappResult> {
  const t = await getTranslations()
  return notSelectableOutcome({
    sourceId: phoneNumberId ?? "",
    name: phoneNumberId ?? "",
    detail: t("whatsapp.connect.errors.wabaResolveFailed"),
  })
}

/**
 * Prepares the session (picker fan-out) path. The session itself was already
 * read and verified by the caller (`resolveConnectOwner` in
 * `connect.action.ts` — identity, owner match, and, when non-null,
 * `session.workspaceId` membership), so this only checks per-number
 * candidacy and partitions the id.
 */
async function prepareSessionConnectInput(params: {
  session: WhatsappSignupSessionAuthorized
  phoneNumberId: string
}): Promise<PreparedConnectInput> {
  const { session, phoneNumberId } = params

  if (!session.candidatePhoneNumberIds.includes(phoneNumberId)) {
    return {
      source: "shortCircuit",
      result: notSelectableOutcome({
        sourceId: phoneNumberId,
        name: phoneNumberId,
      }),
    }
  }

  const partitioned = await partitionDirectPhoneNumber({
    wabaId: session.wabaId,
    phoneNumberId,
    accessToken: session.accessToken,
    version: session.apiVersion,
  })
  if ("shortCircuit" in partitioned) {
    return { source: "shortCircuit", result: partitioned.shortCircuit }
  }

  return {
    source: "direct",
    accessToken: session.accessToken,
    wabaId: session.wabaId,
    businessId: session.businessId,
    phoneNumber: partitioned.phoneNumber,
    workspaceId: session.workspaceId,
    signupSession: {
      id: session.id,
      userId: session.userId,
      ownerId: session.ownerId,
    },
  }
}

/** OAuth-with-manual-id path: the WABA/business ids come straight from `input`. */
async function prepareManualConnectInput(params: {
  input: ConnectWhatsappSchema
  accessToken: string
  version: string
}): Promise<PreparedConnectInput> {
  const { input, accessToken, version } = params
  const wabaId = input.wabaId ?? ""

  const partitioned = await partitionDirectPhoneNumber({
    wabaId,
    phoneNumberId: input.manualPhoneNumberId ?? "",
    accessToken,
    version,
  })
  if ("shortCircuit" in partitioned) {
    return toShortCircuit(partitioned.shortCircuit)
  }

  return toDirectInput({
    accessToken,
    wabaId,
    businessId: input.businessId ?? "",
    phoneNumber: partitioned.phoneNumber,
    workspaceId: input.workspaceId || null,
  })
}

/** OAuth path where the caller already knows which phone number to connect. */
async function prepareRequestedPhoneNumberInput(params: {
  input: ConnectWhatsappSchema
  targets: { wabaId: string; businessId: string }
  accessToken: string
  version: string
}): Promise<PreparedConnectInput> {
  const { input, targets, accessToken, version } = params

  const partitioned = await partitionDirectPhoneNumber({
    wabaId: targets.wabaId,
    phoneNumberId: input.phoneNumberId ?? "",
    accessToken,
    version,
  })
  if ("shortCircuit" in partitioned) {
    return toShortCircuit(partitioned.shortCircuit)
  }

  return toDirectInput({
    accessToken,
    wabaId: targets.wabaId,
    businessId: input.businessId ?? targets.businessId,
    phoneNumber: partitioned.phoneNumber,
    workspaceId: input.workspaceId || null,
  })
}

/**
 * OAuth path with no explicit phone number: connect the sole candidate
 * directly, or fall back to a phone-number selection session.
 */
async function prepareAutoSelectInput(params: {
  input: ConnectWhatsappSchema
  targets: { wabaId: string; businessId: string }
  accessToken: string
  version: string
  userId: string
  ownerId: string
}): Promise<PreparedConnectInput> {
  const { input, targets, accessToken, version, userId, ownerId } = params

  const phoneNumberAvailability = await getAvailablePhoneNumbers({
    wabaId: targets.wabaId,
    accessToken,
    version,
  })

  const unavailablePhoneNumberResult = createUnavailablePhoneNumberResult(
    phoneNumberAvailability.reason,
  )
  if (unavailablePhoneNumberResult) {
    return toShortCircuit(unavailablePhoneNumberResult)
  }

  const candidates = phoneNumberAvailability.phoneNumbers

  if (
    phoneNumberAvailability.totalPhoneNumberCount === 1 &&
    candidates.length === 1
  ) {
    const [phoneNumber] = candidates
    if (!phoneNumber) {
      throw new ChatbotXException("No WhatsApp phone number was found.")
    }

    return toDirectInput({
      accessToken,
      wabaId: targets.wabaId,
      businessId: input.businessId ?? targets.businessId,
      phoneNumber,
      workspaceId: input.workspaceId || null,
    })
  }

  return toShortCircuit(
    await createPhoneNumberSelectionResult({
      userId,
      ownerId,
      workspaceId: input.workspaceId || null,
      wabaId: targets.wabaId,
      businessId: input.businessId ?? targets.businessId,
      accessToken,
      version,
      candidates,
    }),
  )
}

type OwningWabaPathParams = {
  input: ConnectWhatsappSchema
  whatsappSettings: WhatsappCredential
  accessToken: string
  version: string
  ownerId: string
  userId: string
}

/**
 * The ordinary embedded-signup path: resolve the WABA the login granted, then
 * either the number the request names or the auto-select / picker flow.
 */
async function prepareOwningWabaInput(
  params: OwningWabaPathParams,
): Promise<PreparedConnectInput> {
  const { input, whatsappSettings, accessToken, version, ownerId, userId } =
    params

  const targets = await deriveSignupTargets({
    accessToken,
    appAccessToken: appAccessToken(whatsappSettings),
    version,
    systemUserToken: whatsappSettings.systemUserToken,
    systemUserId: whatsappSettings.systemUserId,
    phoneNumberIds: input.phoneNumberId ? [input.phoneNumberId] : [],
  })
  if (!targets) {
    return toShortCircuit(await unresolvedWabaOutcome(input.phoneNumberId))
  }

  if (input.wabaId && input.wabaId !== targets.wabaId) {
    throw new ChatbotXException(
      "Selected WhatsApp Business Account does not match the authorization.",
    )
  }

  if (input.phoneNumberId) {
    return prepareRequestedPhoneNumberInput({
      input,
      targets,
      accessToken,
      version,
    })
  }

  return prepareAutoSelectInput({
    input,
    targets,
    accessToken,
    version,
    userId,
    ownerId,
  })
}

export async function prepareConnectInput(params: {
  input: ConnectWhatsappSchema
  whatsappSettings: WhatsappCredential
  originUrl: string
  ownerId: string
  userId: string
  /** Present (and already verified) only on the session/picker-fan-out path. */
  session?: WhatsappSignupSessionAuthorized
}): Promise<PreparedConnectInput> {
  const { input, whatsappSettings, originUrl, ownerId, userId, session } =
    params

  if (session) {
    return prepareSessionConnectInput({
      session,
      phoneNumberId: input.phoneNumberId ?? "",
    })
  }

  const accessToken = await resolveAccessToken(
    input,
    whatsappSettings,
    originUrl,
  )
  const version = whatsappSettings.version

  if (input.manualConnect) {
    return prepareManualConnectInput({ input, accessToken, version })
  }

  // Coexistence connects the Business App number this login onboarded (see
  // `prepare-business-app-input.ts`); a re-submit naming a number stays ordinary.
  if (isCoexistOnboardingIntent(input) && !input.phoneNumberId) {
    return prepareBusinessAppInput({
      input,
      whatsappSettings,
      accessToken,
      version,
    })
  }

  return prepareOwningWabaInput({
    input,
    whatsappSettings,
    accessToken,
    version,
    ownerId,
    userId,
  })
}
