import {
  isPlainObject,
  REFERENCE_SLOT_SHAPE_BY_KEY,
  type ReferenceSlotShape,
  STEP_REFERENCE_SLOT_SHAPE,
} from "./reference-fields"
import type { UnresolvedReference } from "./remap"

type PathSegment = string | number

/** `nodes[0].data.steps[2].tagIds[1]` -> `["nodes", 0, "data", "steps", 2, "tagIds", 1]`. */
const parsePath = (path: string): PathSegment[] => {
  const segments: PathSegment[] = []
  for (const part of path.split(".")) {
    const [key, ...indexes] = part.split("[")
    if (key) {
      segments.push(key)
    }
    for (const index of indexes) {
      segments.push(Number.parseInt(index, 10))
    }
  }
  return segments
}

const readAt = (root: unknown, segments: readonly PathSegment[]): unknown => {
  let current: unknown = root
  for (const segment of segments) {
    if (typeof segment === "number" && Array.isArray(current)) {
      current = current[segment]
    } else if (typeof segment === "string" && isPlainObject(current)) {
      current = current[segment]
    } else {
      return
    }
  }
  return current
}

/** The nearest enclosing object with a string `stepType`, and the path relative to it. */
const findOwningStep = (
  root: unknown,
  segments: readonly PathSegment[],
): { stepType: string; relativePath: string } | undefined => {
  for (let end = segments.length - 1; end >= 0; end--) {
    const candidate = readAt(root, segments.slice(0, end))
    if (isPlainObject(candidate) && typeof candidate.stepType === "string") {
      return {
        stepType: candidate.stepType,
        relativePath: segments
          .slice(end)
          .filter((segment) => typeof segment === "string")
          .join("."),
      }
    }
  }
}

const isConditionRow = (container: unknown): boolean =>
  isPlainObject(container) &&
  typeof container.field === "string" &&
  typeof container.operator === "string"

const shapeOfSlot = (
  root: unknown,
  segments: readonly PathSegment[],
): ReferenceSlotShape => {
  const key = segments.at(-1)
  if (typeof key !== "string") {
    return "required"
  }
  if (isConditionRow(readAt(root, segments.slice(0, -1)))) {
    // A Condition row's id slots (`customFieldId`, `botFieldId`, ...) are optional.
    return "optional"
  }
  const owner = findOwningStep(root, segments)
  return (
    (owner &&
      STEP_REFERENCE_SLOT_SHAPE[owner.stepType]?.[owner.relativePath]) ||
    REFERENCE_SLOT_SHAPE_BY_KEY[key] ||
    "required"
  )
}

/** Arrays whose elements are the graph itself: dropping one is a flow-level failure, not a repair. */
const GRAPH_LEVEL_ARRAYS: ReadonlySet<string> = new Set(["nodes", "edges"])

type SlotOutcome =
  | { kind: "removed" }
  | { kind: "droppedElement"; elementPath: readonly PathSegment[] }
  | { kind: "blocked" }
  | { kind: "skipped" }

const hasStepType = (value: unknown): boolean =>
  isPlainObject(value) && typeof value.stepType === "string"

/**
 * A required slot inside a row drops that row; a required slot anywhere else
 * cannot be repaired, so the flow must be skipped.
 *
 * - A flow step (anything with a `stepType`) is never a row: dropping it would
 *   silently change what the flow does, so a required slot in a step blocks.
 * - Inside a flow step, only a Condition row or an action row (`actionType`)
 *   is droppable.
 * - Outside any step (a trigger's actions, a reply payload) every array
 *   element is a row.
 * The nearest enclosing row wins; reaching a flow step or the graph itself
 * first means there is none.
 */
const findDroppableElement = (
  root: unknown,
  segments: readonly PathSegment[],
): readonly PathSegment[] | undefined => {
  const insideStep = segments.some((_, end) =>
    hasStepType(readAt(root, segments.slice(0, end))),
  )
  for (let end = segments.length - 1; end > 0; end--) {
    const segment = segments[end]
    const arrayKey = segments[end - 1]
    if (typeof segment !== "number") {
      continue
    }
    if (typeof arrayKey === "string" && GRAPH_LEVEL_ARRAYS.has(arrayKey)) {
      return
    }
    const element = readAt(root, segments.slice(0, end + 1))
    if (hasStepType(element)) {
      return
    }
    if (
      !insideStep ||
      isConditionRow(element) ||
      (isPlainObject(element) && typeof element.actionType === "string")
    ) {
      return segments.slice(0, end + 1)
    }
  }
}

/** `clear` empties a required slot in place; `repair` follows the install rules (drop element / block flow). */
type RequiredSlotMode = "clear" | "repair"

const removeAt = (
  root: unknown,
  segments: readonly PathSegment[],
  mode: RequiredSlotMode,
): SlotOutcome => {
  const parent = readAt(root, segments.slice(0, -1))
  const last = segments.at(-1)
  if (Array.isArray(parent) && typeof last === "number") {
    parent.splice(last, 1)
    return { kind: "removed" }
  }
  if (!isPlainObject(parent) || typeof last !== "string") {
    return { kind: "skipped" }
  }
  const shape = shapeOfSlot(root, segments)
  if (shape === "optional") {
    delete parent[last]
    return { kind: "removed" }
  }
  if (shape === "nullable") {
    parent[last] = null
    return { kind: "removed" }
  }
  const elementPath =
    mode === "repair" ? findDroppableElement(root, segments) : undefined
  if (!elementPath) {
    if (mode === "clear") {
      parent[last] = ""
      return { kind: "removed" }
    }
    // Never left pointing at another workspace's id, even if the caller keeps the graph.
    parent[last] = ""
    return { kind: "blocked" }
  }
  const container = readAt(root, elementPath.slice(0, -1))
  const index = elementPath.at(-1)
  if (Array.isArray(container) && typeof index === "number") {
    container.splice(index, 1)
    return { kind: "droppedElement", elementPath }
  }
  return { kind: "blocked" }
}

const comparePathsDescending = (
  a: readonly PathSegment[],
  b: readonly PathSegment[],
): number => {
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index++) {
    const left = a[index] as PathSegment
    const right = b[index] as PathSegment
    if (left === right) {
      continue
    }
    if (typeof left === "number" && typeof right === "number") {
      return right - left
    }
    return String(right).localeCompare(String(left))
  }
  return b.length - a.length
}

export type RemoveUnresolvedResult<T> = {
  value: T
  /** Paths whose slot was cleared or removed in place. */
  removed: string[]
  /** Paths of array elements dropped because a required slot inside them was unresolved. */
  droppedElements: string[]
  /** Paths of required slots outside any droppable element: the flow cannot be kept. */
  blocked: string[]
}

const pathKey = (segments: readonly PathSegment[]): string =>
  JSON.stringify(segments)

const startsWithDropped = (
  segments: readonly PathSegment[],
  dropped: ReadonlySet<string>,
): boolean => {
  for (let end = 1; end <= segments.length; end++) {
    if (dropped.has(pathKey(segments.slice(0, end)))) {
      return true
    }
  }
  return false
}

/**
 * Structural clone of `value` with each reported reference removed in the way
 * its slot allows (see `ReferenceSlotShape`), so a reference that could not be
 * remapped never stays pointing at another workspace's id. A required slot
 * inside an array element drops that element; a required slot elsewhere is
 * reported in `blocked` for the caller to skip the flow. Array elements are
 * removed highest index first so earlier indexes stay valid. Never mutates the
 * input; a path that no longer resolves is skipped.
 */
export const removeUnresolvedReferencesDetailed = <T>(
  value: T,
  references: readonly Pick<UnresolvedReference, "path">[],
  mode: RequiredSlotMode = "repair",
): RemoveUnresolvedResult<T> => {
  const result: RemoveUnresolvedResult<T> = {
    value,
    removed: [],
    droppedElements: [],
    blocked: [],
  }
  if (references.length === 0) {
    return result
  }
  const root: unknown = structuredClone(value)
  const ordered = references
    .map((reference) => ({
      path: reference.path,
      segments: parsePath(reference.path),
    }))
    .sort((a, b) => comparePathsDescending(a.segments, b.segments))
  const dropped = new Set<string>()
  for (const { path, segments } of ordered) {
    if (startsWithDropped(segments, dropped)) {
      continue
    }
    const outcome = removeAt(root, segments, mode)
    if (outcome.kind === "removed") {
      result.removed.push(path)
    } else if (outcome.kind === "droppedElement") {
      dropped.add(pathKey(outcome.elementPath))
      result.droppedElements.push(path)
    } else if (outcome.kind === "blocked") {
      result.blocked.push(path)
    }
  }
  result.value = root as T
  return result
}

export const removeUnresolvedReferences = <T>(
  value: T,
  references: readonly Pick<UnresolvedReference, "path">[],
): T => removeUnresolvedReferencesDetailed(value, references, "clear").value
