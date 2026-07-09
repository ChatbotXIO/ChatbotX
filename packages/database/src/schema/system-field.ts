import { jsonb, pgEnum, pgTable } from "drizzle-orm/pg-core"
import type { SystemFieldPayload, SystemFieldRowType } from "../partials"
import { sharedColumns } from "../partials/shared"
import { systemFieldRowTypes } from "../partials/system-field"

export const systemFieldType = pgEnum(
  "SystemFieldType",
  systemFieldRowTypes.options as unknown as [
    SystemFieldRowType,
    ...SystemFieldRowType[],
  ],
)

export const systemFieldModel = pgTable("SystemField", {
  ...sharedColumns,
  type: systemFieldType().notNull(),
  payload: jsonb().$type<SystemFieldPayload>().notNull(),
})
