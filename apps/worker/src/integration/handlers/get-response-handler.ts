import { createHash } from "node:crypto"
import {
  buildContext,
  integrationGetResponseService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { GetResponseAddContactSchema } from "@chatbotx.io/flow-config"
import {
  GET_RESPONSE_HTTP_TIMEOUT_MS,
  GetResponseApiError,
  getResponseAuthSchema,
  integration as getResponseIntegration,
} from "@chatbotx.io/integration-get-response"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export const GET_RESPONSE_LOCK_TIMEOUT_SECONDS = 30

if (GET_RESPONSE_HTTP_TIMEOUT_MS >= GET_RESPONSE_LOCK_TIMEOUT_SECONDS * 1000) {
  throw new Error("GetResponse HTTP timeout must be shorter than lock TTL")
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

const nonEmpty = (value: string | undefined) => value?.trim() || undefined

const getContactName = (fields: Record<string, string>) => {
  const firstName = nonEmpty(fields[systemFieldTypes.enum.first_name])
  const lastName = nonEmpty(fields[systemFieldTypes.enum.last_name])
  const composedName = [firstName, lastName].filter(Boolean).join(" ").trim()
  const name = composedName || nonEmpty(fields[systemFieldTypes.enum.full_name])
  return name && name.length >= 3 ? name : undefined
}

export const buildGetResponseContactProps = (
  fields: Record<string, string>,
  step: GetResponseAddContactSchema,
) => {
  const email = nonEmpty(fields[step.emailField])?.toLowerCase()
  if (!email) {
    throw new Error("GetResponse contact email is empty")
  }
  const campaignId = nonEmpty(step.campaignId)
  if (!campaignId) {
    throw new Error("GetResponse list is not configured")
  }
  const dayOfCycle =
    step.dayOfCycle === undefined
      ? undefined
      : Number.parseInt(step.dayOfCycle, 10)

  const name = getContactName(fields)
  return {
    email,
    campaign: { campaignId },
    ...(name ? { name } : {}),
    ...(step.tags?.length
      ? { tags: step.tags.map((tagId) => ({ tagId })) }
      : {}),
    ...(dayOfCycle === undefined || Number.isNaN(dayOfCycle)
      ? {}
      : { dayOfCycle }),
  }
}

export const addGetResponseContact = async (
  props: ExecuteStepProps<GetResponseAddContactSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    campaignId: step.campaignId,
    operation: "createOrUpdateContact",
  }

  try {
    const [row, fields] = await Promise.all([
      integrationGetResponseService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      getResponseAuthSchema,
    )
    const contact = buildGetResponseContactProps(fields, step)
    const ctx = await buildContext({
      workspaceId: conversation.workspaceId,
      integrationType: "getResponse",
      integration: { ...row, auth },
    })

    await distributedLock.runExclusive({
      key: `get-response:sync-contact:${hash(String(conversation.workspaceId))}:${hash(contact.email)}`,
      timeoutInSeconds: GET_RESPONSE_LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        await getResponseIntegration.runAction("createOrUpdateContact", {
          ctx,
          props: contact,
        })
      },
    })

    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    const provider =
      error instanceof GetResponseApiError
        ? {
            providerStatus: error.statusCode,
            retryAfterSeconds: error.retryAfterSeconds,
          }
        : {}
    logger.error(
      { ...logContext, ...provider, err: normalized },
      "GetResponse contact sync failed",
    )
    await logProviderError({
      provider: "get-response",
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      error,
    })
    return { status: "error", result: null, errorMessage: normalized.message }
  }
}
