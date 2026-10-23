import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import {
  customType,
  type PgTimestampConfig,
  timestamp,
} from "drizzle-orm/pg-core"
import { z } from "zod"

export const bigintAsString = customType<{
  data: string
  driverData: string
}>({
  dataType() {
    return "bigint"
  },
  fromDriver(value) {
    return String(value)
  },
})

export const timestampConfig: PgTimestampConfig<"date"> = {
  precision: 6,
  withTimezone: true,
}

/**
 * Seeded root tenant id — the platform / single-tenant OSS install. Every
 * `User`/`Workspace` defaults to this tenant; the root `Tenant` row has a NULL
 * `ownerId`. Defined here (not in `tenant.ts`) so this eager default value is
 * safe against schema module load order — `tenant.ts` and `auth-user.ts` form a
 * circular FK reference that is resolved lazily for columns but not for a const.
 */
export const ROOT_TENANT_ID = "1"

export const sharedColumns = {
  id: bigintAsString()
    .primaryKey()
    .$defaultFn(() => createId()),
  createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  updatedAt: timestamp(timestampConfig)
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
}

export const uploadModes = z.enum(["url", "file"])
export type UploadMode = z.infer<typeof uploadModes>

export const cardLayouts = z.enum(["horizontal", "vertical"])
export type CardLayout = z.infer<typeof cardLayouts>

/**
 * How a count over a possibly huge audience is computed. `exact` (the default,
 * and the only behaviour before this existed) scans everything but is capped by
 * a statement timeout; `bounded` stops at {@link BOUNDED_COUNT_CAP} and says so.
 */
export const countModes = z.enum(["exact", "bounded"])
export type CountMode = z.infer<typeof countModes>

/** Rows a `bounded` count looks at before reporting "at least this many". */
export const BOUNDED_COUNT_CAP = 100_000

/** Upper bound for an `exact` count, so a runaway scan cannot hold a connection. */
export const EXACT_COUNT_STATEMENT_TIMEOUT = "30s"
