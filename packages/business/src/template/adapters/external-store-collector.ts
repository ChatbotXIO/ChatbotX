import { workspaceUsesExternalStore } from "../external-store"
import { EMPTY_COLLECT_RESULT } from "./shared"
import type { ResourceCollector } from "./types"

/**
 * A collector that offers nothing while the workspace sells from an external
 * store: the whole Ecommerce group stays out of the template (see
 * `external-store.ts`). Covers the `mode:"all"` resolution, an explicit
 * selection and the collection (hence the dependency pull) alike.
 */
export const withoutExternalStore = (
  collector: ResourceCollector,
): ResourceCollector => ({
  resolveIds: async (workspaceId, limit) =>
    (await workspaceUsesExternalStore(workspaceId))
      ? []
      : await collector.resolveIds(workspaceId, limit),
  verifyOwnership: async (workspaceId, ids) =>
    (await workspaceUsesExternalStore(workspaceId))
      ? []
      : await collector.verifyOwnership(workspaceId, ids),
  collect: async (workspaceId, ids) =>
    (await workspaceUsesExternalStore(workspaceId))
      ? EMPTY_COLLECT_RESULT
      : await collector.collect(workspaceId, ids),
})
