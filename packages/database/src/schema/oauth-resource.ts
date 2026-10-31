import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"

export const oauthResourceModel = pgTable(
  "OAuthResource",
  {
    ...sharedColumns,
    identifier: text().notNull(),
    name: text().notNull(),
    accessTokenTtl: integer(),
    refreshTokenTtl: integer(),
    signingAlgorithm: text(),
    signingKeyId: text(),
    allowedScopes: text().array(),
    customClaims: jsonb().$type<Record<string, unknown>>(),
    dpopBoundAccessTokensRequired: boolean().notNull().default(false),
    disabled: boolean().notNull().default(false),
    policyVersion: integer().notNull().default(1),
    metadata: jsonb().$type<Record<string, unknown>>(),
  },
  (table) => [
    uniqueIndex("OAuthResource_identifier_key").on(table.identifier),
    index("OAuthResource_disabled_idx").on(table.disabled),
  ],
)
