import { isNumericId } from "@chatbotx.io/utils/id"
import {
  isPlainObject,
  MAX_WALK_DEPTH,
  REFERENCE_FIELD_ENTITY_KIND,
} from "./reference-fields"
import { remapFlowGraphReferences } from "./remap"
import type { FlowExportedFlow } from "./schema"

export type FlowReferenceWarning = {
  entityKind: string
  path: string
  value: string
}

/**
 * Read-only: finds fields that point at workspace-scoped entities so the
 * caller can report which pickers to repoint after import. Never mutates the
 * graph and never gates the import — an unresolvable reference is reported,
 * not rejected.
 *
 * Reimplemented on top of the generic walker in `remap.ts` (empty idMaps ->
 * every in-scope reference misses -> every reference is reported via
 * `onUnresolved`) so there is exactly one graph-walking implementation.
 */
export const collectFlowReferenceWarnings = (
  flow: FlowExportedFlow,
): FlowReferenceWarning[] => {
  const warnings: FlowReferenceWarning[] = []
  remapFlowGraphReferences(
    flow,
    {},
    {
      onUnresolved: (ref) => warnings.push(ref),
    },
  )
  return warnings
}

const isCustomFieldReferenceKey = (key: string): boolean =>
  REFERENCE_FIELD_ENTITY_KIND[key] === "customField"

const collectCustomFieldIds = (
  value: unknown,
  ids: Set<string>,
  depth = 0,
): void => {
  if (depth > MAX_WALK_DEPTH) {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCustomFieldIds(item, ids, depth + 1)
    }
    return
  }
  if (!isPlainObject(value)) {
    return
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      isCustomFieldReferenceKey(key) &&
      typeof child === "string" &&
      isNumericId(child)
    ) {
      ids.add(child)
    }
    collectCustomFieldIds(child, ids, depth + 1)
  }
}

/**
 * Read-only: finds every custom-field id referenced by a reference slot
 * (`REFERENCE_FIELD_ENTITY_KIND[key] === "customField"`), deduplicated.
 * System-field slugs (`first_name`, `user_tags`) and merge-tag text share the
 * same slots but are excluded by `isNumericId`, which is fully anchored
 * (`/^\d+$/`) — unlike `zodBigintAsString`'s unanchored pattern, so this
 * filter is a sound discriminator on its own.
 *
 * Kept as a dedicated walker (not built on the generic `remapReferences`)
 * because of the `isNumericId` filter, which only applies on the collect
 * side — on the write side `idMap.has()` is a sufficient discriminator.
 *
 * Accepts `nodes`/`edges` as `unknown[]` (not the strict `FlowExportedFlow`
 * shape) so callers can pass a flow-version row straight from the DB — those
 * columns are typed loosely (`{ id: string; [x: string]: unknown }[]`) at the
 * jsonb boundary, before `parseFlowExport` narrows them.
 */
export const collectCustomFieldReferences = (flow: {
  nodes: readonly unknown[]
  edges: readonly unknown[]
}): string[] => {
  const ids = new Set<string>()
  collectCustomFieldIds(flow.nodes, ids)
  collectCustomFieldIds(flow.edges, ids)
  return [...ids]
}

/**
 * Structural clone of `flow` with every custom-field reference slot rewritten
 * from a source-workspace id to a target-workspace id via `idMap`. An id
 * absent from the map passes through unchanged (so it still surfaces as an
 * unresolved-reference warning downstream). Never mutates the input.
 *
 * One-line adapter over the generic `remapFlowGraphReferences`, restricted to
 * `kinds: ["customField"]` so every other reference rule (array-valued keys,
 * discriminated unions, prefixed tokens) is inert here — behavior is
 * provably identical to the pre-generalization implementation.
 */
export const remapCustomFieldReferences = <
  T extends Pick<FlowExportedFlow, "edges" | "nodes">,
>(
  flow: T,
  idMap: ReadonlyMap<string, string>,
): T =>
  remapFlowGraphReferences(
    flow,
    { customField: idMap },
    {
      kinds: ["customField"],
    },
  )
