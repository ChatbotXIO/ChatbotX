import { createHash } from "node:crypto"
import { buildContext, integrationKlaviyoService } from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { KlaviyoSyncProfileSchema } from "@chatbotx.io/flow-config"
import {
  KLAVIYO_HTTP_TIMEOUT_MS,
  KlaviyoApiError,
  klaviyoAuthSchema,
  integration as klaviyoIntegration,
  klaviyoSyncProfilePropsSchema,
} from "@chatbotx.io/integration-klaviyo"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

export const KLAVIYO_LOCK_TIMEOUT_SECONDS = 30
const WHITESPACE_PATTERN = /\s+/u
const E164_PATTERN = /^\+[1-9]\d{7,14}$/u

if (KLAVIYO_HTTP_TIMEOUT_MS >= KLAVIYO_LOCK_TIMEOUT_SECONDS * 1000) {
  throw new Error("Klaviyo HTTP timeout must be shorter than lock TTL")
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const nonEmpty = (value: string | undefined) => value?.trim() || undefined

const normalizePhone = (value: string | undefined) => {
  const phone = nonEmpty(value)?.replaceAll(/\s/gu, "")
  if (!phone) {
    return
  }
  const candidate = phone.startsWith("00") ? `+${phone.slice(2)}` : phone
  return E164_PATTERN.test(candidate) ? candidate : undefined
}

export const buildKlaviyoProfileProps = (
  fields: Record<string, string>,
  step: KlaviyoSyncProfileSchema,
) => {
  const email = nonEmpty(fields[step.emailField])?.toLowerCase()
  if (!email) {
    throw new Error("Klaviyo profile email is empty")
  }
  const fullName = nonEmpty(fields[systemFieldTypes.enum.full_name])
  const [firstToken, ...lastTokens] = fullName?.split(WHITESPACE_PATTERN) ?? []
  const first_name =
    nonEmpty(fields[systemFieldTypes.enum.first_name]) || nonEmpty(firstToken)
  const last_name =
    nonEmpty(fields[systemFieldTypes.enum.last_name]) ||
    nonEmpty(lastTokens.join(" "))
  const phone_number = normalizePhone(fields[systemFieldTypes.enum.phone])
  const title = step.titleField ? nonEmpty(fields[step.titleField]) : undefined
  const organization = step.orgField
    ? nonEmpty(fields[step.orgField])
    : undefined
  const properties = Object.fromEntries(
    step.mergeFields.flatMap((mapping) => {
      const value = nonEmpty(fields[mapping.contactFieldId])
      return value ? [[mapping.klaviyoProperty, value]] : []
    }),
  )

  return klaviyoSyncProfilePropsSchema.parse({
    email,
    ...(first_name ? { first_name } : {}),
    ...(last_name ? { last_name } : {}),
    ...(phone_number ? { phone_number } : {}),
    ...(title ? { title } : {}),
    ...(organization ? { organization } : {}),
    ...(Object.keys(properties).length ? { properties } : {}),
    ...(step.listId ? { listId: step.listId } : {}),
  })
}

export const syncKlaviyoProfile = async (
  props: ExecuteStepProps<KlaviyoSyncProfileSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    listId: step.listId,
    operation: "syncProfile",
  }
  try {
    const [row, fields] = await Promise.all([
      integrationKlaviyoService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      klaviyoAuthSchema,
    )
    const profile = buildKlaviyoProfileProps(fields, step)
    const ctx = await buildContext({
      workspaceId: conversation.workspaceId,
      integrationType: "klaviyo",
      integration: { ...row, auth },
    })
    logger.info(logContext, "Starting Klaviyo profile sync")
    await distributedLock.runExclusive({
      key: `klaviyo:sync-profile:${hash(String(conversation.workspaceId))}:${hash(profile.email)}`,
      timeoutInSeconds: KLAVIYO_LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        const result = await klaviyoIntegration.runAction("syncProfile", {
          ctx,
          props: profile,
        })
        logger.info(
          { ...logContext, profileId: result.profileId },
          "Klaviyo profile sync completed",
        )
      },
    })
    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    const provider =
      error instanceof KlaviyoApiError
        ? {
            providerStatus: error.statusCode,
            retryAfterSeconds: error.retryAfterSeconds,
          }
        : {}
    logger.error(
      { ...logContext, ...provider, err: normalized },
      "Klaviyo profile sync failed",
    )
    await logProviderError({
      provider: "klaviyo",
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      error,
    })
    return { status: "error", result: null, errorMessage: normalized.message }
  }
}
