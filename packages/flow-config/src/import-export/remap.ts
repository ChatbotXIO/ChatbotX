import {
  FieldReferenceKind,
  formatBotFieldReference,
  parseFieldReference,
} from "../field-reference"
import {
  CROSS_FLOW_NODE_FIELD,
  DISCRIMINATED_REFERENCE_FIELDS,
  FLOW_REFERENCE_FIELD,
  isPlainObject,
  MAX_WALK_DEPTH,
  PREFIXED_REFERENCE_ENTITY_KIND,
  PREFIXED_REFERENCE_FIELDS,
  REFERENCE_ARRAY_FIELD_ENTITY_KIND,
  REFERENCE_FIELD_ENTITY_KIND,
} from "./reference-fields"

export type UnresolvedReference = {
  entityKind: string
  path: string
  value: string
}

export type ReferenceIdMaps = Readonly<
  Record<string, ReadonlyMap<string, string>>
>

export type RemapOptions = {
  /**
   * Restrict remapping (and warning collection) to these entity kinds. When
   * omitted, every kind known to `reference-fields.ts` participates. Passing
   * `["customField"]` makes every other rule inert — this is how
   * `remapCustomFieldReferences` stays behaviorally identical to its
   * pre-generalization form.
   */
  readonly kinds?: readonly string[]
  /**
   * Called once per reference slot whose value has no entry in the
   * corresponding `idMaps[entityKind]` map — i.e. a genuine miss, not merely
   * "this kind is out of scope". Lets rewrite and warning collection happen
   * in one walk, keyed on actual map misses.
   */
  readonly onUnresolved?: (ref: UnresolvedReference) => void
}

const kindEnabled = (kind: string, kinds?: readonly string[]): boolean =>
  !kinds || kinds.includes(kind)

const splitPrefixedToken = (
  token: string,
): { prefix: string; id: string } | null => {
  const separatorIndex = token.indexOf(":")
  if (separatorIndex <= 0) {
    return null
  }
  return {
    prefix: token.slice(0, separatorIndex),
    id: token.slice(separatorIndex + 1),
  }
}

const remapPrefixedToken = (
  token: string,
  path: string,
  idMaps: ReferenceIdMaps,
  options: RemapOptions | undefined,
): string => {
  const parsed = splitPrefixedToken(token)
  if (!parsed) {
    return token
  }
  const entityKind = PREFIXED_REFERENCE_ENTITY_KIND[parsed.prefix]
  if (!(entityKind && kindEnabled(entityKind, options?.kinds))) {
    return token
  }
  const idMap = idMaps[entityKind]
  const mapped = idMap?.get(parsed.id)
  if (mapped) {
    return `${parsed.prefix}:${mapped}`
  }
  options?.onUnresolved?.({ entityKind, path, value: parsed.id })
  return token
}

const remapPrefixedValue = (
  value: unknown,
  path: string,
  idMaps: ReferenceIdMaps,
  options: RemapOptions | undefined,
): unknown => {
  if (typeof value === "string") {
    return remapPrefixedToken(value, path, idMaps, options)
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      typeof item === "string"
        ? remapPrefixedToken(item, `${path}[${index}]`, idMaps, options)
        : item,
    )
  }
  return value
}

const resolveScalarRef = (
  value: unknown,
  entityKind: string,
  path: string,
  idMaps: ReferenceIdMaps,
  options: RemapOptions | undefined,
): { resolved: true; value: string } | { resolved: false } => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { resolved: false }
  }
  const idMap = idMaps[entityKind]
  const mapped = idMap?.get(value)
  if (mapped) {
    return { resolved: true, value: mapped }
  }
  options?.onUnresolved?.({ entityKind, path, value })
  return { resolved: false }
}

type BotFieldSlotResult = { matched: true; value: string } | { matched: false }

/**
 * Recognizes a valid `bot_field:<id>` token in a scalar `customField`-kind
 * reference slot (`inputFieldId`, `customFieldId`, ...) and resolves it
 * against `idMaps.botField` instead of `idMaps.customField` — mirrors
 * `remapPrefixedToken`'s "leave unchanged + report onUnresolved on a miss"
 * contract, but is a dedicated helper (not routed through
 * `PREFIXED_REFERENCE_FIELDS`) because it must run on every customField-kind
 * scalar slot, not just the free-text `tools` key.
 *
 * Returns `{ matched: false }` for anything that is not a well-formed bot
 * token (a legacy numeric id, a legacy name, or a malformed near-token like
 * `bot_field:abc`) so the caller falls through to the normal customField
 * resolution — a malformed near-token is never misreported as a botField
 * reference.
 *
 * When `"botField"` is excluded by `options.kinds`, a well-formed token is
 * still reported as matched (so it is never misrouted into customField
 * resolution) but is left completely untouched — no rewrite, no warning —
 * consistent with how every other kind gate behaves when out of scope.
 */
const resolveBotFieldReferenceSlot = (
  value: unknown,
  path: string,
  idMaps: ReferenceIdMaps,
  options: RemapOptions | undefined,
): BotFieldSlotResult => {
  if (typeof value !== "string") {
    return { matched: false }
  }
  const parsed = parseFieldReference(value)
  if (parsed.kind !== FieldReferenceKind.botField) {
    return { matched: false }
  }
  if (!kindEnabled(FieldReferenceKind.botField, options?.kinds)) {
    return { matched: true, value }
  }
  const idMap = idMaps[FieldReferenceKind.botField]
  const mapped = idMap?.get(parsed.id)
  if (mapped) {
    return { matched: true, value: formatBotFieldReference(mapped) }
  }
  options?.onUnresolved?.({
    entityKind: FieldReferenceKind.botField,
    path,
    value: parsed.id,
  })
  return { matched: true, value }
}

const remapArrayRef = (
  value: unknown,
  entityKind: string,
  path: string,
  idMaps: ReferenceIdMaps,
  options: RemapOptions | undefined,
): unknown => {
  if (!Array.isArray(value)) {
    return value
  }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    const result = resolveScalarRef(item, entityKind, itemPath, idMaps, options)
    return result.resolved ? result.value : item
  })
}

/**
 * Shared shape behind every scalar reference slot below: resolve `child`
 * against `idMaps[kind]`, or recurse into it (it may still contain nested
 * reference slots) when there is no map entry to rewrite.
 */
const resolveScalarOrRecurse = (
  child: unknown,
  kind: string,
  childPath: string,
  idMaps: ReferenceIdMaps,
  options: RemapOptions | undefined,
  depth: number,
): unknown => {
  const result = resolveScalarRef(child, kind, childPath, idMaps, options)
  if (result.resolved) {
    return result.value
  }
  return remapValue(child, childPath, idMaps, options, depth + 1)
}

const resolveDiscriminatedKind = (
  key: string,
  container: Record<string, unknown>,
): string | null => {
  const config = DISCRIMINATED_REFERENCE_FIELDS[key]
  if (!config) {
    return null
  }
  const discriminatorValue = container[config.discriminatorKey]
  if (typeof discriminatorValue !== "string") {
    return null
  }
  return config.kindByDiscriminator[discriminatorValue] ?? null
}

/**
 * Structural clone of `value` with every known reference slot rewritten from
 * a source id to a target id via `idMaps`, restricted to `options.kinds` when
 * given. An id absent from the relevant map passes through unchanged and is
 * reported via `options.onUnresolved`. Never mutates the input.
 *
 * Past `MAX_WALK_DEPTH` the remaining subtree is returned as-is — truncation
 * can only leave references un-remapped, never drop data.
 */
export const remapReferences = <T>(
  value: T,
  idMaps: ReferenceIdMaps,
  options?: RemapOptions,
): T => remapValue(value, "", idMaps, options, 0) as T

const remapValue = (
  value: unknown,
  path: string,
  idMaps: ReferenceIdMaps,
  options: RemapOptions | undefined,
  depth: number,
): unknown => {
  if (depth > MAX_WALK_DEPTH) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      remapValue(item, `${path}[${index}]`, idMaps, options, depth + 1),
    )
  }
  if (!isPlainObject(value)) {
    return value
  }

  const hasCrossFlowJump =
    kindEnabled("flow", options?.kinds) &&
    typeof value[FLOW_REFERENCE_FIELD] === "string"

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    next[key] = remapEntry({
      key,
      child,
      childPath,
      container: value,
      idMaps,
      options,
      hasCrossFlowJump,
      depth,
    })
  }
  return next
}

type RemapEntryArgs = {
  key: string
  child: unknown
  childPath: string
  container: Record<string, unknown>
  idMaps: ReferenceIdMaps
  options: RemapOptions | undefined
  hasCrossFlowJump: boolean
  depth: number
}

const remapEntry = (args: RemapEntryArgs): unknown => {
  const { key, child, childPath, container, idMaps, options, depth } = args

  const scalarKind = REFERENCE_FIELD_ENTITY_KIND[key]
  if (scalarKind) {
    // A `bot_field:<id>` token can appear in any customField-kind slot
    // (Account Fields reuse the same picker/steps as Custom Fields). It must
    // be recognized and routed to `idMaps.botField` BEFORE the generic
    // customField resolution below runs — otherwise the whole token would be
    // looked up as a literal customField id/name and either misresolve or
    // spuriously warn as an unresolved customField reference.
    if (scalarKind === FieldReferenceKind.customField) {
      const botFieldResult = resolveBotFieldReferenceSlot(
        child,
        childPath,
        idMaps,
        options,
      )
      if (botFieldResult.matched) {
        return botFieldResult.value
      }
    }
    if (kindEnabled(scalarKind, options?.kinds)) {
      return resolveScalarOrRecurse(
        child,
        scalarKind,
        childPath,
        idMaps,
        options,
        depth,
      )
    }
  }

  const arrayKind = REFERENCE_ARRAY_FIELD_ENTITY_KIND[key]
  if (
    arrayKind &&
    kindEnabled(arrayKind, options?.kinds) &&
    Array.isArray(child)
  ) {
    return remapArrayRef(child, arrayKind, childPath, idMaps, options)
  }

  const discriminatedKind = resolveDiscriminatedKind(key, container)
  if (discriminatedKind && kindEnabled(discriminatedKind, options?.kinds)) {
    return resolveScalarOrRecurse(
      child,
      discriminatedKind,
      childPath,
      idMaps,
      options,
      depth,
    )
  }

  if (PREFIXED_REFERENCE_FIELDS.has(key)) {
    return remapPrefixedValue(child, childPath, idMaps, options)
  }

  if (key === FLOW_REFERENCE_FIELD && kindEnabled("flow", options?.kinds)) {
    return resolveScalarOrRecurse(
      child,
      "flow",
      childPath,
      idMaps,
      options,
      depth,
    )
  }

  if (
    key === CROSS_FLOW_NODE_FIELD &&
    args.hasCrossFlowJump &&
    kindEnabled("flowNode", options?.kinds)
  ) {
    return resolveScalarOrRecurse(
      child,
      "flowNode",
      childPath,
      idMaps,
      options,
      depth,
    )
  }

  return remapValue(child, childPath, idMaps, options, depth + 1)
}

/**
 * `remapReferences` specialized for a `{nodes, edges}` flow graph — walks
 * both arrays and returns a same-shaped clone.
 */
export const remapFlowGraphReferences = <
  T extends { nodes: unknown; edges: unknown },
>(
  value: T,
  idMaps: ReferenceIdMaps,
  options?: RemapOptions,
): T => ({
  ...value,
  nodes: remapReferences(value.nodes, idMaps, options),
  edges: remapReferences(value.edges, idMaps, options),
})

/**
 * Read-only: collects every reference id found, grouped by entity kind.
 * Restricted to `options.kinds` when given. Used to build id-maps ahead of
 * an install (find-or-create manifests need to know every id in play before
 * `remapReferences` can be run).
 */
export const collectReferencesByKind = (
  value: unknown,
  kinds?: readonly string[],
): Map<string, Set<string>> => {
  const byKind = new Map<string, Set<string>>()
  const onUnresolved = ({ entityKind, value: id }: UnresolvedReference) => {
    const set = byKind.get(entityKind) ?? new Set<string>()
    set.add(id)
    byKind.set(entityKind, set)
  }
  // An empty idMaps means every lookup misses, so every in-scope reference
  // is reported to onUnresolved exactly once — this is intentionally reused
  // as a pure collector, not a rewrite.
  remapReferences(value, {}, { kinds, onUnresolved })
  return byKind
}
