import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  AiHandoverChannel,
  AiHandoverTimeRange,
} from "../partials/ai-handover"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { flowModel } from "./flow"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

/**
 * Settings of the platform's hand-off with an AI agent (Meta Business AI on
 * Messenger), one row per Page (inbox). Meta's AI is configured per Page, so
 * the settings are too. No credentials live here, so there is no `Integration`
 * parent row; a second provider adds a row for its own inbox, not a table.
 */
export const aiHandoverSettingsModel = pgTable(
  "AIHandoverSettings",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // Plain text like `Inbox.channel`, typed by the channel registry
    // (`AI_HANDOVER_CHANNEL_POLICIES`): a new channel needs no migration.
    channel: text().$type<AiHandoverChannel>().notNull(),
    // Master switch for the platform's AI hand-off automation.
    enabled: boolean().notNull().default(false),
    // When on, `timeRanges` (hours of the workspace timezone) bound `enabled`.
    scheduleEnabled: boolean().notNull().default(false),
    // NO `.default()` on purpose (AGENTS.md "phantom jsonb defaults"): every
    // write supplies it, an empty array when no window is configured.
    timeRanges: jsonb().$type<AiHandoverTimeRange[]>().notNull(),
    // Flow started when the AI hands the conversation back; falls back to the
    // return message when unset or no longer active.
    gotoFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    returnMessage: text(),
    // Pause the bot for the contact after the hand-back, waiting for a human.
    pauseBotWaitingForStaff: boolean().notNull().default(false),
    // "Apply to all customers": the DESIRED state of the Page's conversations
    // (true = every eligible thread handed to the AI). A bulk run reconciles
    // the Page to it; `applyToAllRevision` counts real changes of it (a click
    // that repeats the current state changes nothing), and a run serves one
    // revision.
    applyToAllCustomers: boolean().notNull().default(false),
    applyToAllRevision: integer().notNull().default(0),
    // The text sent with the HUMAN_AGENT tag when the last change was an OFF.
    applyToAllMessage: text(),
    // Who made the last change; `set null` so deleting the user keeps the row.
    applyToAllRequestedByUserId: bigintAsString().references(
      () => userModel.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
  },
  (table) => [
    uniqueIndex("AIHandoverSettings_inboxId_key").on(table.inboxId),
    index("AIHandoverSettings_workspaceId_idx").on(table.workspaceId),
    index("AIHandoverSettings_applyToAllRequestedByUserId_idx").on(
      table.applyToAllRequestedByUserId,
    ),
    index("AIHandoverSettings_gotoFlowId_idx").using(
      "btree",
      table.gotoFlowId.asc().nullsLast(),
    ),
  ],
)
