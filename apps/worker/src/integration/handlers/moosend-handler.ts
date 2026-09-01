import { createHash } from "node:crypto"
import { buildContext, integrationMoosendService } from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { MoosendCreateContactSchema } from "@chatbotx.io/flow-config"
import {
  MOOSEND_HTTP_TIMEOUT_MS,
  MoosendApiError,
  moosendAuthSchema,
  moosendContactPayloadSchema,
  integration as moosendIntegration,
} from "@chatbotx.io/integration-moosend"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import {
  acquireMoosendSubscribePermit,
  MoosendRateLimitError,
} from "./moosend-rate-limit"
import type { ExecuteStepResult } from "./step"

export const MOOSEND_LOCK_TTL_MS = 20_000

if (MOOSEND_HTTP_TIMEOUT_MS >= MOOSEND_LOCK_TTL_MS) {
  throw new Error("Moosend HTTP timeout must be shorter than lock TTL")
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

export const buildMoosendContactLockKey = (props: {
  workspaceId: string
  listId: string
  email: string
}) =>
  `moosend:subscribe:${hash(props.workspaceId)}:${hash(props.listId)}:${hash(
    props.email,
  )}`

export class MoosendContactValidationError extends Error {
  readonly kind = "local_invalid_contact"

  constructor() {
    super("Moosend contact data is invalid")
    this.name = "MoosendContactValidationError"
  }
}

export const addOrUpdateMoosendContact = async (
  props: ExecuteStepProps<MoosendCreateContactSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    listId: step.listId,
    operation: "createOrUpdateContact",
  }

  try {
    const [row, fields] = await Promise.all([
      integrationMoosendService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      moosendAuthSchema,
    )
    const contact = moosendContactPayloadSchema.safeParse({
      listId: step.listId,
      email: fields[step.emailField],
    })
    if (!contact.success) {
      throw new MoosendContactValidationError()
    }
    const ctx = await buildContext({
      workspaceId: conversation.workspaceId,
      integrationType: "moosend",
      integration: { ...row, auth },
    })

    await acquireMoosendSubscribePermit(auth.apiKey)
    await distributedLock.runExclusive({
      key: buildMoosendContactLockKey({
        workspaceId: conversation.workspaceId,
        listId: contact.data.listId,
        email: contact.data.email,
      }),
      timeoutInSeconds: MOOSEND_LOCK_TTL_MS / 1000,
      fn: async () => {
        await moosendIntegration.runAction("createOrUpdateContact", {
          ctx,
          props: contact.data,
        })
      },
    })
    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    let provider: Record<string, string | number | undefined> = {}
    if (error instanceof MoosendApiError) {
      provider = {
        providerStatus: error.statusCode,
        providerCode: error.providerCode,
        kind: error.kind,
        retryAfterSeconds: error.retryAfterSeconds,
      }
    } else if (error instanceof MoosendRateLimitError) {
      provider = {
        kind: error.kind,
        retryAfterSeconds: error.retryAfterSeconds,
      }
    }
    logger.error(
      { ...logContext, ...provider, err: normalized },
      "Moosend contact sync failed",
    )
    await logProviderError({
      provider: "moosend",
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      error,
    })
    return { status: "error", result: null, errorMessage: normalized.message }
  }
}
