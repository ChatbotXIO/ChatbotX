"use server"

import {
  buildContext,
  connectChannelIntegration,
  integrationWhatsappService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  db,
  eq,
  isUniqueViolationError,
  type Transaction,
} from "@chatbotx.io/database/client"
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import {
  integrationWhatsappModel,
  WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT,
} from "@chatbotx.io/database/schema"
import type {
  IntegrationWhatsappModel,
  UserModel,
} from "@chatbotx.io/database/types"
import {
  addSystemUser,
  integration as integrationWhatsapp,
  registerPhoneNumber,
  shareCreditLine,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import {
  exchangeAccessToken,
  getSharedWabaId,
} from "@chatbotx.io/integration-whatsapp/api/auth"
import {
  getCoexistEligibility,
  normalizeWhatsappDisplayPhoneNumber,
  type WhatsappPhoneNumber,
  listPhoneNumbers as whatsappListPhoneNumbers,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { findWaba } from "@chatbotx.io/integration-whatsapp/api/waba"
import { subscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { SdkException } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl, getBrokerOrigin } from "@/lib/oauth-broker"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { authActionClient } from "@/lib/safe-action"
import { hasWhatsappCapiScope } from "../libs/capi-scope"
import {
  isCoexistOnboardingIntent,
  WHATSAPP_OAUTH_CALLBACK_PATH,
} from "../libs/embedded-signup"
import { toRegistrationOutcome } from "../libs/registration-outcome"
import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type ConnectWhatsappSchema,
  connectWhatsappSchema,
  type WhatsappPhoneNumberOption,
} from "../schemas"
import { buildAuthValue, buildWebhookConfig } from "./webhook-url"

async function resolveAccessToken(
  input: ConnectWhatsappSchema,
  whatsappSettings: WhatsappCredential,
  messages: ConnectErrorMessages,
): Promise<string> {
  if (input.accessToken) {
    return input.accessToken
  }

  if (input.code) {
    const exchangeResult = await exchangeAccessToken(
      whatsappSettings,
      input.code,
      buildBrokerCallbackUrl(WHATSAPP_OAUTH_CALLBACK_PATH),
    )
    return exchangeResult.access_token
  }

  throw new ChatbotXException(messages.accessTokenRequired)
}

/**
 * Reconstruct the connect inputs (WABA / phone number / business) server-side
 * from the access token. The Facebook OAuth dialog returns only a `code`; the
 * SDK-only `WA_EMBEDDED_SIGNUP` postMessage that normally carries these ids never
 * fires for a directly-opened dialog. The token's `whatsapp_business_management`
 * grant identifies the WABA, and the WABA exposes its phone numbers + owning
 * business.
 */
async function deriveSignupTargets(
  accessToken: string,
  appAccessToken: string,
  version: string,
  messages: ConnectErrorMessages,
): Promise<{
  wabaId: string
  businessId: string
}> {
  const wabaId = await getSharedWabaId(accessToken, appAccessToken)
  if (!wabaId) {
    throw new ChatbotXException(messages.wabaResolveFailed)
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

async function fetchAndValidatePhoneNumber(params: {
  wabaId: string
  phoneNumberId: string
  accessToken: string
  version: string
  messages: ConnectErrorMessages
}): Promise<WhatsappPhoneNumber> {
  const { wabaId, phoneNumberId, accessToken, version, messages } = params

  const phoneNumbers = await whatsappListPhoneNumbers({
    wabaId,
    accessToken,
    version,
  })

  if (phoneNumbers.data.length === 0) {
    throw new ChatbotXException(messages.noPhoneNumbersFound)
  }

  const foundPhoneNumber = phoneNumbers.data.find(
    (phoneNumber) => phoneNumber.id === phoneNumberId,
  )

  if (!foundPhoneNumber) {
    throw new ChatbotXException(messages.phoneNumberNotFound)
  }

  return foundPhoneNumber
}

/**
 * The outcomes an operator can act on, resolved once per request.
 *
 * Some are ordinary operator outcomes and some are broken preconditions, but
 * `ChatbotXException` can surface them to the browser either way, so resolve
 * all user-visible wording through translations once per request.
 */
type ConnectErrorMessages = {
  accessTokenRequired: string
  appSettingsNotFound: string
  failedToPersistIntegration: string
  noPhoneNumberFound: string
  noPhoneNumbersFound: string
  phoneNumberAlreadyConnected: string
  phoneNumberNotFound: string
  signupSessionExpired: string
  unableToVerifyToken: string
  wabaMismatch: string
  wabaResolveFailed: string
}

/**
 * Rejects a phone number that already backs an integration.
 *
 * This is the friendly check only — several network round trips separate it
 * from the insert, so `IntegrationWhatsapp_phoneNumberId_key` is what actually
 * makes the invariant hold under concurrent connects.
 */
async function ensurePhoneNumberNotConnected(
  phoneNumberId: string,
  messages: ConnectErrorMessages,
): Promise<void> {
  const connectedPhoneNumberIds =
    await integrationWhatsappService.findConnectedPhoneNumberIds([
      phoneNumberId,
    ])

  if (connectedPhoneNumberIds.has(phoneNumberId)) {
    throw new ChatbotXException(messages.phoneNumberAlreadyConnected)
  }
}

/**
 * Spends the signup session inside the connect transaction, so the session and
 * the integration it authorizes commit together.
 *
 * Losing the race here means a concurrent request already connected this
 * number; rolling back leaves nothing half-written.
 */
async function spendSignupSession(
  claim: SignupSessionClaim | undefined,
  tx: Transaction,
  messages: ConnectErrorMessages,
): Promise<void> {
  if (!claim) {
    return
  }

  const consumed = await integrationWhatsappService.consumeSignupSession({
    ...claim,
    tx,
  })

  if (!consumed) {
    throw new ChatbotXException(messages.signupSessionExpired)
  }
}

function toPhoneNumberOption(
  phoneNumber: WhatsappPhoneNumber,
): WhatsappPhoneNumberOption {
  return {
    id: phoneNumber.id,
    label:
      phoneNumber.verified_name.trim() ||
      phoneNumber.display_phone_number ||
      phoneNumber.id,
    displayPhoneNumber: phoneNumber.display_phone_number,
  }
}

const PHONE_NUMBER_AVAILABILITY_REASONS = {
  NO_PHONE_NUMBERS: "noPhoneNumbers",
  ALL_CONNECTED: "allConnected",
  AVAILABLE: "available",
} as const

type PhoneNumberAvailabilityReason =
  (typeof PHONE_NUMBER_AVAILABILITY_REASONS)[keyof typeof PHONE_NUMBER_AVAILABILITY_REASONS]

type AvailablePhoneNumbersResult = {
  reason: PhoneNumberAvailabilityReason
  phoneNumbers: WhatsappPhoneNumber[]
  totalPhoneNumberCount: number
}

async function getAvailablePhoneNumbers(params: {
  wabaId: string
  accessToken: string
  version: string
}): Promise<AvailablePhoneNumbersResult> {
  const response = await whatsappListPhoneNumbers(params)
  const phoneNumbers = response.data

  if (phoneNumbers.length === 0) {
    return {
      reason: PHONE_NUMBER_AVAILABILITY_REASONS.NO_PHONE_NUMBERS,
      phoneNumbers: [],
      totalPhoneNumberCount: 0,
    }
  }

  const connectedPhoneNumberIds =
    await integrationWhatsappService.findConnectedPhoneNumberIds(
      phoneNumbers.map((phoneNumber) => phoneNumber.id),
    )

  const availablePhoneNumbers = phoneNumbers.filter(
    (phoneNumber) => !connectedPhoneNumberIds.has(phoneNumber.id),
  )

  if (availablePhoneNumbers.length === 0) {
    return {
      reason: PHONE_NUMBER_AVAILABILITY_REASONS.ALL_CONNECTED,
      phoneNumbers: [],
      totalPhoneNumberCount: phoneNumbers.length,
    }
  }

  return {
    reason: PHONE_NUMBER_AVAILABILITY_REASONS.AVAILABLE,
    phoneNumbers: availablePhoneNumbers,
    totalPhoneNumberCount: phoneNumbers.length,
  }
}

function createUnavailablePhoneNumberResult(
  reason: PhoneNumberAvailabilityReason,
): PreparedConnectInput | null {
  switch (reason) {
    case PHONE_NUMBER_AVAILABILITY_REASONS.NO_PHONE_NUMBERS:
      return {
        source: "selection_required",
        result: {
          type: CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES,
        },
      }
    case PHONE_NUMBER_AVAILABILITY_REASONS.ALL_CONNECTED:
      return {
        source: "selection_required",
        result: {
          type: CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBERS_ALREADY_CONNECTED,
        },
      }
    default:
      return null
  }
}

async function createPhoneNumberSelectionResult(params: {
  userId: string
  ownerId: string
  workspaceId?: string | null
  wabaId: string
  businessId: string
  accessToken: string
  version: string
  candidates: WhatsappPhoneNumber[]
}): Promise<ConnectWhatsappResult> {
  const signupSession = await integrationWhatsappService.createSignupSession({
    userId: params.userId,
    ownerId: params.ownerId,
    workspaceId: params.workspaceId,
    wabaId: params.wabaId,
    businessId: params.businessId,
    accessToken: params.accessToken,
    apiVersion: params.version,
    candidatePhoneNumberIds: params.candidates.map(
      (phoneNumber) => phoneNumber.id,
    ),
  })

  return {
    type: CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_SELECTION,
    signupSessionId: signupSession.id,
    phoneNumbers: params.candidates.map(toPhoneNumberOption),
  }
}

/**
 * Identifies the pending phone-number selection that authorizes a connect.
 * Held until the integration is written so the session is only spent on a
 * connect that actually succeeded.
 */
type SignupSessionClaim = {
  id: string
  userId: string
  ownerId: string
  phoneNumberId: string
}

type PreparedConnectInput =
  | {
      source: "direct"
      accessToken: string
      wabaId: string
      businessId: string
      phoneNumber: WhatsappPhoneNumber
      signupSessionClaim?: SignupSessionClaim
    }
  | {
      source: "selection_required"
      result: ConnectWhatsappResult
    }

async function prepareConnectInput(params: {
  input: ConnectWhatsappSchema
  whatsappSettings: WhatsappCredential
  ownerId: string
  userId: string
  messages: ConnectErrorMessages
}): Promise<PreparedConnectInput> {
  const { input, whatsappSettings, ownerId, userId, messages } = params

  if (input.signupSessionId) {
    const signupSessionClaim: SignupSessionClaim = {
      id: input.signupSessionId,
      userId,
      ownerId,
      phoneNumberId: input.phoneNumberId ?? "",
    }
    // Read without spending: everything below can still fail, and the user
    // cannot re-run Meta's signup to get another token. The claim is spent in
    // the same transaction that writes the integration.
    const session =
      await integrationWhatsappService.findActiveSignupSession(
        signupSessionClaim,
      )

    if (!session) {
      throw new ChatbotXException(messages.signupSessionExpired)
    }

    return {
      source: "direct",
      accessToken: session.accessToken,
      wabaId: session.wabaId,
      businessId: session.businessId,
      signupSessionClaim,
      phoneNumber: await fetchAndValidatePhoneNumber({
        wabaId: session.wabaId,
        phoneNumberId: signupSessionClaim.phoneNumberId,
        accessToken: session.accessToken,
        version: session.apiVersion,
        messages,
      }),
    }
  }

  const accessToken = await resolveAccessToken(
    input,
    whatsappSettings,
    messages,
  )

  if (input.manualConnect) {
    return {
      source: "direct",
      accessToken,
      wabaId: input.wabaId ?? "",
      businessId: input.businessId ?? "",
      phoneNumber: await fetchAndValidatePhoneNumber({
        wabaId: input.wabaId ?? "",
        phoneNumberId: input.phoneNumberId ?? "",
        accessToken,
        version: whatsappSettings.version,
        messages,
      }),
    }
  }

  const targets = await deriveSignupTargets(
    accessToken,
    `${whatsappSettings.clientId}|${whatsappSettings.clientSecret}`,
    whatsappSettings.version,
    messages,
  )

  if (input.wabaId && input.wabaId !== targets.wabaId) {
    throw new ChatbotXException(messages.wabaMismatch)
  }

  if (input.phoneNumberId) {
    return {
      source: "direct",
      accessToken,
      wabaId: targets.wabaId,
      businessId: input.businessId ?? targets.businessId,
      phoneNumber: await fetchAndValidatePhoneNumber({
        wabaId: targets.wabaId,
        phoneNumberId: input.phoneNumberId,
        accessToken,
        version: whatsappSettings.version,
        messages,
      }),
    }
  }

  const phoneNumberAvailability = await getAvailablePhoneNumbers({
    wabaId: targets.wabaId,
    accessToken,
    version: whatsappSettings.version,
  })

  const unavailablePhoneNumberResult = createUnavailablePhoneNumberResult(
    phoneNumberAvailability.reason,
  )
  if (unavailablePhoneNumberResult) {
    return unavailablePhoneNumberResult
  }

  const candidates = phoneNumberAvailability.phoneNumbers

  if (
    phoneNumberAvailability.totalPhoneNumberCount === 1 &&
    candidates.length === 1
  ) {
    const [phoneNumber] = candidates
    if (!phoneNumber) {
      throw new ChatbotXException(messages.noPhoneNumberFound)
    }

    return {
      source: "direct",
      accessToken,
      wabaId: targets.wabaId,
      businessId: input.businessId ?? targets.businessId,
      phoneNumber,
    }
  }

  return {
    source: "selection_required",
    result: await createPhoneNumberSelectionResult({
      userId,
      ownerId,
      workspaceId: input.workspaceId || null,
      wabaId: targets.wabaId,
      businessId: input.businessId ?? targets.businessId,
      accessToken,
      version: whatsappSettings.version,
      candidates,
    }),
  }
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

async function persistIntegration(params: {
  tx: Transaction
  ownerId: string
  userId: string
  workspaceId: string | null | undefined
  integrationId: string
  phoneNumber: WhatsappPhoneNumber
  wabaId: string
  businessId: string
  auth: WhatsappAuthValue
  isCoexist: boolean
  platformType: string
  messages: ConnectErrorMessages
}): Promise<{
  workspaceId: string
  createdWorkspace: boolean
  integrationRow: IntegrationWhatsappModel
}> {
  const {
    tx,
    ownerId,
    userId,
    workspaceId,
    integrationId,
    phoneNumber,
    wabaId,
    businessId,
    auth,
    isCoexist,
    platformType,
    messages,
  } = params

  let resolvedWorkspaceId = workspaceId
  let createdWorkspace = false

  if (!resolvedWorkspaceId) {
    const workspace = await workspaceService.create({
      tx,
      createdBy: userId,
      data: {
        name: phoneNumber.verified_name,
        timezone: "UTC",
        ownerId: userId,
      },
    })
    resolvedWorkspaceId = workspace.id
    createdWorkspace = true
  }

  const displayPhoneNumber = normalizeWhatsappDisplayPhoneNumber(
    phoneNumber.display_phone_number,
  )
  const phoneName = phoneNumber.verified_name.trim() || displayPhoneNumber

  let integrationRow: IntegrationWhatsappModel | undefined

  await connectChannelIntegration({
    tx,
    ownerId,
    inboxData: {
      id: createId(),
      workspaceId: resolvedWorkspaceId,
      channel: "whatsapp",
      sourceId: phoneNumber.id,
      name: phoneName,
    },
    insertIntegration: async (inboxId) => {
      const [row] = await tx
        .insert(integrationWhatsappModel)
        .values({
          id: integrationId,
          workspaceId: resolvedWorkspaceId as string,
          inboxId,
          auth,
          phoneNumberId: phoneNumber.id,
          wabaId,
          businessId,
          name: phoneName,
          displayPhoneNumber,
          isCoexist,
          platformType,
          registrationStatus: "pending_verification",
        })
        .onConflictDoUpdate({
          target: [integrationWhatsappModel.inboxId],
          set: {
            name: phoneName,
            displayPhoneNumber,
            isCoexist,
            platformType,
            updatedAt: new Date(),
          },
        })
        .returning()
      integrationRow = row
    },
  })

  if (!integrationRow) {
    throw new ChatbotXException(messages.failedToPersistIntegration)
  }

  return {
    workspaceId: resolvedWorkspaceId,
    createdWorkspace,
    integrationRow,
  }
}

/**
 * Writes the integration and spends the signup session as one unit.
 *
 * `ensurePhoneNumberNotConnected` ran several network calls ago, so a
 * concurrent connect can still reach the insert first. The unique index turns
 * that into a constraint violation, which is the same user-visible situation
 * the pre-flight check reports.
 */
async function connectInTransaction(
  params: Omit<Parameters<typeof persistIntegration>[0], "tx" | "messages"> & {
    signupSessionClaim?: SignupSessionClaim
    messages: ConnectErrorMessages
  },
): Promise<Awaited<ReturnType<typeof persistIntegration>>> {
  const { signupSessionClaim, messages, ...persistParams } = params

  try {
    return await db.transaction(async (tx) => {
      await spendSignupSession(signupSessionClaim, tx, messages)

      return persistIntegration({ tx, ...persistParams, messages })
    })
  } catch (err) {
    if (isUniqueViolationError(err, WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT)) {
      throw new ChatbotXException(messages.phoneNumberAlreadyConnected)
    }

    throw err
  }
}

async function subscribeManualWebhook(
  auth: WhatsappAuthValue,
  integrationId: string,
): Promise<void> {
  try {
    await subscribeWebhook({ auth, overrideCallbackUrl: true })

    await db
      .update(integrationWhatsappModel)
      .set({
        auth: {
          ...auth,
          metadata: { ...auth.metadata, subscribeOverrideOk: true },
        },
      })
      .where(eq(integrationWhatsappModel.id, integrationId))

    logger.info("subscribeWebhook")
  } catch (err) {
    logger.error({ err }, "Failed to subscribe webhook")
  }
}

function buildResult(params: {
  isManual: boolean
  isCoexist: boolean
  workspaceId: string
  integrationId: string
  webhookUrl: string
  verifyToken: string
  phoneNumber: WhatsappPhoneNumber
  requiresPhoneVerification: boolean
  registrationError?: IntegrationWhatsappModel["registrationError"] | null
}): ConnectWhatsappResult {
  const {
    isManual,
    isCoexist,
    workspaceId,
    integrationId,
    webhookUrl,
    verifyToken,
    phoneNumber,
    requiresPhoneVerification,
    registrationError,
  } = params

  // Meta asking for a verification code is the whole reason to show the
  // verification panel. It usually comes with an explanatory error, but not
  // always — gating on the error too would silently redirect the operator away
  // from the only screen that can finish the connect.
  if (requiresPhoneVerification) {
    return {
      type: CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_VERIFICATION_REQUIRED,
      redirectUrl: `/space/${workspaceId}`,
      integrationId,
      workspaceId,
      displayPhoneNumber: phoneNumber.display_phone_number,
      verifiedName: phoneNumber.verified_name,
      registrationError: registrationError ?? null,
    }
  }

  if (isManual) {
    return {
      type: CONNECT_WHATSAPP_RESULT_TYPES.MANUAL_RESULT,
      data: { integrationId, workspaceId, webhookUrl, verifyToken },
    }
  }

  return {
    type: CONNECT_WHATSAPP_RESULT_TYPES.REDIRECT,
    redirectUrl: `/space/${workspaceId}`,
    integrationId,
    workspaceId,
    isCoexist,
  }
}

export const connectWhatsappAction = authActionClient
  .inputSchema(connectWhatsappSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: ConnectWhatsappSchema
    }): Promise<ConnectWhatsappResult> => {
      const t = await getTranslations()
      const messages: ConnectErrorMessages = {
        accessTokenRequired: t("whatsapp.connect.errors.accessTokenRequired"),
        appSettingsNotFound: t("whatsapp.connect.errors.appSettingsNotFound"),
        failedToPersistIntegration: t(
          "whatsapp.connect.errors.failedToPersistIntegration",
        ),
        noPhoneNumberFound: t("whatsapp.connect.errors.noPhoneNumberFound"),
        noPhoneNumbersFound: t("whatsapp.connect.errors.noPhoneNumbersFound"),
        phoneNumberAlreadyConnected: t("channels.duplicated.whatsapp"),
        phoneNumberNotFound: t("whatsapp.connect.errors.phoneNumberNotFound"),
        signupSessionExpired: t("whatsapp.signupSessionExpired"),
        unableToVerifyToken: t("whatsapp.connect.errors.unableToVerifyToken"),
        wabaMismatch: t("whatsapp.connect.errors.wabaMismatch"),
        wabaResolveFailed: t("whatsapp.connect.errors.wabaResolveFailed"),
      }

      try {
        const ownerId = await resolvePlatformOwnerId({
          userId: ctx.user.id,
          workspaceId: parsedInput.workspaceId,
        })
        const whatsappCredential =
          await platformCredentialService.resolveForOwner({
            ownerId,
            type: "whatsapp",
          })

        if (!whatsappCredential) {
          throw new ChatbotXException(messages.appSettingsNotFound)
        }
        const whatsappSettings = whatsappCredential.config

        const isManual = parsedInput.manualConnect

        const preparedInput = await prepareConnectInput({
          input: parsedInput,
          whatsappSettings,
          ownerId,
          userId: ctx.user.id,
          messages,
        })
        if (preparedInput.source === "selection_required") {
          return preparedInput.result
        }

        const { accessToken, wabaId, businessId, phoneNumber } = preparedInput
        await ensurePhoneNumberNotConnected(phoneNumber.id, messages)

        // Provider-facing URLs (the webhook override_callback_uri sent to Meta on
        // manual connect, and the stored OAuth redirectUrl) must live on the fixed
        // broker / canonical host registered with Meta — never the white-label
        // custom domain the request arrived on, which Meta cannot reach or trust.
        // Mirrors the broker pattern used by messenger/instagram (lib/oauth-broker.ts).
        const originUrl = getBrokerOrigin()
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

        if (!isManual) {
          await setupOAuthResources(auth, whatsappSettings)
        }

        // Resolve Meta-truth eligibility: the form only carries user intent, but
        // Meta only places the phone in coexist mode when the app's config_id is
        // registered for the whatsapp_business_app_onboarding solution AND the
        // number is a WhatsApp Business App number. Calling /smb_app_data on a
        // non-eligible phone yields error 131000/10. Gate on the same helper the
        // browser used to pick `featureType`, so the two can never disagree.
        let isCoexist = false
        let platformType = ""
        if (isCoexistOnboardingIntent(parsedInput)) {
          try {
            const eligibility = await getCoexistEligibility({
              phoneNumberId: phoneNumber.id,
              accessToken,
              version: whatsappSettings.version,
            })

            if (
              eligibility.isOnBizApp &&
              eligibility.platformType === "CLOUD_API"
            ) {
              isCoexist = true
            }

            platformType = eligibility.platformType
          } catch (err) {
            logger.warn(
              { err, phoneNumberId: phoneNumber.id },
              "[wa-connect] coexist eligibility check failed",
            )
          }
        }

        const { workspaceId, integrationRow } = await connectInTransaction({
          signupSessionClaim: preparedInput.signupSessionClaim,
          messages,
          ownerId,
          userId: ctx.user.id,
          workspaceId: parsedInput.workspaceId,
          integrationId,
          phoneNumber,
          wabaId,
          businessId,
          auth,
          isCoexist,
          platformType,
        })

        await integrationWhatsappService.refreshCapiScopeCache({
          id: integrationRow.id,
          workspaceId,
          maxAgeMs: 0,
          checkScope: (scopeInput) =>
            hasWhatsappCapiScope({
              ...scopeInput,
              appAccessToken: `${whatsappSettings.clientId}|${whatsappSettings.clientSecret}`,
            }),
        })

        let registrationError:
          | IntegrationWhatsappModel["registrationError"]
          | null = null
        let requiresPhoneVerification = false
        if (!isCoexist) {
          const registrationResult = await registerPhoneNumber({
            auth,
            phoneNumberId: phoneNumber.id,
          })
          requiresPhoneVerification =
            registrationResult.status === "verification_required"
          const outcome = toRegistrationOutcome(registrationResult)
          registrationError =
            await integrationWhatsappService.recordRegistrationOutcome({
              id: integrationRow.id,
              workspaceId,
              outcome,
            })
        }

        const whatsappCtx = await buildContext({
          workspaceId,
          integrationType: "whatsapp",
          integration: { ...integrationRow, auth },
        })
        await updateWorkspaceLogo({
          id: workspaceId,
          integration: integrationWhatsapp,
          ctx: whatsappCtx,
        })

        await subscribeWebhook({ auth })

        if (isManual) {
          await subscribeManualWebhook(auth, integrationId)
        }

        await invalidateCacheByTags([`users:${ctx.user.id}:workspace-members`])

        return buildResult({
          isManual,
          isCoexist,
          workspaceId,
          integrationId,
          webhookUrl,
          verifyToken,
          phoneNumber,
          requiresPhoneVerification,
          registrationError,
        })
      } catch (err: unknown) {
        logger.error({ err }, "Unable to verify whatsapp token")

        if (err instanceof ChatbotXException) {
          throw err
        }

        if (err instanceof SdkException) {
          throw err
        }

        throw new ChatbotXException(messages.unableToVerifyToken)
      }
    },
  )
