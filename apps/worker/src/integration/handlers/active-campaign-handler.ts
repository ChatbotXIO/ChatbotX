import { createHash } from "node:crypto"
import {
  buildContext,
  integrationActiveCampaignService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { ActiveCampaignSyncContactSchema } from "@chatbotx.io/flow-config"
import {
  ACTIVE_CAMPAIGN_HTTP_TIMEOUT_MS,
  type ActiveCampaignAuthValue,
  activeCampaignAuthSchema,
  integration as integrationActiveCampaign,
} from "@chatbotx.io/integration-active-campaign"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export const ACTIVE_CAMPAIGN_LOCK_TIMEOUT_SECONDS = 30

if (
  ACTIVE_CAMPAIGN_HTTP_TIMEOUT_MS >=
  ACTIVE_CAMPAIGN_LOCK_TIMEOUT_SECONDS * 1000
) {
  throw new Error("ActiveCampaign HTTP timeout must be lower than lock timeout")
}

const fingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex")

const readOptionalField = (
  fields: Record<string, string>,
  fieldId: string | undefined,
) => (fieldId ? fields[fieldId]?.trim() || undefined : undefined)

export const syncActiveCampaignContact = async (
  props: ExecuteStepProps<ActiveCampaignSyncContactSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
  }

  try {
    const [row, fields] = await Promise.all([
      integrationActiveCampaignService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])

    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      activeCampaignAuthSchema,
    )

    const email = fields[step.emailField]?.trim().toLowerCase()
    if (!email) {
      return {
        status: "error",
        errorMessage: "ActiveCampaign contact email is empty",
        result: null,
      }
    }

    const phone = readOptionalField(fields, step.phoneField)

    const fieldValues = step.fieldValues
      .map((mapping) => ({
        fieldId: mapping.activeCampaignFieldId,
        value: fields[mapping.contactFieldId]?.trim(),
      }))
      .filter((mapping): mapping is { fieldId: string; value: string } =>
        Boolean(mapping.value),
      )

    const ctx = await buildContext<ActiveCampaignAuthValue>({
      workspaceId: conversation.workspaceId,
      integrationType: "activeCampaign",
      integration: { ...row, auth },
    })

    const lockKey = `active-campaign:sync-contact:${fingerprint(auth.apiUrl)}:${fingerprint(email)}`

    await distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: ACTIVE_CAMPAIGN_LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        if (step.operation === "addContactToAutomation") {
          if (!step.automationId) {
            throw new Error("ActiveCampaign automation is not configured")
          }

          const contact = await integrationActiveCampaign.runAction(
            "syncContact",
            {
              ctx,
              props: { email, fieldValues: [] },
            },
          )

          await integrationActiveCampaign.runAction("addContactToAutomation", {
            ctx,
            props: { contactId: contact.id, automationId: step.automationId },
          })
          return
        }

        const contact = await integrationActiveCampaign.runAction(
          "syncContact",
          {
            ctx,
            props: {
              email,
              phone,
              fieldValues,
            },
          },
        )

        for (const listId of step.listIds) {
          await integrationActiveCampaign.runAction("addContactToList", {
            ctx,
            props: { contactId: contact.id, listId, status: "1" },
          })
        }

        for (const tagId of step.tagIds) {
          await integrationActiveCampaign.runAction("addTagToContact", {
            ctx,
            props: { contactId: contact.id, tagId },
          })
        }
      },
    })

    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      { ...logContext, err: normalized },
      "ActiveCampaign sync-contact step failed",
    )
    await logProviderError({
      provider: "active-campaign",
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
