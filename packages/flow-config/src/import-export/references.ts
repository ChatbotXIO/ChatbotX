import { isNumericId } from "@chatbotx.io/utils/id"
import { FieldReferenceKind, parseFieldReference } from "../field-reference"
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

const isBotFieldReferenceKey = (key: string): boolean =>
  REFERENCE_FIELD_ENTITY_KIND[key] === FieldReferenceKind.botField

export type FlowFieldReferenceIds = {
  customFieldIds: string[]
  botFieldIds: string[]
}

type FieldReferenceIdSets = {
  customFieldIds: Set<string>
  botFieldIds: Set<string>
}

const collectFieldReferenceIds = (
  value: unknown,
  ids: FieldReferenceIdSets,
  depth = 0,
): void => {
  if (depth > MAX_WALK_DEPTH) {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFieldReferenceIds(item, ids, depth + 1)
    }
    return
  }
  if (!isPlainObject(value)) {
    return
  }

  for (const [key, child] of Object.entries(value)) {
    if (isCustomFieldReferenceKey(key) && typeof child === "string") {
      const parsed = parseFieldReference(child)
      if (parsed.kind === FieldReferenceKind.botField) {
        ids.botFieldIds.add(parsed.id)
      } else if (isNumericId(child)) {
        ids.customFieldIds.add(child)
      }
    } else if (
      isBotFieldReferenceKey(key) &&
      typeof child === "string" &&
      isNumericId(child)
    ) {
      // A dedicated `botField`-kind key (e.g. the Condition step's
      // `botFieldId`) holds a raw bot-field id directly — never a
      // `bot_field:<id>` token — so it is collected without going through
      // `parseFieldReference`.
      ids.botFieldIds.add(child)
    }
    collectFieldReferenceIds(child, ids, depth + 1)
  }
}

/**
 * Read-only: finds every custom-field id AND every bot-field id referenced by
 * a reference slot (`REFERENCE_FIELD_ENTITY_KIND[key] === "customField"`),
 * deduplicated per kind. System-field slugs (`first_name`, `user_tags`) and
 * merge-tag text share the same slots but are excluded from `customFieldIds`
 * by `isNumericId`, which is fully anchored (`/^\d+$/`) — unlike
 * `zodBigintAsString`'s unanchored pattern, so this filter is a sound
 * discriminator on its own. A malformed near-token (e.g. `bot_field:abc`) is
 * neither a valid bot token nor a numeric id, so it contributes to neither
 * list — matching legacy behavior for any other non-numeric legacy name.
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
export const collectFieldReferences = (flow: {
  nodes: readonly unknown[]
  edges: readonly unknown[]
}): FlowFieldReferenceIds => {
  const ids: FieldReferenceIdSets = {
    customFieldIds: new Set<string>(),
    botFieldIds: new Set<string>(),
  }
  collectFieldReferenceIds(flow.nodes, ids)
  collectFieldReferenceIds(flow.edges, ids)
  return {
    customFieldIds: [...ids.customFieldIds],
    botFieldIds: [...ids.botFieldIds],
  }
}

/**
 * Thin wrapper over `collectFieldReferences` kept for existing callers that
 * only ever cared about custom-field ids (behaviorally identical to the
 * pre-`collectFieldReferences` implementation).
 */
export const collectCustomFieldReferences = (flow: {
  nodes: readonly unknown[]
  edges: readonly unknown[]
}): string[] => collectFieldReferences(flow).customFieldIds

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
