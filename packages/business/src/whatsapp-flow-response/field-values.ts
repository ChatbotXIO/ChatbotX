import {
  DEFAULT_WHATSAPP_FLOW_FILE_FORMAT,
  WHATSAPP_FLOW_FILE_ANSWER_FIELD_TYPES,
  type WhatsappFlowFieldMapping,
  type WhatsappFlowFileFormat,
} from "@chatbotx.io/flow-config"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import {
  DATE_FORMAT,
  isTemporalCustomFieldType,
} from "@chatbotx.io/utils/datetime"
import { formatDateRange } from "@chatbotx.io/utils/form-answer-format"
import type { ResolvedFlowFile } from "@chatbotx.io/worker-config"
import { formatInTimeZone } from "date-fns-tz"
import type { SourceTimezoneResolver } from "../contact-custom-field/normalize"

/*
 * How a WhatsApp Flow answer becomes the text of a custom field: pure
 * functions, applied by `WhatsappFlowResponseService.applyFieldMappings`.
 */

/** Which of a file answer's files a mapping keeps, by its `fileFormat`. */
const FILE_FORMAT_SELECTORS: Record<
  WhatsappFlowFileFormat,
  (files: ResolvedFlowFile[]) => ResolvedFlowFile[]
> = {
  allUrls: (files) => files,
  firstUrl: (files) => files.slice(0, 1),
}

export type MappedValue = {
  customFieldId: string
  value: string
  /** True when the value is a file answer's links. */
  isFileAnswer: boolean
}

const FILE_URL_SEPARATOR = ", "

/** The text a file answer leaves in its field; null when no file was kept. */
const serializeFlowFiles = (
  files: ResolvedFlowFile[],
  fileFormat: WhatsappFlowFileFormat,
): string | null => {
  const urls = FILE_FORMAT_SELECTORS[fileFormat](files).map((file) => file.url)
  return urls.length > 0 ? urls.join(FILE_URL_SEPARATOR) : null
}

export const toMappedValue = (
  mapping: WhatsappFlowFieldMapping,
  customFieldId: string,
  input: {
    flowResponse: Record<string, unknown>
    flowFiles?: Record<string, ResolvedFlowFile[]>
  },
): MappedValue | null => {
  // Own keys only: a key like `constructor` must not read an inherited member.
  const files =
    input.flowFiles && Object.hasOwn(input.flowFiles, mapping.paramKey)
      ? input.flowFiles[mapping.paramKey]
      : undefined
  if (files) {
    const value = serializeFlowFiles(
      files,
      mapping.fileFormat ?? DEFAULT_WHATSAPP_FLOW_FILE_FORMAT,
    )
    return value === null ? null : { customFieldId, value, isFileAnswer: true }
  }
  const raw = input.flowResponse[mapping.paramKey]
  // A file answer the customer left empty keeps the field as it was.
  if (mapping.fileFormat && Array.isArray(raw) && raw.length === 0) {
    return null
  }
  const value = serializeFlowValue(raw)
  return value === null ? null : { customFieldId, value, isFileAnswer: false }
}

/**
 * DatePicker before Flow JSON 5.0 sends "a string that shows the timestamp in
 * milliseconds" (UTC). The mapping does not say which component answered, so
 * a whole number in a date field is read as that timestamp: no other answer
 * meant for a date field is all digits.
 */
const WHOLE_NUMBER = /^-?\d+$/
/** JavaScript's date range: 100,000,000 days either side of 1970. */
const MAX_TIMESTAMP_MS = 8.64e15

const toMillisecondTimestamp = (value: string): number | null => {
  if (!WHOLE_NUMBER.test(value)) {
    return null
  }
  const ms = Number(value)
  return Math.abs(ms) <= MAX_TIMESTAMP_MS ? ms : null
}
/** DatePicker from Flow JSON 5.0 and CalendarPicker: "YYYY-MM-DD". */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A date answer in the shape a date field accepts. Meta says its UTC
 * millisecond timestamp "should be converted back to the business's local
 * time zone": a `date` field gets that day in the workspace's zone, a
 * `datetime` field the exact instant. A calendar date in
 * a `datetime` field becomes local midnight. Anything else is left for the
 * field's own parsing.
 */
const toTemporalFieldValue = async (
  value: string,
  type: CustomFieldType,
  resolveTimezone: SourceTimezoneResolver,
): Promise<string> => {
  const ms = toMillisecondTimestamp(value)
  if (ms !== null) {
    const instant = new Date(ms)
    return type === "date"
      ? formatInTimeZone(instant, await resolveTimezone(), DATE_FORMAT)
      : instant.toISOString()
  }
  if (type === "datetime" && CALENDAR_DATE.test(value)) {
    return `${value}T00:00:00`
  }
  return value
}

/** Whether the field's type can change how the value is saved. */
export const dependsOnFieldType = (value: MappedValue): boolean =>
  value.isFileAnswer ||
  WHOLE_NUMBER.test(value.value) ||
  CALENDAR_DATE.test(value.value)

/** The value as its field takes it; null when it does not fit the field. */
export const fitValueToFieldType = async (
  value: MappedValue,
  type: CustomFieldType | undefined,
  resolveTimezone: SourceTimezoneResolver,
): Promise<MappedValue | null> => {
  if (value.isFileAnswer) {
    return type && WHATSAPP_FLOW_FILE_ANSWER_FIELD_TYPES.includes(type)
      ? value
      : null
  }
  return type && isTemporalCustomFieldType(type)
    ? {
        ...value,
        value: await toTemporalFieldValue(value.value, type, resolveTimezone),
      }
    : value
}

export const serializeFlowValue = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) {
    return null
  }
  if (typeof raw === "string") {
    return raw
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw)
  }
  const dateRange = formatDateRange(raw)
  if (dateRange !== null) {
    return dateRange
  }
  try {
    return JSON.stringify(raw)
  } catch {
    return null
  }
}
