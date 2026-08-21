import { z } from "zod"

/**
 * See this package's README ("Exception: cross-cutting product enums") for why
 * a product enum lives in a generic-utils package: `@chatbotx.io/flow-config`
 * needs it for the flow-export custom-field manifest without depending on
 * `@chatbotx.io/database` (database already depends on flow-config).
 *
 * `@chatbotx.io/database/partials` re-exports this, so existing importers there
 * keep working unchanged. Mirrors the `channelTypes` precedent in `./channel.ts`.
 */
export const customFieldTypes = z.enum([
  "shortText",
  "email",
  "phoneNumber",
  "number",
  "date",
  "datetime",
  "boolean",
  "longText",
])
export type CustomFieldType = z.infer<typeof customFieldTypes>

/**
 * Canonical `(type, name)` identity used to match a flow export's custom-field
 * manifest against the target workspace's existing fields.
 *
 * Case- and whitespace-insensitive: the export carries whatever casing the
 * source workspace used, and an exact-case match would mint a duplicate field
 * on every casing drift. `type` is part of the key because the DB's unique
 * index is on `(workspaceId, type, name)` — two fields may share a name if
 * their types differ.
 *
 * Lives here, beside the enum, because both `customFieldService` (which builds
 * the resolved map) and `flowService` (which looks up into it) must fold keys
 * identically — two private copies would silently diverge and break the
 * lookup.
 */
export const customFieldResolutionKey = (field: {
  name: string
  type: CustomFieldType
}): string => `${field.type}:${field.name.trim().toLowerCase()}`
