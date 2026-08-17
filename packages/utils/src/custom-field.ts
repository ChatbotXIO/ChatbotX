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
