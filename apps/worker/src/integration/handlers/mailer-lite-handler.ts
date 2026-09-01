import { createHash } from "node:crypto"
import {
  buildContext,
  integrationMailerLiteService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { MailerLiteAddSubscriberSchema } from "@chatbotx.io/flow-config"
import {
  MAILER_LITE_HTTP_TIMEOUT_MS,
  MailerLiteApiError,
  mailerLiteAuthSchema,
  integration as mailerLiteIntegration,
} from "@chatbotx.io/integration-mailer-lite"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export const MAILER_LITE_LOCK_TIMEOUT_SECONDS = 30
const WHITESPACE_PATTERN = /\s+/u
if (MAILER_LITE_HTTP_TIMEOUT_MS >= MAILER_LITE_LOCK_TIMEOUT_SECONDS * 1000) {
  throw new Error("MailerLite HTTP timeout must be shorter than lock TTL")
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

const nonEmpty = (value: string | undefined) => value?.trim() || undefined

const reservedFields = (fields: Record<string, string>) => {
  const fullName = nonEmpty(fields[systemFieldTypes.enum.full_name])
  const [firstPart, ...rest] = fullName?.split(WHITESPACE_PATTERN) ?? []
  return {
    name:
      nonEmpty(fields[systemFieldTypes.enum.first_name]) || nonEmpty(firstPart),
    last_name:
      nonEmpty(fields[systemFieldTypes.enum.last_name]) ||
      nonEmpty(rest.join(" ")),
    phone: nonEmpty(fields[systemFieldTypes.enum.phone]),
  }
}

export const buildMailerLiteSubscriberProps = (
  fields: Record<string, string>,
  step: MailerLiteAddSubscriberSchema,
) => {
  const email = nonEmpty(fields[step.emailField])?.toLowerCase()
  if (!email) {
    throw new Error("MailerLite subscriber email is empty")
  }
  const customFields = Object.fromEntries(
    step.mergeFields.flatMap((mapping) => {
      const value = nonEmpty(fields[mapping.contactFieldId])
      return value ? [[mapping.mailerLiteField, value]] : []
    }),
  )
  const subscriberFields = Object.fromEntries(
    Object.entries({ ...reservedFields(fields), ...customFields }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  )
  return {
    email,
    status: step.status,
    ...(step.groupId ? { groups: [step.groupId] } : {}),
    ...(Object.keys(subscriberFields).length
      ? { fields: subscriberFields }
      : {}),
  }
}

export const addMailerLiteSubscriber = async (
  props: ExecuteStepProps<MailerLiteAddSubscriberSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    groupId: step.groupId,
    operation: "createOrUpdateSubscriber",
  }
  try {
    const [row, fields] = await Promise.all([
      integrationMailerLiteService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      mailerLiteAuthSchema,
    )
    const subscriber = buildMailerLiteSubscriberProps(fields, step)
    const ctx = await buildContext({
      workspaceId: conversation.workspaceId,
      integrationType: "mailerLite",
      integration: { ...row, auth },
    })
    await distributedLock.runExclusive({
      key: `mailer-lite:sync-subscriber:${hash(String(conversation.workspaceId))}:${hash(subscriber.email)}`,
      timeoutInSeconds: MAILER_LITE_LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        await mailerLiteIntegration.runAction("createOrUpdateSubscriber", {
          ctx,
          props: subscriber,
        })
      },
    })
    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    const provider =
      error instanceof MailerLiteApiError
        ? {
            providerStatus: error.statusCode,
            retryAfterSeconds: error.retryAfterSeconds,
            rateLimitLimit: error.rateLimitLimit,
            rateLimitRemaining: error.rateLimitRemaining,
          }
        : {}
    logger.error(
      { ...logContext, ...provider, error: normalized },
      "MailerLite subscriber sync failed",
    )
    await logProviderError({
      provider: "mailer-lite",
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      error,
    })
    return { status: "error", result: null, errorMessage: normalized.message }
  }
}
