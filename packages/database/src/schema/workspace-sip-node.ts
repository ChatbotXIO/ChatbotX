import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * Atomically pins a workspace to exactly one FreeSWITCH node (* `WorkspaceSipNode`). `workspaceId` is the primary key by design — a
 * workspace has at most one pin, and `INSERT … ON CONFLICT (workspaceId) DO
 * NOTHING` (`workspaceSipNodeRepository.pinOrGet`) is how the least-loaded
 * node is chosen exactly once. `nodeId` is a key into the `FS_NODES` env map,
 * not a foreign key — FreeSWITCH nodes are infrastructure, not database rows.
 */
export const workspaceSipNodeModel = pgTable("WorkspaceSipNode", {
  workspaceId: bigintAsString()
    .primaryKey()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  nodeId: text().notNull(),
  createdAt: timestamp(timestampConfig).defaultNow().notNull(),
})
