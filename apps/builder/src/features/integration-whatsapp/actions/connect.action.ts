"use server"

import {
  buildContext,
  connectChannelIntegration,
  inboxService,
  integrationWhatsappService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, type Transaction } from "@chatbotx.io/database/client"
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
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
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl, getBrokerOrigin } from "@/lib/oauth-broker"
import { authActionClient } from "@/lib/safe-action"
import {
  isCoexistOnboardingIntent,
  WHATSAPP_OAUTH_CALLBACK_PATH,
} from "../libs/embedded-signup"
import { buildWhatsappPhoneName } from "../libs/phone-name"
import { toRegistrationOutcome } from "../libs/registration-outcome"
import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type ConnectWhatsappSchema,
  connectWhatsappSchema,
  WHATSAPP_OAUTH_CODE_SOURCES,
  type WhatsappPhoneNumberOption,
} from "../schemas"
import { buildAuthValue, buildWebhookConfig } from "./webhook-url"

async function resolveAccessToken(
  input: ConnectWhatsappSchema,
  whatsappSettings: WhatsappCredential,
): Promise<string> {
  if (input.accessToken) {
    return input.accessToken
  }

  if (input.code) {
    const redirectUri =
      input.oauthCodeSource === WHATSAPP_OAUTH_CODE_SOURCES.SDK
        ? undefined
        : buildBrokerCallbackUrl(WHATSAPP_OAUTH_CALLBACK_PATH)

    const exchangeResult = await exchangeAccessToken(
      whatsappSettings,
      input.code,
      redirectUri,
    )
    return exchangeResult.access_token
  }

  throw new ChatbotXException("Access token is required")
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
): Promise<{
  wabaId: string
  businessId: string
}> {
  const wabaId = await getSharedWabaId(accessToken, appAccessToken)
  if (!wabaId) {
    throw new ChatbotXException(
      "Could not resolve WhatsApp Business Account from authorization",
    )
  }

  const waba = await findWaba({
    wabaId,
    acessToken: accessToken,
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
}): Promise<WhatsappPhoneNumber> {
  const { wabaId, phoneNumberId, accessToken, version } = params

  const phoneNumbers = await whatsappListPhoneNumbers({
    wabaId,
    accessToken,
    version,
  })

  if (phoneNumbers.data.length === 0) {
    throw new ChatbotXException("No phone numbers found")
  }

  const foundPhoneNumber = phoneNumbers.data.find(
    (phoneNumber) => phoneNumber.id === phoneNumberId,
  )

  if (!foundPhoneNumber) {
    throw new ChatbotXException("Phone number not found")
  }

  return foundPhoneNumber
}

async function ensurePhoneNumberNotConnected(
  phoneNumberId: string,
): Promise<void> {
  const connectedPhoneNumberIds =
    await integrationWhatsappService.findConnectedPhoneNumberIds([
      phoneNumberId,
    ])

  if (connectedPhoneNumberIds.has(phoneNumberId)) {
    throw new ChatbotXException("Phone number is already connected")
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

async function listConnectablePhoneNumbers(params: {
  wabaId: string
  accessToken: string
  version: string
}): Promise<WhatsappPhoneNumber[]> {
  const response = await whatsappListPhoneNumbers(params)
  if (response.data.length === 0) {
    return []
  }

  const connectedPhoneNumberIds =
    await integrationWhatsappService.findConnectedPhoneNumberIds(
      response.data.map((phoneNumber) => phoneNumber.id),
    )

  return response.data.filter(
    (phoneNumber) => !connectedPhoneNumberIds.has(phoneNumber.id),
  )
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

type PreparedConnectInput =
  | {
      source: "direct"
      accessToken: string
      wabaId: string
      businessId: string
      phoneNumber: WhatsappPhoneNumber
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
}): Promise<PreparedConnectInput> {
  const { input, whatsappSettings, ownerId, userId } = params

  if (input.signupSessionId) {
    const consumedSession =
      await integrationWhatsappService.consumeSignupSession({
        id: input.signupSessionId,
        userId,
        ownerId,
        phoneNumberId: input.phoneNumberId ?? "",
      })

    if (!consumedSession) {
      throw new ChatbotXException("Whatsapp signup session expired")
    }

    return {
      source: "direct",
      accessToken: consumedSession.accessToken,
      wabaId: consumedSession.wabaId,
      businessId: consumedSession.businessId,
      phoneNumber: await fetchAndValidatePhoneNumber({
        wabaId: consumedSession.wabaId,
        phoneNumberId: input.phoneNumberId ?? "",
        accessToken: consumedSession.accessToken,
        version: consumedSession.apiVersion,
      }),
    }
  }

  const accessToken = await resolveAccessToken(input, whatsappSettings)

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
      }),
    }
  }

  const targets = await deriveSignupTargets(
    accessToken,
    `${whatsappSettings.clientId}|${whatsappSettings.clientSecret}`,
    whatsappSettings.version,
  )

  if (input.wabaId && input.wabaId !== targets.wabaId) {
    throw new ChatbotXException(
      "Selected WhatsApp Business Account does not match authorization",
    )
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
      }),
    }
  }

  const candidates = await listConnectablePhoneNumbers({
    wabaId: targets.wabaId,
    accessToken,
    version: whatsappSettings.version,
  })

  if (candidates.length === 0) {
    return {
      source: "selection_required",
      result: {
        type: CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES,
        ...(input.workspaceId
          ? { redirectUrl: `/space/${input.workspaceId}/settings/channels` }
          : {}),
      },
    }
  }

  if (candidates.length === 1) {
    const [phoneNumber] = candidates
    if (!phoneNumber) {
      throw new ChatbotXException("No phone number found")
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
  const basePhoneName = phoneNumber.verified_name.trim() || displayPhoneNumber
  const hasWorkspaceDuplicateName =
    await inboxService.existsByWorkspaceIdAndName({
      tx,
      workspaceId: resolvedWorkspaceId,
      name: basePhoneName,
    })
  const phoneName = buildWhatsappPhoneName({
    verifiedName: basePhoneName,
    displayPhoneNumber,
    hasWorkspaceDuplicateName,
  })

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
    throw new ChatbotXException("Failed to persist Whatsapp integration")
  }

  return {
    workspaceId: resolvedWorkspaceId,
    createdWorkspace,
    integrationRow,
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
}): ConnectWhatsappResult {
  const {
    isManual,
    isCoexist,
    workspaceId,
    integrationId,
    webhookUrl,
    verifyToken,
  } = params

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
      try {
        const ownerId = parsedInput.workspaceId
          ? ((
              await workspaceService.find({
                where: { id: parsedInput.workspaceId },
              })
            )?.ownerId ?? ctx.user.id)
          : ctx.user.id
        const whatsappCredential =
          await platformCredentialService.resolveForOwner({
            ownerId,
            type: "whatsapp",
          })

        if (!whatsappCredential) {
          throw new ChatbotXException("Whatsapp App settings not found")
        }
        const whatsappSettings = whatsappCredential.config

        const isManual = parsedInput.manualConnect

        const preparedInput = await prepareConnectInput({
          input: parsedInput,
          whatsappSettings,
          ownerId,
          userId: ctx.user.id,
        })
        if (preparedInput.source === "selection_required") {
          return preparedInput.result
        }

        const { accessToken, wabaId, businessId, phoneNumber } = preparedInput
        await ensurePhoneNumberNotConnected(phoneNumber.id)

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

        const { workspaceId, integrationRow } = await db.transaction((tx) =>
          persistIntegration({
            tx,
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
          }),
        )

        if (!isCoexist) {
          const registrationResult = await registerPhoneNumber({
            auth,
            phoneNumberId: phoneNumber.id,
          })
          const outcome = toRegistrationOutcome(registrationResult)
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
        })
      } catch (err: unknown) {
        logger.error({ err }, "Unable to verify whatsapp token")

        if (err instanceof ChatbotXException) {
          throw err
        }

        if (err instanceof SdkException) {
          throw err
        }

        throw new ChatbotXException("Unable to verify Whatsapp token")
      }
    },
  )
