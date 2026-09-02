import {
  buildContext,
  integrationMailchimpService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import type { MailchimpAddMemberSchema } from "@chatbotx.io/flow-config"
import {
  integration as integrationMailchimp,
  isSupportedMailchimpMergeFieldType,
  MailchimpApiError,
  mailchimpAuthSchema,
} from "@chatbotx.io/integration-mailchimp"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { getContactFieldMap } from "./contact-field-map"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

const MAX_RETRIES = 3
const DAY_MONTH_YEAR_PATTERN = /^(\d{1,2})-(\d{1,2})-(\d{4})$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/
const MONTH_DAY_PATTERN = /^(\d{1,2})\/(\d{1,2})$/
type MailchimpMergeFieldMapping =
  MailchimpAddMemberSchema["mergeFields"][number]

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const shouldRetry = (error: unknown): boolean =>
  !(
    error instanceof MailchimpApiError &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    error.statusCode !== 429
  )

const isValidDateParts = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const parseDateParts = (
  value: string,
): { year: number; month: number; day: number } | undefined => {
  const isoDate = ISO_DATE_PATTERN.exec(value)
  if (isoDate) {
    const parts = {
      year: Number(isoDate[1]),
      month: Number(isoDate[2]),
      day: Number(isoDate[3]),
    }
    return isValidDateParts(parts.year, parts.month, parts.day)
      ? parts
      : undefined
  }

  const dayMonthYear = DAY_MONTH_YEAR_PATTERN.exec(value)
  if (dayMonthYear) {
    const parts = {
      year: Number(dayMonthYear[3]),
      month: Number(dayMonthYear[2]),
      day: Number(dayMonthYear[1]),
    }
    return isValidDateParts(parts.year, parts.month, parts.day)
      ? parts
      : undefined
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return
  }
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

const formatDate = (value: string) => {
  const parts = parseDateParts(value)
  return parts
    ? `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
    : ""
}

const formatBirthday = (value: string) => {
  const monthDay = MONTH_DAY_PATTERN.exec(value)
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    if (isValidDateParts(2000, month, day)) {
      return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`
    }
  }

  const parts = parseDateParts(value)
  return parts
    ? `${String(parts.month).padStart(2, "0")}/${String(parts.day).padStart(2, "0")}`
    : ""
}

const formatMergeFieldValue = (
  mapping: MailchimpMergeFieldMapping,
  rawValue: string,
): unknown => {
  const value = rawValue.trim()
  const fallbackType = mapping.tag.toLowerCase()
  const type = (mapping.type ?? fallbackType).toLowerCase()

  if (!isSupportedMailchimpMergeFieldType(type)) {
    return
  }
  if (type === "birthday") {
    return formatBirthday(value)
  }
  if (type === "date") {
    return formatDate(value)
  }
  if (type === "number") {
    const number = Number(value)
    return Number.isFinite(number) ? number : ""
  }
  return value
}

export const addMailchimpMember = async (
  props: ExecuteStepProps<MailchimpAddMemberSchema>,
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
      integrationMailchimpService.findByWorkspaceIdOrFail(
        conversation.workspaceId,
      ),
      getContactFieldMap({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
      }),
    ])
    const auth = await encryptUtils.decryptObject(
      encryptedDataSchema.parse(row.auth),
      mailchimpAuthSchema,
    )
    const email = fields[step.email]
    if (!email) {
      throw new Error("Mailchimp member email is empty")
    }
    const ctx = await buildContext({
      workspaceId: conversation.workspaceId,
      integrationType: "mailchimp",
      integration: { ...row, auth },
    })
    const missingTypeMappings = step.mergeFields.filter(
      (mapping) => !mapping.type && fields[mapping.customFieldId]?.trim(),
    )
    const liveMergeFields =
      missingTypeMappings.length > 0
        ? await integrationMailchimp.runAction("listMergeFields", {
            ctx,
            props: { listId: step.listId },
          })
        : []
    const mergeFieldTypes = new Map(
      liveMergeFields.map((field) => [field.tag, field.type]),
    )
    const mergeFields = Object.fromEntries(
      step.mergeFields.flatMap((mapping) => {
        const value = fields[mapping.customFieldId]
        if (!value?.trim()) {
          return []
        }
        const formattedValue = formatMergeFieldValue(
          {
            ...mapping,
            type: mapping.type ?? mergeFieldTypes.get(mapping.tag),
          },
          value,
        )
        return formattedValue === undefined
          ? []
          : [[mapping.tag, formattedValue]]
      }),
    )

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        await integrationMailchimp.runAction("addMember", {
          ctx,
          props: {
            listId: step.listId,
            email,
            doubleOptIn: step.doubleOptIn,
            tags: step.tags,
            mergeFields,
          },
        })
        break
      } catch (error) {
        if (!shouldRetry(error) || attempt === MAX_RETRIES) {
          throw error
        }
        await sleep(2 ** attempt * 1000)
      }
    }

    return { status: "success", result: null }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      { ...logContext, error: normalized },
      "Mailchimp add-member step failed",
    )
    await logProviderError({
      provider: "mailchimp",
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
