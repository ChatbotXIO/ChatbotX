import { sql } from "drizzle-orm"
import { jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import type { QrStyles } from "../partials/qr-code"
import { type ReflinkType, reflinkTypes } from "../partials/reflink"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { customFieldModel } from "./custom-field"
import { flowModel } from "./flow"
import { mediaLibraryFileModel } from "./media-library-file"
import { workspaceModel } from "./workspace"

export const reflinkType = pgEnum(
  "ReflinkType",
  reflinkTypes.options as unknown as [ReflinkType, ...ReflinkType[]],
)

export const reflinkModel = pgTable(
  "Reflink",
  {
    ...sharedColumns,
    name: text().notNull(),
    type: reflinkType().notNull().default("refLink"),
    flowId: bigintAsString()
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    customFieldId: bigintAsString().references(() => customFieldModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    qrStyles: jsonb().$type<QrStyles>(),
    // Chat widget embed settings. Empty domains = embeddable anywhere; the
    // hidden list (not an enabled list) lets newly connected inboxes show up.
    widgetAuthorizedDomains: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    widgetHiddenInboxIds: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // Widget branding. The powered-by line shows only with both a brand name
    // and URL. The logo is a media library file; none (or a deleted file)
    // falls back to the default chat icon, drawn on `widgetLogoBackgroundColor`
    // (null = the default dark gray).
    widgetLogoFileId: bigintAsString().references(
      () => mediaLibraryFileModel.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    widgetBrandName: text(),
    widgetBrandUrl: text(),
    widgetLogoBackgroundColor: text(),
  },
  (table) => [
    uniqueIndex("Reflink_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
