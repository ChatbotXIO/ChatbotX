import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  isVerifiableReferenceKind,
  referenceExistenceRepository,
} from "@chatbotx.io/database/repositories"
import {
  isWorkspaceBoundReferenceValue,
  REFERENCE_KIND_POLICY,
  type ReferencePolicy,
  type RemoveUnresolvedResult,
  referenceKindsWithPolicy,
  removeUnresolvedReferencesDetailed,
  STRIP_UNRESOLVED_ARRAY_REFERENCE_KINDS,
  type UnresolvedReference,
} from "@chatbotx.io/flow-config"

/** Policies whose references can never be kept as the source wrote them. */
const REMOVE_WHEN_UNRESOLVED: ReadonlySet<ReferencePolicy> = new Set([
  "naturalKey",
  "strip",
])

/**
 * `remapReferences` already drops a stripped-kind array element while it
 * reports it, so removing that path again would take out a different element.
 */
const isAlreadyStripped = (reference: UnresolvedReference): boolean =>
  STRIP_UNRESOLVED_ARRAY_REFERENCE_KINDS.has(reference.entityKind) &&
  reference.path.endsWith("]")

/**
 * Existence answers already known during one install, keyed `<kind>:<id>`, so
 * a reference repeated across flows costs one query for the whole install.
 */
export type ReferenceExistenceCache = Map<string, boolean>

const groupByKind = (
  references: readonly UnresolvedReference[],
): Map<string, UnresolvedReference[]> =>
  Map.groupBy(references, (reference) => reference.entityKind)

/**
 * The references that must not stay in the graph: a `naturalKey` or `strip`
 * reference no map resolved, and a `verifyInTarget` reference whose id does not
 * exist in the target workspace. Only ids are judged (`isNumericId`) — a
 * system-field slug sharing a customField slot is not a reference — and a kind
 * this module cannot verify is left as written rather than guessed at.
 */
const selectReferencesToRemove = async (input: {
  workspaceId: string
  references: readonly UnresolvedReference[]
  tx: DatabaseClient
  cache: ReferenceExistenceCache
  verifyKinds?: ReadonlySet<string>
  removeKinds?: ReadonlySet<string>
}): Promise<UnresolvedReference[]> => {
  const idReferences = input.references.filter(
    (reference) =>
      !isAlreadyStripped(reference) &&
      isWorkspaceBoundReferenceValue(reference.entityKind, reference.value),
  )
  const removable: UnresolvedReference[] = []
  for (const [kind, references] of groupByKind(idReferences)) {
    // A caller with no manifest for a natural-key kind (a single-flow import)
    // may only keep the ids that exist in the importing workspace.
    const policy = input.verifyKinds?.has(kind)
      ? "verifyInTarget"
      : REFERENCE_KIND_POLICY[kind]
    if (
      input.removeKinds?.has(kind) ||
      (policy && REMOVE_WHEN_UNRESOLVED.has(policy))
    ) {
      removable.push(...references)
      continue
    }
    if (policy === "verifyInTarget" && isVerifiableReferenceKind(kind)) {
      const unknownIds = [
        ...new Set(references.map((reference) => reference.value)),
      ].filter((id) => !input.cache.has(`${kind}:${id}`))
      if (unknownIds.length > 0) {
        const existing = await referenceExistenceRepository.findExistingIds(
          { workspaceId: input.workspaceId, kind, ids: unknownIds },
          input.tx,
        )
        for (const id of unknownIds) {
          input.cache.set(`${kind}:${id}`, existing.has(id))
        }
      }
      removable.push(
        ...references.filter(
          (reference) => !input.cache.get(`${kind}:${reference.value}`),
        ),
      )
    }
  }
  return removable
}

type SanitizeInput<T> = {
  workspaceId: string
  graph: T
  unresolved: readonly UnresolvedReference[]
  tx: DatabaseClient
  /** Share one across the flows of an install to avoid repeating a lookup. */
  cache?: ReferenceExistenceCache
  /**
   * Kinds judged by existence in the target workspace whatever their policy:
   * for a caller that ships no manifest for them, so the file's ids are only
   * ever kept when they are the importing workspace's own.
   */
  verifyKinds?: ReadonlySet<string>
  /**
   * Kinds removed when unresolved whatever their policy. A `copy` kind is
   * shipped inside the template, so one still unresolved after the remap names
   * a row the template does not carry: only a caller that has finished
   * installing that kind may list it (a flow's own flow references resolve in
   * a later patch step).
   */
  removeKinds?: ReadonlySet<string>
}

/**
 * Removes every reference in `graph` that cannot be kept in the target
 * workspace (see `selectReferencesToRemove`), schema-aware per slot, so an
 * installed flow never points at another workspace's id. A required slot
 * inside an array element drops that element (`droppedElements`); a required
 * slot elsewhere is reported in `blocked` and the caller skips the flow. One
 * existence query per verifiable kind, however many references the graph holds.
 */
export const sanitizeFlowGraphReferences = async <T>(
  input: SanitizeInput<T>,
  mode: "clear" | "repair" = "repair",
): Promise<RemoveUnresolvedResult<T>> => {
  const toRemove =
    input.unresolved.length === 0
      ? []
      : await selectReferencesToRemove({
          workspaceId: input.workspaceId,
          references: input.unresolved,
          tx: input.tx,
          cache: input.cache ?? new Map(),
          verifyKinds: input.verifyKinds,
          removeKinds: input.removeKinds,
        })
  return removeUnresolvedReferencesDetailed(input.graph, toRemove, mode)
}

export const sanitizeUnresolvedReferences = async <T>(
  input: SanitizeInput<T>,
): Promise<T> => (await sanitizeFlowGraphReferences(input, "clear")).value

const ENTRY_ROOT_PREFIX = /^entry\.?/

let copyKinds: ReadonlySet<string> | undefined

/**
 * The `copy` kinds, which a caller that has installed them can never leave
 * unresolved. Read on first use, not at import: modules that merely import
 * this file must not need the reference registry loaded.
 */
export const copyReferenceKinds = (): ReadonlySet<string> => {
  copyKinds ??= new Set(referenceKindsWithPolicy("copy"))
  return copyKinds
}

/** What `sanitizeEntryReferences` returns: the cleaned value and the paths it removed, relative to the value. */
export type SanitizedEntryReferences<T> = {
  value: T
  removed: string[]
}

/**
 * The safety net for a resource that is not a flow graph (a trigger's actions,
 * a reply payload): removes every reference the remap left unresolved, so the
 * copy never points at the source workspace's id. Uses the same per-slot rules
 * as a flow (optional -> key deleted, nullable -> null, array item dropped, a
 * required slot inside an array element -> that element dropped). `keepKinds`
 * are `copy` kinds that resolve later (the adapter's own kind).
 */
export const sanitizeEntryReferences = async <T>(input: {
  workspaceId: string
  tx: DatabaseClient
  value: T
  unresolved: readonly UnresolvedReference[]
  cache?: ReferenceExistenceCache
  keepKinds?: ReadonlySet<string>
}): Promise<SanitizedEntryReferences<T>> => {
  const unresolved = input.unresolved.filter(
    (reference) => !input.keepKinds?.has(reference.entityKind),
  )
  if (unresolved.length === 0) {
    return { value: input.value, removed: [] }
  }
  // Rooted under a key so a required slot of a top-level array element has a
  // container to be dropped from.
  const rooted = await sanitizeFlowGraphReferences(
    {
      workspaceId: input.workspaceId,
      graph: { entry: input.value },
      unresolved: unresolved.map((reference) => ({
        ...reference,
        path: reference.path.startsWith("[")
          ? `entry${reference.path}`
          : `entry.${reference.path}`,
      })),
      tx: input.tx,
      cache: input.cache,
      removeKinds: copyReferenceKinds(),
    },
    "repair",
  )
  const strip = (path: string) => path.replace(ENTRY_ROOT_PREFIX, "")
  return {
    value: rooted.value.entry,
    removed: [
      ...rooted.removed,
      ...rooted.droppedElements,
      ...rooted.blocked,
    ].map(strip),
  }
}
