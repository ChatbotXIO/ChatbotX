"use server"

import { organizationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, type Transaction } from "@chatbotx.io/database/client"
import {
  inboxStatuses,
  type WhatsappSettingsSchema,
} from "@chatbotx.io/database/partials"

import {
  inboxModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { OrganizationModel, UserModel } from "@chatbotx.io/database/types"
import {
  addSystemUser,
  registerPhoneNumber,
  shareCreditLine,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import {
  debugToken,
  exchangeAccessToken,
} from "@chatbotx.io/integration-whatsapp/api/auth"
import {
  type WhatsappPhoneNumber,
  listPhoneNumbers as whatsappListPhoneNumbers,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { subscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { createSimpleWorkspace } from "@/features/workspaces/actions/create-workspace-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { getDomainFromHeader, getOriginUrlFromHeader } from "@/lib/domain"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectWhatsappResult,
  type ConnectWhatsappSchema,
  connectWhatsappSchema,
} from "../schemas"

async function resolveAccessToken(
  input: ConnectWhatsappSchema,
  whatsappSettings: WhatsappSettingsSchema,
): Promise<string> {
  if (input.accessToken) {
    return input.accessToken
  }

  if (input.code) {
    const exchangeResult = await exchangeAccessToken(
      whatsappSettings,
      input.code,
    )
    return exchangeResult.access_token
  }

  throw new ChatbotXException("Access token is required")
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

function buildWebhookConfig(params: {
  isManual: boolean
  integrationId: string
  originUrl: string
  whatsappSettings: WhatsappSettingsSchema
}): { webhookUrl: string; verifyToken: string } {
  const { isManual, integrationId, originUrl, whatsappSettings } = params

  if (isManual) {
    return {
      verifyToken: crypto.randomUUID(),
      webhookUrl: new URL(
        `/integrations/whatsapp/webhook/${integrationId}`,
        originUrl,
      ).toString(),
    }
  }

  return {
    verifyToken: whatsappSettings.verifyToken,
    webhookUrl: new URL("/integrations/whatsapp/webhook", originUrl).toString(),
  }
}

async function buildAuthValue(params: {
  whatsappSettings: WhatsappSettingsSchema
  accessToken: string
  verifyToken: string
  webhookUrl: string
  originUrl: string
  wabaId: string
  phoneNumber: WhatsappPhoneNumber
  businessId: string
  isManual: boolean
}): Promise<WhatsappAuthValue> {
  const {
    whatsappSettings,
    accessToken,
    verifyToken,
    webhookUrl,
    originUrl,
    wabaId,
    phoneNumber,
    businessId,
    isManual,
  } = params

  let redirectUrl = webhookUrl

  if (!isManual) {
    redirectUrl = new URL(
      "integrations/whatsapp/callback",
      originUrl,
    ).toString()
  }

  const metadata: WhatsappAuthValue["metadata"] = {
    wabaId,
    phoneNumber,
    businessId,
    webhookUrl,
  }

  if (isManual) {
    metadata.isManual = true

    whatsappSettings.clientSecret = ""

    const tokenData = await debugToken(accessToken)
    whatsappSettings.clientId = tokenData?.app_id ?? ""
  }

  return {
    clientId: whatsappSettings.clientId,
    clientSecret: whatsappSettings.clientSecret,
    verifyToken,
    redirectUrl,
    authType: AuthType.oauth2,
    tokens: { accessToken },
    metadata,
  }
}

async function setupOAuthResources(
  auth: WhatsappAuthValue,
  whatsappSettings: WhatsappSettingsSchema,
): Promise<void> {
  await addSystemUser({ auth, whatsappSettings })
  console.info("addSystemUser")

  if (whatsappSettings.businessId) {
    await shareCreditLine({ auth, whatsappSettings })
    console.info("shareCreditLine")
  }
}

async function persistIntegration(params: {
  tx: Transaction
  userId: string
  organization: OrganizationModel
  workspaceId: string | null | undefined
  integrationId: string
  phoneNumber: WhatsappPhoneNumber
  wabaId: string
  businessId: string
  auth: WhatsappAuthValue
}): Promise<string> {
  const {
    tx,
    userId,
    organization,
    workspaceId,
    integrationId,
    phoneNumber,
    wabaId,
    businessId,
    auth,
  } = params

  let resolvedWorkspaceId = workspaceId

  if (!resolvedWorkspaceId) {
    const workspace = await createSimpleWorkspace(tx, userId, organization, {
      name: phoneNumber.verified_name,
      timezone: "UTC",
      organizationId: organization.id,
    })
    resolvedWorkspaceId = workspace.id
  }

  const inbox = await tx
    .insert(inboxModel)
    .values({
      id: createId(),
      workspaceId: resolvedWorkspaceId,
      channel: "whatsapp",
      sourceId: phoneNumber.id,
      name: phoneNumber.verified_name,
    })
    .onConflictDoUpdate({
      target: [inboxModel.workspaceId, inboxModel.channel, inboxModel.sourceId],
      set: { status: inboxStatuses.enum.connected },
    })
    .returning()
    .then((result) => result[0])

  await tx
    .insert(integrationWhatsappModel)
    .values({
      id: integrationId,
      workspaceId: resolvedWorkspaceId,
      inboxId: inbox.id,
      auth,
      phoneNumberId: phoneNumber.id,
      wabaId,
      businessId,
      name: phoneNumber.verified_name,
    })
    .onConflictDoUpdate({
      target: [integrationWhatsappModel.inboxId],
      set: { updatedAt: new Date() },
    })

  return resolvedWorkspaceId
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

    console.info("subscribeWebhook")
  } catch (subscribeError) {
    console.error(subscribeError, "Failed to subscribe webhook")
  }
}

function buildResult(params: {
  isManual: boolean
  workspaceId: string
  integrationId: string
  webhookUrl: string
  verifyToken: string
}): ConnectWhatsappResult {
  const { isManual, workspaceId, integrationId, webhookUrl, verifyToken } =
    params

  if (isManual) {
    return {
      type: "manualResult",
      data: { integrationId, workspaceId, webhookUrl, verifyToken },
    }
  }

  return {
    type: "redirect",
    redirectUrl: `/space/${workspaceId}/dashboard`,
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
        const domain = await getDomainFromHeader()
        const organization = await organizationService.findByDomain(domain)
        const whatsappSettings = organization.settings.whatsapp

        if (!whatsappSettings) {
          throw new ChatbotXException("Whatsapp App settings not found")
        }

        const accessToken = await resolveAccessToken(
          parsedInput,
          whatsappSettings,
        )

        const phoneNumber = await fetchAndValidatePhoneNumber({
          wabaId: parsedInput.wabaId,
          phoneNumberId: parsedInput.phoneNumberId,
          accessToken,
          version: whatsappSettings.version,
        })

        await ensurePhoneNumberNotConnected(phoneNumber.id)

        const originUrl = await getOriginUrlFromHeader()
        const integrationId = createId()
        const isManual = parsedInput.manualConnect
        const businessId = parsedInput.businessId ?? ""

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
          wabaId: parsedInput.wabaId,
          phoneNumber,
          businessId,
          isManual,
        })

        if (!isManual) {
          await setupOAuthResources(auth, whatsappSettings)
        }

        await registerPhoneNumber({ auth })
        console.info("registerPhoneNumber")

        const workspaceId = await db.transaction((tx) =>
          persistIntegration({
            tx,
            userId: ctx.user.id,
            organization,
            workspaceId: parsedInput.workspaceId,
            integrationId,
            phoneNumber,
            wabaId: parsedInput.wabaId,
            businessId,
            auth,
          }),
        )

        await subscribeWebhook({ auth })

        if (isManual) {
          await subscribeManualWebhook(auth, integrationId)
        }

        revalidateCacheTags(`users:${ctx.user.id}#workspaceMembers`)

        return buildResult({
          isManual,
          workspaceId,
          integrationId,
          webhookUrl,
          verifyToken,
        })
      } catch (err: unknown) {
        console.error(err, "Unable to verify whatsapp token")

        if (err instanceof ChatbotXException) {
          throw err
        }

        throw new ChatbotXException("Unable to verify Whatsapp token")
      }
    },
  )
