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
    // tenant, so the same provider identity signing in under two different
    // tenants' users gets two account rows. The OAuth identity lookup is scoped
    // by this column in the auth adapter. Exception: a row linking to the bound
    // tenant's owner is stamped `ROOT_TENANT_ID` instead of the bound tenant —
    // the owner's account lives in the root tenant, and this column has
    // `onDelete: "restrict"`, so stamping the reseller tenant would leave a row
    // that blocks that tenant's deletion. See the auth adapter's `create` wrapper.
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
