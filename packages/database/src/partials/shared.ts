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

export const uploadModes = z.enum(["link", "file"])
export type UploadMode = z.infer<typeof uploadModes>

export const cardLayouts = z.enum(["horizontal", "vertical"])
export type CardLayout = z.infer<typeof cardLayouts>
