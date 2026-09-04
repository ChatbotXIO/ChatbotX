import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  MinigameAppearance,
  MinigameGeneralSettings,
  MinigameNonWinningMessageSettings,
  MinigamePlayerSettings,
  MinigamePrizeSettings,
  MinigameType,
  MinigameWinningMessageSettings,
} from "../partials/minigame"
import { minigameTypes } from "../partials/minigame"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const minigameType = pgEnum(
  "minigameType",
  minigameTypes.options as [MinigameType, ...MinigameType[]],
)

export const minigameModel = pgTable(
  "Minigame",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    type: minigameType().notNull(),
    enabled: boolean().default(true).notNull(),
    generalSettings: jsonb().$type<MinigameGeneralSettings>().notNull(),
    appearance: jsonb().$type<MinigameAppearance>().notNull(),
    playerSettings: jsonb().$type<MinigamePlayerSettings>().notNull(),
    prizeSettings: jsonb().$type<MinigamePrizeSettings>().notNull(),
    winningMessageSettings: jsonb()
      .$type<MinigameWinningMessageSettings>()
      .notNull(),
    nonWinningMessageSettings: jsonb()
      .$type<MinigameNonWinningMessageSettings>()
      .notNull(),
    playsCount: integer().default(0).notNull(),
    participantsCount: integer().default(0).notNull(),
    winnersCount: integer().default(0).notNull(),
    // Qualified referrals across the whole minigame. Only bumped when a
    // per-contact credit actually lands (see `MinigameContact.sharesCount`),
    // so `Minigame.sharesCount == SUM(MinigameContact.sharesCount)` always
    // holds and the two admin tables add up. Referrals beyond a sharer's
    // `playerSettings.maxSharesPerPerson` are deliberately uncounted here.
    sharesCount: integer().default(0).notNull(),
  },
  (table) => [
    index("Minigame_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("Minigame_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
