import type {
  WhatsappFlowResponse,
  WhatsappFlowResponseField,
  WhatsappFlowResponseFile,
} from "../schema/flow-response"

/** A response key as the Flow JSON labels it (from `getFlowResponseFields`). */
export type FlowResponseLabel = {
  key: string
  label: string
  options: Record<string, string>
  labelled: boolean
}

const FLOW_TOKEN_KEY = "flow_token"
const UNDERSCORE_REGEX = /_/g
const CAMEL_CASE_REGEX = /([a-z])([A-Z])/g
const FIRST_CHAR_REGEX = /^./

const humanizeKey = (key: string): string =>
  key
    .replace(UNDERSCORE_REGEX, " ")
    .replace(CAMEL_CASE_REGEX, "$1 $2")
    .replace(FIRST_CHAR_REGEX, (char) => char.toUpperCase())

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null

/**
 * PhotoPicker/DocumentPicker answers from a `complete` payload, per Meta's
 * media upload docs: `{ file_name, mime_type, sha256, id }`.
 */
const readFiles = (value: unknown[]): WhatsappFlowResponseFile[] | null => {
  const files: WhatsappFlowResponseFile[] = []
  for (const item of value) {
    if (!(isRecord(item) && typeof item.file_name === "string")) {
      return null
    }
    files.push({
      fileName: item.file_name,
      mimeType: asNullableString(item.mime_type),
      mediaId: asNullableString(item.id) ?? asNullableString(item.media_id),
    })
  }
  return files
}

const isPrimitive = (value: unknown): value is string | number =>
  typeof value === "string" || typeof value === "number"

const toField = (
  key: string,
  label: string,
  value: unknown,
  options: Record<string, string>,
): WhatsappFlowResponseField => {
  const optionTitle = (item: string | number) =>
    options[String(item)] ?? String(item)

  if (typeof value === "boolean") {
    return { key, label, kind: "boolean", value }
  }
  if (isPrimitive(value)) {
    return { key, label, kind: "text", value: optionTitle(value) }
  }
  if (value === null || value === undefined) {
    return { key, label, kind: "text", value: "" }
  }
  if (Array.isArray(value)) {
    const files = value.length > 0 ? readFiles(value) : null
    if (files) {
      return { key, label, kind: "files", value: files }
    }
    if (value.every(isPrimitive)) {
      return { key, label, kind: "list", value: value.map(optionTitle) }
    }
  }
  return { key, label, kind: "json", value: JSON.stringify(value) }
}

/**
 * Pairs a Flow response's answers with the Flow's labels, in the Flow's
 * question order; answers the Flow JSON does not list (endpoint Flows, a Flow
 * edited since) follow in response order with a humanized key.
 */
export const buildWhatsappFlowResponseFields = (
  flowResponse: Record<string, unknown>,
  labels: FlowResponseLabel[],
): WhatsappFlowResponse => {
  const answerKeys = Object.keys(flowResponse).filter(
    (key) => key !== FLOW_TOKEN_KEY,
  )
  const labelByKey = new Map(labels.map((label) => [label.key, label]))
  const ordered = [
    ...labels
      .map((label) => label.key)
      .filter((key) => answerKeys.includes(key)),
    ...answerKeys.filter((key) => !labelByKey.has(key)),
  ]

  const fields = ordered.map((key) => {
    const label = labelByKey.get(key)
    return toField(
      key,
      label?.label ?? humanizeKey(key),
      flowResponse[key],
      label?.options ?? {},
    )
  })

  return {
    fields,
    labelSource: ordered.some((key) => labelByKey.get(key)?.labelled)
      ? "whatsappFlow"
      : "fallback",
  }
}
