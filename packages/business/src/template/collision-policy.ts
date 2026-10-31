import type { ManifestKey } from "./adapters/manifests/resolve"

/**
 * What the install does when the target workspace already has something for a
 * manifest entry. The table is the one statement of that behavior: the install
 * preview reads it to predict each action, and it is the reference the
 * manifest resolvers are tested against.
 *
 * - `reuse`: the existing row stands in (nothing is created or overwritten).
 * - `reuseOrRename`: reused only when the type matches too; a same-named row of
 *   another type is NOT reused, a differently named copy is created instead
 *   (message variables resolve by name, so two same-named fields would clash).
 * - `bind`: never created; the installer's inbox (or the same inbox) stands in,
 *   and what cannot be bound stays unbound.
 */
export type CollisionStrategy = "reuse" | "reuseOrRename" | "bind"

/**
 * A manifest kind, plus the bot fields: they ship as settings resources rather
 * than a manifest, but are found-or-created by `(name, type)` under the same
 * rename rule as custom fields.
 */
export type CollisionKind = ManifestKey | "botFields"

export const MANIFEST_COLLISION_POLICY: Readonly<
  Record<CollisionKind, { strategy: CollisionStrategy; key: string }>
> = {
  folders: { strategy: "reuse", key: "folderType + parent + name" },
  customFields: { strategy: "reuseOrRename", key: "name + type" },
  botFields: { strategy: "reuseOrRename", key: "name + type" },
  tags: { strategy: "reuse", key: "name" },
  productCategories: { strategy: "reuse", key: "parent + name (any case)" },
  pipelines: { strategy: "reuse", key: "reference name" },
  inboxes: { strategy: "bind", key: "channel + installer binding" },
}

export type PredictedAction = "create" | "reuse" | "rename" | "bind" | "unbound"

export type CollisionMatch = {
  /** A row matching the policy's key exists in the target workspace. */
  found: boolean
  /** A row with the same name but another type exists (custom fields). */
  sameNameOtherType?: boolean
  /** An inbox can stand in (inboxes). */
  bindable?: boolean
}

/** The action `strategy` takes for `match`. */
export const predictAction = (
  kind: CollisionKind,
  match: CollisionMatch,
): PredictedAction => {
  switch (MANIFEST_COLLISION_POLICY[kind].strategy) {
    case "bind":
      return match.bindable ? "bind" : "unbound"
    case "reuseOrRename":
      if (match.found) {
        return "reuse"
      }
      return match.sameNameOtherType ? "rename" : "create"
    default:
      return match.found ? "reuse" : "create"
  }
}
