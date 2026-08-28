import { createHash } from "node:crypto"
import { buildContext, integrationDripService } from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { DripSubscribeSubscriberSchema } from "@chatbotx.io/flow-config"
import {
  DRIP_HTTP_TIMEOUT_MS,
  type DripAuthValue,
  dripAuthSchema,
  integration as integrationDrip,
} from "@chatbotx.io/integration-drip"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export const DRIP_LOCK_TIMEOUT_SECONDS = 30
const WHITESPACE_PATTERN = /\s+/

if (DRIP_HTTP_TIMEOUT_MS >= DRIP_LOCK_TIMEOUT_SECONDS * 1000) {
  throw new Error("Drip HTTP timeout must be lower than lock timeout")
}

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(WHITESPACE_PATTERN).filter(Boolean)
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  }
}

export const subscribeDripSubscriber = async (
  props: ExecuteStepProps<DripSubscribeSubscriberSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
  }

  try {
    const [row, fields] = await Promise.all([
      integrationDripService.findByWorkspaceIdOrFail(conversation.workspaceId),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])

    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      dripAuthSchema,
    )

    const email = fields[step.emailField]?.trim().toLowerCase()
    if (!email) {
      return {
        status: "error",
        errorMessage: "Drip subscriber email is empty",
        result: null,
      }
    }

    const phone = step.phoneField
      ? fields[step.phoneField]?.trim() || undefined
      : undefined

    const fallbackName = splitFullName(
      fields[systemFieldTypes.enum.full_name] ?? "",
    )
    const firstName =
      fields[systemFieldTypes.enum.first_name]?.trim() || fallbackName.firstName
    const lastName =
      fields[systemFieldTypes.enum.last_name]?.trim() || fallbackName.lastName

    const customFields: Record<string, string> = {}
    for (const mapping of step.mergeFields) {
      const value = fields[mapping.contactFieldId]?.trim()
      if (value && !customFields[mapping.dripField]) {
        customFields[mapping.dripField] = value
      }
    }

    const ctx = await buildContext<DripAuthValue>({
      workspaceId: conversation.workspaceId,
      integrationType: "drip",
      integration: { ...row, auth },
    })

    const accountFingerprint = createHash("sha256")
      .update(step.accountId)
      .digest("hex")
    const emailFingerprint = createHash("sha256").update(email).digest("hex")
    const lockKey = `drip:sync-subscriber:${accountFingerprint}:${emailFingerprint}`

    await distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: DRIP_LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        await integrationDrip.runAction("syncSubscriber", {
          ctx,
          props: {
            accountId: step.accountId,
            email,
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            phone,
            tags: step.tags.length > 0 ? step.tags : undefined,
            custom_fields:
              Object.keys(customFields).length > 0 ? customFields : undefined,
          },
        })
      },
    })

    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      { ...logContext, error: normalized },
      "Drip sync-subscriber step failed",
    )
    await logProviderError({
      provider: "drip",
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      error,
    })
    return {
      status: "error",
      errorMessage: normalized.message,
      result: null,
    }
  }
}
