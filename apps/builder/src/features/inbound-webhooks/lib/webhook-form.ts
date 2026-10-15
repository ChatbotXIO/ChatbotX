import {
  type ChannelType,
  channelTypes,
  INBOUND_WEBHOOK_UNSUPPORTED_PATH_MESSAGE,
  type InboundWebhookFieldMapping,
  type InboundWebhookIdentifier,
  type InboundWebhookInboxResolution,
  type InboundWebhookStructuralIssueCode,
  listInboundWebhookStructuralIssues,
} from "@chatbotx.io/database/partials"
import type { InboundWebhookModel } from "@chatbotx.io/database/types"
import {
  CONTACT_LOOKUP_ORDER,
  type ContactIdentityKind,
  INBOUND_WEBHOOK_CHANNEL_SPECS,
  type InboxIdentifierKind,
  inboxIdentifierKinds,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import { canonicalizeJsonPath } from "@chatbotx.io/utils/json-path"
import type { z } from "zod"
import {
  type InboundWebhookConfigRequest,
  type inboundWebhookActionSchema,
  inboundWebhookConfigRequest,
} from "../schema/action"

type FormAction = z.infer<typeof inboundWebhookActionSchema>

export type InboxMode = "inbox" | "payload"

/** What the editor binds to; the saved config is derived from it (`toConfigRequest`). */
export type InboundWebhookFormValues = {
  inboxMode: InboxMode
  inboxId: string
  payloadChannel: ChannelType | ""
  identifierKind: InboxIdentifierKind | ""
  inboxJsonPath: string
  phonePath: string
  emailPath: string
  channelUserIdPath: string
  fullNamePath: string
  fieldMappings: InboundWebhookFieldMapping[]
  actions: FormAction[]
}

type PathKey = "channelUserIdPath" | "phonePath" | "emailPath" | "fullNamePath"

/** Which form field holds each identity kind's path. */
export const IDENTITY_PATH_FIELD: Record<ContactIdentityKind, PathKey> = {
  channelUserId: "channelUserIdPath",
  phone: "phonePath",
  email: "emailPath",
  fullName: "fullNamePath",
}

/** A saved path shown in the `$` form, whatever spelling it was stored in. */
const displayPath = (path: string): string => canonicalizeJsonPath(path) ?? path

const pathOfKind = (
  identifiers: InboundWebhookIdentifier[],
  wanted: ContactIdentityKind,
): string => {
  const saved = identifiers.find(({ kind }) => kind === wanted)?.jsonPath
  return saved ? displayPath(saved) : ""
}

const EMPTY_MAPPING_ROW: InboundWebhookFieldMapping = {
  target: "",
  jsonPath: "",
}

const isEmptyMappingRow = (row: InboundWebhookFieldMapping): boolean =>
  !(row.target.trim() || row.jsonPath.trim())

export const toFormValues = (
  webhook: Pick<
    InboundWebhookModel,
    "inboxResolution" | "identifiers" | "fieldMappings" | "actions"
  >,
): InboundWebhookFormValues => {
  const resolution = webhook.inboxResolution
  return {
    inboxMode: resolution?.mode ?? "inbox",
    inboxId: resolution?.mode === "inbox" ? resolution.inboxId : "",
    payloadChannel: resolution?.mode === "payload" ? resolution.channel : "",
    identifierKind:
      resolution?.mode === "payload" ? resolution.identifierKind : "",
    inboxJsonPath:
      resolution?.mode === "payload" ? displayPath(resolution.jsonPath) : "",
    channelUserIdPath: pathOfKind(webhook.identifiers, "channelUserId"),
    phonePath: pathOfKind(webhook.identifiers, "phone"),
    emailPath: pathOfKind(webhook.identifiers, "email"),
    fullNamePath: pathOfKind(webhook.identifiers, "fullName"),
    // One empty row to fill in: a saved webhook needs at least one mapping.
    fieldMappings:
      webhook.fieldMappings.length > 0
        ? webhook.fieldMappings.map((mapping) => ({
            ...mapping,
            jsonPath: displayPath(mapping.jsonPath),
          }))
        : [EMPTY_MAPPING_ROW],
    actions: webhook.actions as FormAction[],
  }
}

/** The channel the webhook acts on, so the editor shows only the identities it accepts. */
export const resolveFormChannel = (
  values: Pick<
    InboundWebhookFormValues,
    "inboxMode" | "inboxId" | "payloadChannel"
  >,
  inboxChannelById: ReadonlyMap<string, ChannelType>,
): ChannelType | null => {
  if (values.inboxMode === "payload") {
    return values.payloadChannel || null
  }
  return inboxChannelById.get(values.inboxId) ?? null
}

const buildResolution = (
  values: InboundWebhookFormValues,
): InboundWebhookInboxResolution | null => {
  if (values.inboxMode === "inbox") {
    return values.inboxId ? { mode: "inbox", inboxId: values.inboxId } : null
  }
  return values.payloadChannel && values.identifierKind
    ? {
        mode: "payload",
        channel: values.payloadChannel,
        identifierKind: values.identifierKind,
        jsonPath: values.inboxJsonPath,
      }
    : null
}

const buildIdentifiers = (
  values: InboundWebhookFormValues,
): InboundWebhookIdentifier[] =>
  CONTACT_LOOKUP_ORDER.flatMap((kind) => {
    const jsonPath = values[IDENTITY_PATH_FIELD[kind]].trim()
    return jsonPath ? [{ kind, jsonPath }] : []
  })

/** The rows that carry something; an untouched row is the placeholder, not a mapping. */
const buildFieldMappings = (
  rows: InboundWebhookFieldMapping[],
): { mappings: InboundWebhookFieldMapping[]; formIndexes: number[] } => {
  const formIndexes = rows.flatMap((row, index) =>
    isEmptyMappingRow(row) ? [] : [index],
  )
  return {
    mappings: formIndexes.map(
      (index) => rows[index] as InboundWebhookFieldMapping,
    ),
    formIndexes,
  }
}

/** Messages the editor words itself (translated) instead of showing a zod message. */
type ConfigIssueMessageKey =
  | InboundWebhookStructuralIssueCode
  | "required"
  | "unsupportedPath"

export type ConfigIssue = {
  field: string | null
  message: string
  messageKey?: ConfigIssueMessageKey
}

const zodIssueMessageKey = (issue: {
  code: string
  message: string
}): ConfigIssueMessageKey | undefined => {
  if (issue.code === "too_small") {
    return "required"
  }
  return issue.message === INBOUND_WEBHOOK_UNSUPPORTED_PATH_MESSAGE
    ? "unsupportedPath"
    : undefined
}

/** Where each structural rule is reported: the first field the person has to fill in. */
const structuralIssueField = (
  code: InboundWebhookStructuralIssueCode,
  values: InboundWebhookFormValues,
): string => {
  const fields: Record<InboundWebhookStructuralIssueCode, string> = {
    inboxRequired:
      values.inboxMode === "payload" ? "payloadChannel" : "inboxId",
    identifierRequired: IDENTITY_PATH_FIELD.channelUserId,
    fieldMappingRequired: "fieldMappings.0.target",
  }
  return fields[code]
}

/** Maps a zod issue path on the saved config back to the form field that caused it. */
const toFormField = (
  path: readonly PropertyKey[],
  context: {
    identifiers: readonly InboundWebhookIdentifier[]
    mappingFormIndexes: readonly number[]
  },
): string | null => {
  const [head, second, third] = path
  if (head === "identifiers" && typeof second === "number") {
    const kind = context.identifiers[second]?.kind
    return kind ? IDENTITY_PATH_FIELD[kind] : null
  }
  if (head === "fieldMappings" && typeof second === "number") {
    const formIndex = context.mappingFormIndexes[second] ?? second
    return ["fieldMappings", formIndex, third]
      .filter((part) => part !== undefined)
      .join(".")
  }
  if (head === "actions") {
    return path.map(String).join(".")
  }
  if (head === "inboxResolution") {
    return second === "jsonPath" ? "inboxJsonPath" : null
  }
  return null
}

export type ConfigRequestResult =
  | { ok: true; data: InboundWebhookConfigRequest }
  | { ok: false; issues: ConfigIssue[] }

/**
 * Builds the config to save, or every reason it can't be: the field-level zod
 * issues AND the structural ones (inbox, one contact identity, one mapping), so
 * one Save press shows everything that is missing.
 */
export const toConfigRequest = (
  values: InboundWebhookFormValues,
  context: { sampleJson: unknown },
): ConfigRequestResult => {
  const identifiers = buildIdentifiers(values)
  const inboxResolution = buildResolution(values)
  const { mappings, formIndexes } = buildFieldMappings(values.fieldMappings)

  const structural: ConfigIssue[] = listInboundWebhookStructuralIssues({
    inboxResolution,
    identifiers,
    fieldMappings: mappings,
  }).map((code) => ({
    messageKey: code,
    field: structuralIssueField(code, values),
    message: code,
  }))

  const parsed = inboundWebhookConfigRequest.safeParse({
    inboxResolution,
    identifiers,
    fieldMappings: mappings,
    actions: values.actions,
    sampleJson: context.sampleJson ?? null,
  })
  const zodIssues: ConfigIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        field: toFormField(issue.path, {
          identifiers,
          mappingFormIndexes: formIndexes,
        }),
        message: issue.message,
        messageKey: zodIssueMessageKey(issue),
      }))

  const issues = [...zodIssues, ...structural]
  return parsed.success && issues.length === 0
    ? { ok: true, data: parsed.data }
    : { ok: false, issues }
}

/** True when a saved webhook has everything it needs to be switched on. */
export const isWebhookActivatable = (
  webhook: Pick<
    InboundWebhookModel,
    "inboxResolution" | "identifiers" | "fieldMappings"
  >,
): boolean => listInboundWebhookStructuralIssues(webhook).length === 0

/**
 * Changing what the webhook acts on invalidates what was typed for the previous
 * inbox rule, so each change returns the whole patch to apply. Contact identity
 * paths belong to the payload, not to the channel, so they are kept.
 */
export type FormPatch = Partial<InboundWebhookFormValues>

export const patchForInboxMode = (mode: InboxMode): FormPatch => ({
  inboxMode: mode,
  inboxId: "",
  payloadChannel: "",
  identifierKind: "",
  inboxJsonPath: "",
})

export const patchForPayloadChannel = (channel: ChannelType): FormPatch => {
  const [onlyKind, ...otherKinds] =
    INBOUND_WEBHOOK_CHANNEL_SPECS[channel].inboxIdentifiers
  return {
    payloadChannel: channel,
    // One possible identifier needs no choice; several force an explicit pick.
    identifierKind: onlyKind && otherKinds.length === 0 ? onlyKind.kind : "",
    inboxJsonPath: "",
  }
}

export const patchForIdentifierKind = (
  kind: InboxIdentifierKind,
): FormPatch => ({
  identifierKind: kind,
  inboxJsonPath: "",
})

/** Inbox id → channel, ignoring any channel the registry does not know. */
export const buildInboxChannelMap = (
  inboxes: ReadonlyArray<{ id: string; channel: string }>,
): ReadonlyMap<string, ChannelType> =>
  new Map(
    inboxes.flatMap(({ id, channel }) => {
      const parsed = channelTypes.safeParse(channel)
      return parsed.success ? [[id, parsed.data] as const] : []
    }),
  )

/** The select fields hand back plain strings; only registry values may pass. */
export const parseChannel = (value: string): ChannelType | null => {
  const parsed = channelTypes.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const parseInboxIdentifierKind = (
  value: string,
): InboxIdentifierKind | null => {
  const parsed = inboxIdentifierKinds.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** A saved inbox that is gone or no longer connected can't be picked, so the form must say so. */
export const isSavedInboxUnavailable = (
  values: Pick<InboundWebhookFormValues, "inboxMode" | "inboxId">,
  connectedInboxIds: ReadonlySet<string>,
): boolean =>
  values.inboxMode === "inbox" &&
  values.inboxId !== "" &&
  !connectedInboxIds.has(values.inboxId)
