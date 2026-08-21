"use server"

import {
  integrationWhatsappService,
  platformCredentialService,
  WHATSAPP_CAPI_SCOPE,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  exchangeAccessToken,
  getSharedWabaId,
} from "@chatbotx.io/integration-whatsapp/api/auth"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { findWaba } from "@chatbotx.io/integration-whatsapp/api/waba"
import { subscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { hasWhatsappCapiScope } from "@/features/integration-whatsapp/libs/capi-scope"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl, getBrokerOrigin } from "@/lib/oauth-broker"
import { workspaceActionClient } from "@/lib/safe-action"
import { WHATSAPP_OAUTH_CALLBACK_PATH } from "../libs/embedded-signup"
import { buildAuthValue, buildWebhookConfig } from "./webhook-url"

const reconnectWhatsappSchema = z.object({
  code: z.string().trim().min(1),
})

type ReconnectTranslations = Awaited<ReturnType<typeof getTranslations>>
type ExistingWhatsappIntegration = NonNullable<
  Awaited<
    ReturnType<typeof integrationWhatsappService.findWorkspaceIntegration>
  >
>
async function findReconnectTarget(input: {
  integrationWhatsappId: string
  workspaceId: string
  t: ReconnectTranslations
}): Promise<ExistingWhatsappIntegration> {
  const existing = await integrationWhatsappService.findWorkspaceIntegration({
    id: input.integrationWhatsappId,
    workspaceId: input.workspaceId,
  })
  if (!existing) {
    throw new ChatbotXException(input.t("whatsapp.reconnect.errors.notFound"))
  }

  return existing
}

async function resolveWhatsappSettings(input: {
  ownerId: string
  t: ReconnectTranslations
}): Promise<WhatsappCredential> {
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: input.ownerId,
    type: "whatsapp",
  })
  if (!credential) {
    throw new ChatbotXException(
      input.t("whatsapp.connect.errors.appSettingsNotFound"),
    )
  }

  return credential.config
}

async function exchangeAndValidateWhatsappAccount(input: {
  code: string
  existing: ExistingWhatsappIntegration
  t: ReconnectTranslations
  whatsappSettings: WhatsappCredential
}) {
  const accessToken = (
    await exchangeAccessToken(
      input.whatsappSettings,
      input.code,
      buildBrokerCallbackUrl(WHATSAPP_OAUTH_CALLBACK_PATH),
    )
  ).access_token
  const appAccessToken = `${input.whatsappSettings.clientId}|${input.whatsappSettings.clientSecret}`
  const wabaId = await getSharedWabaId(accessToken, appAccessToken)
  if (!wabaId) {
    throw new ChatbotXException(
      input.t("whatsapp.connect.errors.wabaResolveFailed"),
    )
  }
  if (wabaId !== input.existing.wabaId) {
    throw new ChatbotXException(
      input.t("whatsapp.reconnect.errors.wabaMismatch"),
    )
  }

  const [waba, phoneNumbers] = await Promise.all([
    findWaba({
      wabaId,
      accessToken,
      version: input.whatsappSettings.version,
      fields: "owner_business_info",
    }),
    whatsappListPhoneNumbers({
      wabaId,
      accessToken,
      version: input.whatsappSettings.version,
    }),
  ])
  const phoneNumber = phoneNumbers.data.find(
    (candidate) => candidate.id === input.existing.phoneNumberId,
  )
  if (!phoneNumber) {
    throw new ChatbotXException(
      input.t("whatsapp.reconnect.errors.phoneNumberMismatch"),
    )
  }

  return { accessToken, appAccessToken, wabaId, waba, phoneNumber }
}

async function buildReconnectAuth(input: {
  accessToken: string
  appAccessToken: string
  existing: ExistingWhatsappIntegration
  integrationWhatsappId: string
  waba: Awaited<ReturnType<typeof findWaba>>
  wabaId: string
  whatsappSettings: WhatsappCredential
  phoneNumber: Awaited<
    ReturnType<typeof whatsappListPhoneNumbers>
  >["data"][number]
}) {
  const originUrl = getBrokerOrigin()
  const webhookConfig = buildWebhookConfig({
    isManual: false,
    integrationId: input.integrationWhatsappId,
    originUrl,
    whatsappSettings: input.whatsappSettings,
  })
  const auth = await buildAuthValue({
    whatsappSettings: input.whatsappSettings,
    accessToken: input.accessToken,
    verifyToken: webhookConfig.verifyToken,
    webhookUrl: webhookConfig.webhookUrl,
    originUrl,
    wabaId: input.wabaId,
    phoneNumber: input.phoneNumber,
    businessId: input.waba.owner_business_info?.id ?? input.existing.businessId,
    isManual: false,
  })
  const hasCapiScope = await hasWhatsappCapiScope({
    accessToken: input.accessToken,
    appAccessToken: input.appAccessToken,
    wabaId: input.wabaId,
  })

  return { auth, hasCapiScope }
}

async function persistReconnectAuthAndResubscribe(input: {
  auth: Awaited<ReturnType<typeof buildAuthValue>>
  hasCapiScope: boolean
  integrationWhatsappId: string
  workspaceId: string
}): Promise<boolean> {
  await integrationWhatsappService.replaceAuth({
    id: input.integrationWhatsappId,
    workspaceId: input.workspaceId,
    auth: input.auth,
    hasCapiScope: input.hasCapiScope,
  })
  let resubscribed = true
  try {
    await subscribeWebhook({
      auth: input.auth,
      includeAutomaticEvents: true,
    })
  } catch (err) {
    resubscribed = false
    logger.warn(
      {
        err,
        integrationWhatsappId: input.integrationWhatsappId,
        workspaceId: input.workspaceId,
      },
      "Unable to resubscribe WhatsApp webhook after reconnect",
    )
  }

  return resubscribed
}

async function reconnectWhatsapp(input: {
  code: string
  ctx: { workspace: WorkspaceModel }
  integrationWhatsappId: string
  workspaceId: string
}) {
  const t = await getTranslations()
  await assertWorkspaceSuperAdmin(input.workspaceId)

  const existing = await findReconnectTarget({
    integrationWhatsappId: input.integrationWhatsappId,
    workspaceId: input.workspaceId,
    t,
  })
  const whatsappSettings = await resolveWhatsappSettings({
    ownerId: input.ctx.workspace.ownerId,
    t,
  })

  const { accessToken, appAccessToken, wabaId, waba, phoneNumber } =
    await exchangeAndValidateWhatsappAccount({
      code: input.code,
      existing,
      t,
      whatsappSettings,
    })
  const { auth, hasCapiScope } = await buildReconnectAuth({
    accessToken,
    appAccessToken,
    existing,
    integrationWhatsappId: input.integrationWhatsappId,
    waba,
    wabaId,
    whatsappSettings,
    phoneNumber,
  })

  const resubscribed = await persistReconnectAuthAndResubscribe({
    auth,
    hasCapiScope,
    integrationWhatsappId: input.integrationWhatsappId,
    workspaceId: input.workspaceId,
  })

  return {
    ok: true,
    hasCapiScope,
    scope: WHATSAPP_CAPI_SCOPE,
    resubscribed,
  }
}

export const reconnectWhatsappAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(reconnectWhatsappSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
      ctx,
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      ctx: { workspace: WorkspaceModel }
      parsedInput: z.infer<typeof reconnectWhatsappSchema>
    }) =>
      await reconnectWhatsapp({
        code: parsedInput.code,
        ctx,
        integrationWhatsappId,
        workspaceId,
      }),
  )
