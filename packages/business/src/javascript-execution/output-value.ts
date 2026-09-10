import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  isTemporalCustomFieldType,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { normalizeTemporalValueForStorage } from "@chatbotx.io/utils/temporal-input"
import { getProperty } from "dot-prop"
import { ChatbotXException } from "../errors"
import { normalizeCustomFieldValueByType } from "./custom-field-value"

const MAX_OUTPUT_BYTES = 64 * 1024
const MAX_ERROR_VALUE_LENGTH = 80

const preview = (value: string): string =>
  value.length > MAX_ERROR_VALUE_LENGTH
    ? `${value.slice(0, MAX_ERROR_VALUE_LENGTH)}…`
    : value

const typeMismatchException = (props: {
  candidate: string
  type: CustomFieldType
  fieldName: string
}): ChatbotXException =>
  new ChatbotXException(
    `JavaScript returned "${preview(props.candidate)}", which is not a valid ${
      props.type
    } value for the output field "${props.fieldName}".`,
    "javascriptOutputTypeMismatch",
    400,
  )

const emptyValueException = (props: {
  type: CustomFieldType
  fieldName: string
}): ChatbotXException =>
  new ChatbotXException(
    `JavaScript returned an empty value, which is not a valid ${props.type} value for the output field "${props.fieldName}".`,
    "javascriptOutputTypeMismatch",
    400,
  )

/**
 * Reduces the sandbox's `unknown` result to the string a per-type normalizer
 * inspects. Mirrors the encoding `toValidatedCustomFieldValue`'s previous
 * `toCustomFieldValue` used, but rejects non-finite numbers instead of
 * letting `JSON.stringify(NaN) === "null"` silently persist the literal
 * string `"null"`.
 */
const toCandidateString = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new ChatbotXException(
      `JavaScript returned ${String(value)}, which cannot be saved to a custom field.`,
      "javascriptOutputTypeMismatch",
      400,
    )
  }
  if (typeof value === "string") {
    return value
  }
  const encoded =
    typeof value === "number" ? String(value) : JSON.stringify(value)
  return encoded === undefined ? null : encoded
}

/**
 * Validates the Execute JavaScript step's returned value against the
 * declared type of the output custom field it will be written to, and
 * returns the string to persist — or `null` when the write should be
 * skipped entirely (the code returned `null`/`undefined`, matching prior
 * behavior).
 *
 * Throws a `ChatbotXException` (`javascriptOutputTypeMismatch`) when the
 * value cannot be represented as `type`, so the flow step's error state
 * catches it instead of silently persisting or silently skipping a bad
 * write — see packages/business/src/contact-custom-field/normalize.ts for
 * why that silent-skip path is not reused here.
 *
 * `date`/`datetime` are pre-flighted (Lenient parsing) only to confirm the
 * value parses at all; the canonical value returned here is the raw
 * candidate string, left for `contactCustomFieldService.setValues` to
 * normalize with the real contact/workspace timezone, which this function
 * cannot resolve.
 */
export const toValidatedCustomFieldValue = (props: {
  value: unknown
  type: CustomFieldType
  fieldName: string
}): string | null => {
  const { type, fieldName } = props
  const candidate = toCandidateString(props.value)
  if (candidate === null) {
    return null
  }

  if (Buffer.byteLength(candidate, "utf8") > MAX_OUTPUT_BYTES) {
    // Distinct from @chatbotx.io/javascript-sandbox's "javascriptOutputTooLarge"
    // (an oversized HTTP response from the executor) — this is a different
    // failure: the value itself is too large to persist into a custom field.
    // Kept as a separate code so callers branching on error codes can tell
    // the two conditions apart.
    throw new ChatbotXException(
      "JavaScript output is too large to save",
      "javascriptOutputValueTooLarge",
      400,
    )
  }

  if (type === "shortText" || type === "longText") {
    return candidate
  }

  if (candidate.length === 0) {
    throw emptyValueException({ type, fieldName })
  }

  if (isTemporalCustomFieldType(type)) {
    const parsed = normalizeTemporalValueForStorage({
      type,
      value: candidate,
      timezone: undefined,
      parsing: TemporalInputParsing.Lenient,
    })
    if (parsed === null) {
      throw typeMismatchException({ candidate, type, fieldName })
    }
    return candidate
  }

  const normalized = normalizeCustomFieldValueByType(type, candidate)
  if (normalized === null) {
    throw typeMismatchException({ candidate, type, fieldName })
  }
  return normalized
}

/** Path segments that must never be followed out of a returned JSON object. */
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"])

export type JavascriptOutputField = {
  id: string
  name: string
  type: CustomFieldType
}

export type JavascriptOutputWrite = {
  customFieldId: string
  value: string
}

export type JavascriptJsonPathMapping = {
  jsonPath: string
  outputFieldId: string
}

/** True for JSON objects from the sandbox (`{}`), never arrays or class instances. */
export const isPlainJsonObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Own keys of a returned object, minus prototype-pollution names. */
export const jsonObjectFieldKeys = (value: Record<string, unknown>): string[] =>
  Object.keys(value).filter((key) => !FORBIDDEN_JSON_KEYS.has(key))

const jsonPathLooksUnsafe = (jsonPath: string): boolean => {
  const normalized = jsonPath.replaceAll("[", ".").replaceAll("]", "")
  return normalized
    .split(".")
    .some((segment) => FORBIDDEN_JSON_KEYS.has(segment))
}

/**
 * Starts completeJavascriptMapping.
 * Drops blank mapping rows and prototype-pollution paths. Incomplete rows are
 * allowed in the editor so authors can add a path before picking a field.
 */
export const completeJavascriptMapping = (
  mapping: JavascriptJsonPathMapping[] | undefined,
): JavascriptJsonPathMapping[] =>
  (mapping ?? []).flatMap((entry) => {
    const jsonPath = entry.jsonPath.trim()
    const outputFieldId = entry.outputFieldId.trim()
    if (!(jsonPath && outputFieldId) || jsonPathLooksUnsafe(jsonPath)) {
      return []
    }
    return [{ jsonPath, outputFieldId }]
  })
// Ends completeJavascriptMapping.

/**
 * Starts collectJavascriptOutputWrites.
 * Maps a sandbox return value onto custom-field writes using the same
 * JSON-path rows External API Request uses, plus an optional dump field for
 * the whole value.
 */
export const collectJavascriptOutputWrites = (props: {
  value: unknown
  primaryField: JavascriptOutputField | null
  mappedFields: Map<string, JavascriptOutputField>
  mapping: JavascriptJsonPathMapping[]
}): JavascriptOutputWrite[] => {
  const { value, primaryField, mappedFields, mapping } = props
  if (value === undefined || value === null) {
    return []
  }

  const writes: JavascriptOutputWrite[] = []
  const writtenIds = new Set<string>()
  const completedMapping = completeJavascriptMapping(mapping)
  const source =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null

  if (source) {
    for (const entry of completedMapping) {
      const field = mappedFields.get(entry.outputFieldId)
      if (!field) {
        continue
      }
      const extracted = getProperty(source, entry.jsonPath)
      if (extracted === undefined) {
        continue
      }
      const mapped = toValidatedCustomFieldValue({
        value: extracted,
        type: field.type,
        fieldName: field.name,
      })
      if (mapped === null) {
        continue
      }
      writes.push({ customFieldId: field.id, value: mapped })
      writtenIds.add(field.id)
    }
  }

  if (primaryField && !writtenIds.has(primaryField.id)) {
    const dumped = toValidatedCustomFieldValue({
      value,
      type: primaryField.type,
      fieldName: primaryField.name,
    })
    if (dumped !== null) {
      writes.push({
        customFieldId: primaryField.id,
        value: dumped,
      })
    }
  }

  if (writes.length > 0) {
    return writes
  }

  if (completedMapping.length > 0 && !primaryField) {
    throw new ChatbotXException(
      "JavaScript returned a value, but none of the mapped JSON paths produced a value.",
      "javascriptOutputNoMatchingFields",
      400,
    )
  }

  if (!primaryField) {
    throw new ChatbotXException(
      "JavaScript returned a single value, so an output custom field is required.",
      "javascriptOutputFieldRequired",
      400,
    )
  }

  return []
}
// Ends collectJavascriptOutputWrites.
