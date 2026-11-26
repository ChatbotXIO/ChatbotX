import {
  boolean,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { AIAgentModelConfig } from "../partials/ai"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * Inbox bidirectional translation settings, one row per workspace. The target
 * language is `Workspace.language`; this table only holds the switch and the AI
 * model that translates.
 */
export const inboxTranslationSettingsModel = pgTable(
  "InboxTranslationSettings",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    enabled: boolean().notNull().default(false),
    // First time translation was switched on. Not a translation boundary:
    // older messages are translated when someone views them. It only tells
    // that the feature was ever used (`hasEverBeenEnabled`) and drives the
    // first-time confirmation.
    enabledAt: timestamp(timestampConfig),
    // NO `.default()` on purpose (jsonb default trap): NULL = not configured.
    // No FK to `Integration`, like `AIAgent`: a removed integration surfaces as
    // `integrationUnavailable` from the model resolver.
    modelConfig: jsonb().$type<AIAgentModelConfig>(),
  },
  (table) => [
    uniqueIndex("InboxTranslationSettings_workspaceId_key").on(
      table.workspaceId,
    ),
  ],
)
