import {
  type AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  ROOT_TENANT_ID,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { tenantModel } from "./enterprise/tenant"

export const accountModel = pgTable(
  "Account",
  {
    ...sharedColumns,
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    accessTokenExpiresAt: timestamp(timestampConfig),
    refreshToken: text(),
    refreshTokenExpiresAt: timestamp(timestampConfig),
    scope: text(),
    idToken: text(),
    password: text(),
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Tenant key for white-label isolation, mirroring `User.tenantId`. A social
    // identity (`providerId` + `accountId`) links to a *separate* account row per
    // tenant, so signing in with the same provider on a reseller domain resolves a
    // tenant-scoped user instead of the owner's root-tenant account. The OAuth
    // identity lookup is scoped by this column in the auth adapter.
    tenantId: bigintAsString()
      .notNull()
      .default(ROOT_TENANT_ID)
      .references((): AnyPgColumn => tenantModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("Account_providerId_accountId_tenantId_idx").on(
      table.providerId,
      table.accountId,
      table.tenantId,
    ),
  ],
)
