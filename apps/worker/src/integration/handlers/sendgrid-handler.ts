import { createHash } from "node:crypto"
import { buildContext, integrationSendGridService } from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { SendGridAddContactSchema } from "@chatbotx.io/flow-config"
import {
  SendGridApiError,
  type SendGridAuthValue,
  sendGridAuthSchema,
  integration as sendGridIntegration,
} from "@chatbotx.io/integration-sendgrid"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

const WHITESPACE_PATTERN = /\s+/

// SendGrid Date fields only accept RFC3339, MM/DD/YYYY, or M/D/YYYY.
// Custom field IDs ending in "_D" are Date type (e.g. "e2_D").
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T/
const MDY_SLASH_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DMY_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/

const normalizeSendGridDate = (value: string): string => {
  if (RFC3339_RE.test(value)) {
    return value
  }
  if (MDY_SLASH_RE.test(value)) {
    return value
  }
  const isoMatch = ISO_DATE_RE.exec(value)
  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`
  }
  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY → MM/DD/YYYY
  // First component > 12 is unambiguously day; otherwise assume day-first (common in Vietnam)
  const dmyMatch = DMY_RE.exec(value)
  if (dmyMatch) {
    return `${dmyMatch[2].padStart(2, "0")}/${dmyMatch[1].padStart(2, "0")}/${dmyMatch[3]}`
  }
  return value
}

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(WHITESPACE_PATTERN).filter(Boolean)
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") }
}

export const addSendGridContact = async (
  props: ExecuteStepProps<SendGridAddContactSchema>,
): Promise<ExecuteStepResult> => {
  const { conversation, step } = props
  const logContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    stepId: step.id,
    listId: step.listId,
  }
  try {
    const [row, fields] = await Promise.all([
      integrationSendGridService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      sendGridAuthSchema,
    )
    const email = fields[step.emailField]?.trim().toLowerCase()
    if (!email) {
      return {
        status: "error",
        errorMessage: "SendGrid contact email is empty",
        result: null,
      }
    }
    if (!z.string().email().safeParse(email).success) {
      return {
        status: "error",
        errorMessage: `SendGrid contact email is invalid: ${email}`,
        result: null,
      }
    }

    const fallbackName = splitFullName(
      fields[systemFieldTypes.enum.full_name] ?? "",
    )
    const firstName =
      fields[systemFieldTypes.enum.first_name]?.trim() || fallbackName.firstName
    const lastName =
      fields[systemFieldTypes.enum.last_name]?.trim() || fallbackName.lastName
    const phone = step.phoneField
      ? fields[step.phoneField]?.trim() || undefined
      : undefined
    const customFields: Record<string, string> = {}
    for (const mapping of step.mergeFields) {
      const raw = fields[mapping.contactFieldId]?.trim()
      if (raw && !customFields[mapping.sendGridField]) {
        const isDateField = mapping.sendGridField.endsWith("_D")
        customFields[mapping.sendGridField] = isDateField
          ? normalizeSendGridDate(raw)
          : raw
      }
    }

    const ctx = await buildContext<SendGridAuthValue>({
      workspaceId: conversation.workspaceId,
      integrationType: "sendGrid",
      integration: { ...row, auth },
    })

    const contactPayload = {
      ...(step.listId ? { list_ids: [step.listId] } : {}),
      contacts: [
        {
          email,
          ...(firstName ? { first_name: firstName } : {}),
          ...(lastName ? { last_name: lastName } : {}),
          ...(phone ? { phone_number: phone } : {}),
          ...(Object.keys(customFields).length > 0
            ? { custom_fields: customFields }
            : {}),
        },
      ],
    }
    const accepted = await sendGridIntegration.runAction("addOrUpdateContact", {
      ctx,
      props: contactPayload,
    })

    const jobIdFingerprint = createHash("sha256")
      .update(accepted.job_id)
      .digest("hex")
    logger.info(
      { ...logContext, jobIdFingerprint, providerStatus: 202 },
      "SendGrid accepted contact update, polling job status",
    )

    const POLL_INTERVAL_MS = 3000
    const POLL_MAX_ATTEMPTS = 15
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, POLL_INTERVAL_MS),
        )
      }
      const job = await sendGridIntegration.runAction("checkImportJob", {
        ctx,
        props: { jobId: accepted.job_id },
      })
      const r = job.results

      // "failed"/"errored" = terminal error (no counts to inspect)
      if (job.status === "failed" || job.status === "errored") {
        return {
          status: "error",
          errorMessage: "SendGrid import job failed",
          result: null,
        }
      }

      // "completed"/"done" with no errored records = success
      if (job.status === "completed" || job.status === "done") {
        if ((r?.errored_count ?? 0) > 0) {
          return {
            status: "error",
            errorMessage: `SendGrid import job completed with ${r?.errored_count} errored record(s)`,
            result: null,
          }
        }
        return { status: "success", result: null }
      }

      // SendGrid sometimes stays "pending" even after processing all records.
      // Treat as resolved when processed count matches requested count.
      const requestedCount = r?.requested_count ?? 0
      const processedCount =
        (r?.created_count ?? 0) +
        (r?.updated_count ?? 0) +
        (r?.errored_count ?? 0)
      if (requestedCount > 0 && processedCount >= requestedCount) {
        if ((r?.errored_count ?? 0) > 0) {
          return {
            status: "error",
            errorMessage: `SendGrid import job completed with ${r?.errored_count} errored record(s)`,
            result: null,
          }
        }
        return { status: "success", result: null }
      }
    }

    logger.warn(
      { ...logContext, jobIdFingerprint },
      "SendGrid import job still pending after max attempts, treating as success",
    )
    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      {
        ...logContext,
        message: normalized.message,
        statusCode:
          error instanceof SendGridApiError ? error.statusCode : undefined,
      },
      "SendGrid add-contact step failed",
    )
    await logProviderError({
      provider: "sendgrid",
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      error,
    })
    return { status: "error", errorMessage: normalized.message, result: null }
  }
}
