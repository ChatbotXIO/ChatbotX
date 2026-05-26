import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * Lifecycle Stage — etapa do funil/ciclo de vida do contato.
 *
 * Cada workspace tem uma lista de etapas (Active 🏆 + Lost 😞).
 * Cada Contact aponta pra exatamente UMA etapa.
 *
 * Regras:
 * - Apenas 1 etapa com is_default=true por workspace
 * - is_default só pode ser true quando is_lost=false
 * - key (slug) único por workspace
 */
export const lifecycleStageModel = pgTable(
  "LifecycleStage",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    key: text().notNull(), // slug: novo_lead, lead_quente, etc.
    name: text().notNull(), // label visível: "Novo Lead"
    icon: text(), // emoji unicode: "📥"
    color: text(), // hex: "#3b82f6"
    description: text(),
    position: integer().default(0).notNull(),
    isDefault: boolean().default(false).notNull(),
    isLost: boolean().default(false).notNull(),
    isActive: boolean().default(true).notNull(),
  },
  (table) => [
    uniqueIndex("LifecycleStage_workspaceId_key_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.key.asc().nullsLast(),
    ),
    index("LifecycleStage_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("LifecycleStage_position_idx").using(
      "btree",
      table.position.asc().nullsLast(),
    ),
  ],
)
