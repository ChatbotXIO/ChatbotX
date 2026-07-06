"use server"

import {
  buildContext,
  connectChannelIntegration,
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
import { WHATSAPP_OAUTH_CALLBACK_PATH } from "../libs/embedded-signup"
import {
  type ConnectWhatsappResult,
  type ConnectWhatsappSchema,
  connectWhatsappSchema,
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
    // The code came from the Facebook OAuth dialog opened with an explicit
    // `redirect_uri` (the broker callback), so the exchange must echo the exact
    // same redirect_uri. Mirrors `buildFacebookOAuthDialogUrl`.
    const exchangeResult = await exchangeAccessToken(
      whatsappSettings,
      input.code,
      buildBrokerCallbackUrl(WHATSAPP_OAUTH_CALLBACK_PATH),
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
  phoneNumber: WhatsappPhoneNumber
  businessId: string
}> {
  const wabaId = await getSharedWabaId(accessToken, appAccessToken)
  if (!wabaId) {
    throw new ChatbotXException(
      "Could not resolve WhatsApp Business Account from authorization",
    )
  }

  // findWaba returns the phone numbers inline, so the caller can use the result
  // directly instead of round-tripping to /phone_numbers a second time.
  const waba = await findWaba({
    wabaId,
    acessToken: accessToken,
    version,
    fields: "owner_business_info,phone_numbers",
  })

  const phoneNumber = waba.phone_numbers?.data?.[0]
  if (!phoneNumber) {
    throw new ChatbotXException(
      "No phone number found on the WhatsApp Business Account",
    )
  }

  return {
    wabaId,
    phoneNumber,
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
  const existedPhoneNumber = await db.query.integrationWhatsappModel.findFirst({
    where: { phoneNumberId },
  })

  if (existedPhoneNumber) {
    throw new ChatbotXException("Phone number is already connected")
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

  let integrationRow: IntegrationWhatsappModel | undefined

  await connectChannelIntegration({
    tx,
    ownerId,
    inboxData: {
      id: createId(),
      workspaceId: resolvedWorkspaceId,
      channel: "whatsapp",
      sourceId: phoneNumber.id,
      name: phoneNumber.verified_name,
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
          name: phoneNumber.verified_name,
          displayPhoneNumber,
          isCoexist,
          platformType,
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
      type: "manualResult",
      data: { integrationId, workspaceId, webhookUrl, verifyToken },
    }
  }

  return {
    type: "redirect",
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

        const accessToken = await resolveAccessToken(
          parsedInput,
          whatsappSettings,
        )

        // Manual connect supplies the ids directly. The OAuth dialog returns only
        // a `code`, so derive the WABA / phone / business server-side from the
        // exchanged token when they are missing.
        let wabaId = parsedInput.wabaId ?? ""
        let businessId = parsedInput.businessId ?? ""
        let phoneNumber: WhatsappPhoneNumber

        if (isManual || (wabaId && parsedInput.phoneNumberId)) {
          phoneNumber = await fetchAndValidatePhoneNumber({
            wabaId,
            phoneNumberId: parsedInput.phoneNumberId ?? "",
            accessToken,
            version: whatsappSettings.version,
          })
        } else {
          const derived = await deriveSignupTargets(
            accessToken,
            `${whatsappSettings.clientId}|${whatsappSettings.clientSecret}`,
            whatsappSettings.version,
          )
          wabaId = derived.wabaId
          phoneNumber = derived.phoneNumber
          if (!businessId) {
            businessId = derived.businessId
          }
        }

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

        // Resolve Meta-truth eligibility: form field `transferPhoneNumber` is
        // user intent, but Meta only places the phone in coexist mode when the
        // app's config_id is registered for the whatsapp_business_app_onboarding
        // solution AND the number is a WhatsApp Business App number. Calling
        // /smb_app_data on a non-eligible phone yields error 131000/10.
        let isCoexist = false
        let platformType = ""
        if (parsedInput.transferPhoneNumber === true) {
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

        // Register the phone number on Cloud API via /register.
        // NOTE: we intentionally call this for coexist numbers too. Skipping it
        // leaves the number "not verified" on Cloud API and outbound sends fail
        // (verified empirically: phone-not-verified error disappears after /register).
        // RISK: Meta docs warn /register may push a fresh 2FA PIN for numbers still
        // active on the WhatsApp Business App. Validate on a real coexist number that
        // this does not lock the user out before wide rollout.
        if (!isCoexist) {
          await registerPhoneNumber({ auth })
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
