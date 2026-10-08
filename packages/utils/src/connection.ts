import { z } from "zod"

export const connectionStatuses = z.enum([
  "connected",
  "degraded",
  "needs_reauth",
  "paused",
  "disconnected",
])
export type ConnectionStatus = z.infer<typeof connectionStatuses>

export const ACTIVE_CONNECTION_STATUSES = [
  "connected",
  "degraded",
] as const satisfies readonly ConnectionStatus[]
export type ActiveConnectionStatus = (typeof ACTIVE_CONNECTION_STATUSES)[number]
export const INACTIVE_CONNECTION_STATUSES = [
  "needs_reauth",
  "paused",
  "disconnected",
] as const satisfies readonly ConnectionStatus[]
/** Fails to type-check when a status is omitted from either partition. */
type AssertEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never
const _assertConnectionStatusPartitionIsExhaustive: AssertEqual<
  ConnectionStatus,
  | (typeof ACTIVE_CONNECTION_STATUSES)[number]
  | (typeof INACTIVE_CONNECTION_STATUSES)[number]
> = true

/** Why a connection last moved into (or stayed in) a non-`connected` status. */
export const connectionStatusReasons = z.enum([
  "manual",
  "workspace_purge",
  "trial_expired",
  "tenant_suspended",
  "token_revoked",
  "provider_revoked",
  "refresh_failed",
  "verify_failed",
  "quota_exceeded",
  "orphaned_webhook",
])
export type ConnectionStatusReason = z.infer<typeof connectionStatusReasons>

/**
 * `Inbox.disconnectReason` predates this `Connection` domain and is narrower
 * than `ConnectionStatusReason`. Lives here (not `@chatbotx.io/database`) for
 * the same reason `connectionStatusReasons` above does — re-exported from
 * `@chatbotx.io/database/partials` for existing backend importers (mirrors
 * the `inboxStatuses` precedent in `@chatbotx.io/utils/conversation`).
 */
export const inboxDisconnectReasons = z.enum([
  "manual",
  "workspace_purge",
  "trial_expired",
  "tenant_suspended",
  "token_revoked",
])
export type InboxDisconnectReason = z.infer<typeof inboxDisconnectReasons>

/**
 * `workspace_purge`, `trial_expired`, and `tenant_suspended` map 1-1 onto
 * their own `Inbox.disconnectReason` values (matching how disconnects were
 * `disconnectReason` directly, before this `Connection` layer existed) —
 * they must NOT collapse into the generic `manual` bucket. Reasons with no
 * Inbox-native equivalent (`verify_failed`, `quota_exceeded`,
 * `orphaned_webhook`) fall back to `manual`.
 */
export const CONNECTION_TO_INBOX_DISCONNECT_REASON: Record<
  ConnectionStatusReason,
  InboxDisconnectReason
> = {
  manual: "manual",
  workspace_purge: "workspace_purge",
  trial_expired: "trial_expired",
  tenant_suspended: "tenant_suspended",
  token_revoked: "token_revoked",
  provider_revoked: "token_revoked",
  refresh_failed: "token_revoked",
  verify_failed: "manual",
  quota_exceeded: "manual",
  orphaned_webhook: "manual",
}

/**
 * Each Inbox and each Integration owns at most one Connection. This enum is
 * re-declared here as a Zod enum (same rationale as `channelTypes`) so the
 * database layer and public API schemas can validate against it without
 * depending on the SDK package.
 */
export const connectionKinds = z.enum(["channel", "integration"])
export type ConnectionKind = z.infer<typeof connectionKinds>

const connectionConfigFieldTypes = z.enum([
  "string",
  "secret",
  "number",
  "boolean",
  "enum",
  "url",
])

const connectionConfigItemSchema = z.object({
  type: z.enum([...connectionConfigFieldTypes.options, "object"]),
  enumValues: z.array(z.string()).optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        type: connectionConfigFieldTypes,
        required: z.boolean(),
        enumValues: z.array(z.string()).optional(),
        format: z.string().optional(),
        pattern: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  format: z.string().optional(),
  pattern: z.string().optional(),
  description: z.string().optional(),
})

export const connectionConfigFieldSchema = z.object({
  name: z.string(),
  type: z.enum([...connectionConfigFieldTypes.options, "array"]),
  required: z.boolean(),
  labelKey: z.string().optional(),
  enumValues: z.array(z.string()).optional(),
  items: connectionConfigItemSchema.optional(),
  format: z.string().optional(),
  pattern: z.string().optional(),
  description: z.string().optional(),
})
export type ConnectionConfigField = z.infer<typeof connectionConfigFieldSchema>

type JsonSchema = {
  type?: string
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  const?: unknown
  default?: unknown
  description?: string
  enum?: unknown[]
  format?: string
  pattern?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
}

type ConnectionConfigItem = NonNullable<ConnectionConfigField["items"]>

const mergeSchemas = (schemas: JsonSchema[]): JsonSchema => {
  if (schemas.length === 1) {
    return schemas[0] ?? {}
  }

  const propertyNames = new Set(
    schemas.flatMap((schema) => Object.keys(schema.properties ?? {})),
  )
  const required = new Set(propertyNames)
  for (const schema of schemas) {
    for (const name of required) {
      if (!schema.required?.includes(name)) {
        required.delete(name)
      }
    }
  }
  const values = schemas.flatMap(
    (schema) =>
      schema.enum ?? (schema.const === undefined ? [] : [schema.const]),
  )
  const types = [
    ...new Set(schemas.map((schema) => schema.type).filter(Boolean)),
  ]

  return {
    ...(types.length === 1 ? { type: types[0] } : {}),
    ...(values.length > 0 ? { enum: values } : {}),
    ...(schemas.some((schema) => schema.properties)
      ? {
          properties: Object.fromEntries(
            [...propertyNames].map((name) => [
              name,
              mergeSchemas(
                schemas.flatMap((schema) =>
                  schema.properties?.[name] ? [schema.properties[name]] : [],
                ),
              ),
            ]),
          ),
        }
      : {}),
    ...(required.size > 0 ? { required: [...required] } : {}),
    ...(schemas.find((schema) => schema.description)?.description
      ? {
          description: schemas.find((schema) => schema.description)
            ?.description,
        }
      : {}),
  }
}

const resolveNonNullSchema = (schema: JsonSchema): JsonSchema => {
  const variants = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter(
    (item) => item.type !== "null",
  )
  if (variants.length === 0) {
    return schema
  }
  return { ...schema, ...mergeSchemas(variants.map(resolveNonNullSchema)) }
}

const configTypeForSchema = (
  schema: JsonSchema,
): ConnectionConfigField["type"] | "object" => {
  if (schema.enum) {
    return "enum"
  }
  switch (schema.type) {
    case "array":
    case "boolean":
    case "number":
    case "string":
      return schema.format === "uri" ? "url" : schema.type
    case "integer":
      return "number"
    case "object":
      return "object"
    default:
      throw new Error(
        `Unsupported JSON Schema config type: ${schema.type ?? "unknown"}`,
      )
  }
}

const formatForSchema = (schema: JsonSchema): string | undefined =>
  schema.pattern === "^\\d+$" ? "bigint-string" : schema.format

const configItemForSchema = (rawSchema: JsonSchema): ConnectionConfigItem => {
  const schema = resolveNonNullSchema(rawSchema)
  const type = configTypeForSchema(schema)
  if (type === "array") {
    throw new Error("Nested array config fields are not supported")
  }
  if (type === "object") {
    const required = new Set(schema.required)
    return {
      type,
      ...(schema.description ? { description: schema.description } : {}),
      ...(schema.properties
        ? {
            fields: Object.entries(schema.properties).map(([name, property]) =>
              configItemFieldForSchema(name, property, required.has(name)),
            ),
          }
        : {}),
    }
  }

  return {
    type,
    ...(schema.enum
      ? {
          enumValues: schema.enum.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {}),
    ...(formatForSchema(schema) ? { format: formatForSchema(schema) } : {}),
    ...(schema.pattern ? { pattern: schema.pattern } : {}),
    ...(schema.description ? { description: schema.description } : {}),
  }
}

const configItemFieldForSchema = (
  name: string,
  rawSchema: JsonSchema,
  required: boolean,
): NonNullable<ConnectionConfigItem["fields"]>[number] => {
  const schema = resolveNonNullSchema(rawSchema)
  const item = configItemForSchema(schema)
  if (item.type === "object") {
    throw new Error("Nested object config fields are not supported")
  }
  return {
    name,
    ...item,
    required: required && !("default" in schema),
  } as NonNullable<ConnectionConfigItem["fields"]>[number]
}

const configFieldForSchema = (
  name: string,
  rawSchema: JsonSchema,
  required: boolean,
): ConnectionConfigField => {
  const schema = resolveNonNullSchema(rawSchema)
  const type = configTypeForSchema(schema)
  if (type === "array") {
    return {
      name,
      type,
      required: required && !("default" in schema),
      ...(schema.items ? { items: configItemForSchema(schema.items) } : {}),
      ...(schema.description ? { description: schema.description } : {}),
    }
  }

  return {
    name,
    ...configItemForSchema(schema),
    required: required && !("default" in schema),
  } as ConnectionConfigField
}

/** Converts a Zod object schema to the connection catalog's field metadata. */
export const zodToConfigFields = (
  schema: z.ZodObject,
): ConnectionConfigField[] => {
  const jsonSchema = z.toJSONSchema(schema) as JsonSchema
  const required = new Set(jsonSchema.required)
  return Object.entries(jsonSchema.properties ?? {}).map(([name, property]) =>
    configFieldForSchema(name, property, required.has(name)),
  )
}

export const connectSessionNextActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open_url"), url: z.string() }),
  z.object({
    type: z.literal("enter_input"),
    inputFields: z.array(connectionConfigFieldSchema),
  }),
  z.object({ type: z.literal("wait") }),
])
export type ConnectSessionNextAction = z.infer<
  typeof connectSessionNextActionSchema
>

/** `ConnectSession.purpose` — set server-side, never accepted from client input. */
export const connectSessionPurposes = z.enum([
  "connect",
  "reconnect",
  "facebook_ads",
  "messaging_ads",
  "lead_ads",
  "meta_catalog",
])
export type ConnectSessionPurpose = z.infer<typeof connectSessionPurposes>

/** `ConnectSession.status` lifecycle. `expireDue` transitions due rows to `expired`. */
export const connectSessionStatuses = z.enum([
  "pending",
  "authorized",
  "awaiting_selection",
  "completed",
  "failed",
  "expired",
  "cancelled",
])
export type ConnectSessionStatus = z.infer<typeof connectSessionStatuses>

export const ACTIVE_CONNECT_SESSION_STATUSES = [
  "pending",
  "authorized",
  "awaiting_selection",
] as const satisfies readonly ConnectSessionStatus[]
export const TERMINAL_CONNECT_SESSION_STATUSES = [
  "completed",
  "failed",
  "expired",
  "cancelled",
] as const satisfies readonly ConnectSessionStatus[]
/** Fails to type-check when a status is omitted from either partition. */
const _assertConnectSessionStatusPartitionIsExhaustive: AssertEqual<
  ConnectSessionStatus,
  | (typeof ACTIVE_CONNECT_SESSION_STATUSES)[number]
  | (typeof TERMINAL_CONNECT_SESSION_STATUSES)[number]
> = true

export const connectSessionErrorCodes = z.enum([
  "state_mismatch",
  "expired",
  "provider_denied",
  "exchange_failed",
  "provider_error",
  "no_candidates",
  "already_connected",
  "quota_exceeded",
  "trial_expired",
  "internal_error",
])
export type ConnectSessionErrorCode = z.infer<typeof connectSessionErrorCodes>
