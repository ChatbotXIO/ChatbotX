import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import { bigint, type PgTimestampConfig, timestamp } from "drizzle-orm/pg-core"
import { z } from "zod"

export const timestampConfig: PgTimestampConfig<"date"> = {
  precision: 6,
  withTimezone: true,
}

export const sharedColumns = {
  id: bigint({ mode: "bigint" })
    .primaryKey()
    .$defaultFn(() => createId()),
  createdAt: timestamp("created_at", timestampConfig).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", timestampConfig)
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
}

export const uploadModes = z.enum(["link", "file"])
export type UploadMode = z.infer<typeof uploadModes>

export const cardLayouts = z.enum(["horizontal", "vertical"])
export type CardLayout = z.infer<typeof cardLayouts>
