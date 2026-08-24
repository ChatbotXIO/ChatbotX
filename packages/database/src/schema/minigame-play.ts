import { boolean, index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactModel } from "./contact"
import { minigameModel } from "./minigame"

/**
 * Per-play log for a minigame: one row per draw, recording whether the
 * contact won and which prize. `prizeName` is a snapshot taken at play time —
 * prize items live inside `Minigame.prizeSettings` (jsonb) and can be edited
 * or removed later, so the log must not rely on `prizeId` staying resolvable.
 */
export const minigamePlayModel = pgTable(
  "MinigamePlay",
  {
    ...sharedColumns,
    minigameId: bigintAsString()
      .notNull()
      .references(() => minigameModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isWinning: boolean().notNull(),
    prizeId: text(),
    prizeName: text(),
  },
  (table) => [
    index("MinigamePlay_minigameId_contactId_idx").using(
      "btree",
      table.minigameId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
    index("MinigamePlay_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
  ],
)
