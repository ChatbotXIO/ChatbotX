import {
  type DatabaseClient,
  isDeadlockError,
  isStatementTimeoutError,
} from "@chatbotx.io/database/client"
import type { PipelineItemPlacementEdge } from "@chatbotx.io/database/partials"
import {
  type NeighbourDirection,
  type PipelineStageScope,
  type PlacementAnchor,
  pipelineItemRepository,
  RESPACE_EXISTING_MAX,
} from "@chatbotx.io/database/repositories"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import { isBigintId } from "@chatbotx.io/database/utils"
import {
  positionBetween,
  spreadPositions,
} from "@chatbotx.io/utils/sparse-position"
import { conflictException, validationException } from "../errors"
import { logger } from "../logger"

/** What a caller may send; at most one field. */
export type PipelineItemPlacementInput = {
  beforeItemId?: string
  afterItemId?: string
  placement?: PipelineItemPlacementEdge
}

/** The one placement a request resolved to. */
export type ItemPlacement =
  | { kind: "edge"; edge: PipelineItemPlacementEdge }
  | { kind: "before"; anchorItemId: string }
  | { kind: "after"; anchorItemId: string }

export const TOP_PLACEMENT: ItemPlacement = { kind: "edge", edge: "top" }

const TOO_MANY_PLACEMENTS =
  "Use only one of beforeItemId, afterItemId, placement"

/** Statement cap for a placement that may respace; also bounds lock waits. */
const RESPACE_STATEMENT_TIMEOUT = "10s"
/** First respace window (existing rows), grown until it fits. */
const RESPACE_FIRST_WINDOW = 15

/** The placement a request asks for, or null when it names none. */
export function parsePlacement(
  input: PipelineItemPlacementInput,
): ItemPlacement | null {
  const given = [input.beforeItemId, input.afterItemId, input.placement].filter(
    (value) => value !== undefined,
  )
  if (given.length > 1) {
    throw validationException("placement", TOO_MANY_PLACEMENTS)
  }
  if (input.beforeItemId !== undefined) {
    return { kind: "before", anchorItemId: input.beforeItemId }
  }
  if (input.afterItemId !== undefined) {
    return { kind: "after", anchorItemId: input.afterItemId }
  }
  return input.placement ? { kind: "edge", edge: input.placement } : null
}

/** The two rows a placement lands between, excluding the moved item; null is an open end. */
type PlacementSlot = {
  lower: PlacementAnchor | null
  upper: PlacementAnchor | null
}

type SlotContext = {
  tx: DatabaseClient
  scope: PipelineStageScope
  movedItemId?: string
}

const ANCHOR_FIELD = {
  before: "beforeItemId",
  after: "afterItemId",
} as const satisfies Record<NeighbourDirection, string>

function notInStageMessage(
  field: string,
  anchorItemId: string,
  context: SlotContext,
): string {
  return `${field} ${anchorItemId} is not in stage ${context.scope.stageId} of this pipeline. Pass an item id from pipelines.listItems with stageId=${context.scope.stageId}`
}

async function findAnchor(
  context: SlotContext,
  kind: NeighbourDirection,
  anchorItemId: string,
): Promise<PlacementAnchor> {
  const field = ANCHOR_FIELD[kind]
  if (!isBigintId(anchorItemId)) {
    throw validationException(
      field,
      notInStageMessage(field, anchorItemId, context),
    )
  }
  // Numeric, not string, equality: "042" is item 42 to Postgres.
  if (
    context.movedItemId !== undefined &&
    BigInt(anchorItemId) === BigInt(context.movedItemId)
  ) {
    throw validationException(
      field,
      `${field} cannot be the item being moved. Pass another item of stage ${context.scope.stageId}, or use placement "top" or "bottom"`,
    )
  }
  const anchor = await pipelineItemRepository.findPlacementAnchor(
    { ...context.scope, itemId: anchorItemId },
    context.tx,
  )
  if (!anchor) {
    throw validationException(
      field,
      notInStageMessage(field, anchorItemId, context),
    )
  }
  return anchor
}

const neighbourOf = (
  context: SlotContext,
  anchor: PlacementAnchor,
  direction: NeighbourDirection,
) =>
  pipelineItemRepository.neighbour(
    {
      ...context.scope,
      anchor,
      direction,
      excludeItemId: context.movedItemId,
    },
    context.tx,
  )

async function resolveSlot(
  context: SlotContext,
  placement: ItemPlacement,
): Promise<PlacementSlot> {
  switch (placement.kind) {
    case "edge": {
      const edge = await pipelineItemRepository.stageEdgeAnchor(
        {
          ...context.scope,
          edge: placement.edge,
          excludeItemId: context.movedItemId,
        },
        context.tx,
      )
      return placement.edge === "top"
        ? { lower: null, upper: edge }
        : { lower: edge, upper: null }
    }
    case "before": {
      const upper = await findAnchor(context, "before", placement.anchorItemId)
      return { lower: await neighbourOf(context, upper, "before"), upper }
    }
    case "after": {
      const lower = await findAnchor(context, "after", placement.anchorItemId)
      return { lower, upper: await neighbourOf(context, lower, "after") }
    }
    default:
      return placement satisfies never
  }
}

/** `(position, id)` order, the order the board and the index use. */
const isBefore = (left: PlacementAnchor, right: PlacementAnchor): boolean =>
  left.position < right.position ||
  (left.position === right.position && BigInt(left.id) < BigInt(right.id))

/** Whether the item already sits in the slot: dropping it there changes nothing. */
export function isAlreadyInSlot(
  slot: PlacementSlot,
  item: PlacementAnchor,
): boolean {
  return (
    (slot.lower === null || isBefore(slot.lower, item)) &&
    (slot.upper === null || isBefore(item, slot.upper))
  )
}

/**
 * Locks nothing itself: the caller holds the stage-order lock of
 * `scope.stageId`. Returns the position to write for the moved item, spreading
 * the neighbours first when no value fits between them.
 */
export async function positionForPlacement(
  tx: DatabaseClient,
  scope: PipelineStageScope,
  placement: ItemPlacement,
  movedItemId?: string,
): Promise<number> {
  const slot = await resolveSlot({ tx, scope, movedItemId }, placement)
  return await positionInSlot(tx, scope, slot, placement, movedItemId)
}

/** The slot a placement resolves to, for the "dropped where it already was" check. */
export const slotForPlacement = (
  tx: DatabaseClient,
  scope: PipelineStageScope,
  placement: ItemPlacement,
  movedItemId: string,
): Promise<PlacementSlot> => resolveSlot({ tx, scope, movedItemId }, placement)

/** The column default's scale: negative application-clock milliseconds. */
const wallClockPosition = (): number => -Date.now()

/**
 * A top placement (create, stage change, transfer, or `placement: "top"`) uses
 * the clock scale when it sorts strictly
 * before the current top, so it agrees with writers that still use the column
 * default. Anything else (before/after an anchor, bottom, a top that already
 * ran ahead of the clock) keeps the sparse arithmetic below.
 */
const topClockPosition = (
  slot: PlacementSlot,
  placement: ItemPlacement,
): number | null => {
  if (
    placement.kind !== "edge" ||
    placement.edge !== "top" ||
    slot.lower !== null ||
    slot.upper === null
  ) {
    return null
  }
  const candidate = wallClockPosition()
  return candidate < slot.upper.position ? candidate : null
}

export async function positionInSlot(
  tx: DatabaseClient,
  scope: PipelineStageScope,
  slot: PlacementSlot,
  placement: ItemPlacement,
  movedItemId?: string,
): Promise<number> {
  if (slot.lower === null && slot.upper === null) {
    // An empty stage: the same "newest on top" scale the column default uses.
    return wallClockPosition()
  }
  const onClock = topClockPosition(slot, placement)
  if (onClock !== null) {
    return onClock
  }
  const between = positionBetween(
    slot.lower?.position ?? null,
    slot.upper?.position ?? null,
  )
  if (between !== null) {
    return between
  }
  return await respace(tx, scope, slot, movedItemId)
}

type WindowSizes = { belowLimit: number; aboveLimit: number }

/** Existing rows to read per side: all on the one side an open end leaves. */
function windowSizes(slot: PlacementSlot, existing: number): WindowSizes {
  if (slot.lower === null) {
    return { belowLimit: 0, aboveLimit: existing }
  }
  if (slot.upper === null) {
    return { belowLimit: existing, aboveLimit: 0 }
  }
  const belowLimit = Math.ceil(existing / 2)
  return { belowLimit, aboveLimit: existing - belowLimit }
}

/**
 * Spreads a bounded window of rows around the slot (plus the moved item) over
 * the gap between the rows just outside it. Grows 15 -> 31 -> ... -> 511 rows
 * until the values fit; past that the spot is pathological (a 409).
 * Writes the neighbours and returns the moved item's position.
 */
async function respace(
  tx: DatabaseClient,
  scope: PipelineStageScope,
  slot: PlacementSlot,
  movedItemId?: string,
): Promise<number> {
  await setLocalStatementTimeout(tx, RESPACE_STATEMENT_TIMEOUT)
  try {
    return await respaceWindows(tx, scope, slot, movedItemId)
  } catch (error) {
    const timedOut = isStatementTimeoutError(error)
    if (!(timedOut || isDeadlockError(error))) {
      throw error
    }
    // The cap also bounds the row-lock waits: a busy neighbour is a retry. A
    // deadlock victim (e.g. against a contact delete's FK cascade) is one too:
    // the throw rolls the whole transaction back and the caller retries.
    const err = respaceConflict()
    logger.warn(
      { err: error, ...scope },
      timedOut
        ? "Pipeline stage respace timed out"
        : "Pipeline stage respace lost a deadlock",
    )
    throw err
  }
}

async function respaceWindows(
  tx: DatabaseClient,
  scope: PipelineStageScope,
  slot: PlacementSlot,
  movedItemId?: string,
): Promise<number> {
  let existing = RESPACE_FIRST_WINDOW
  for (;;) {
    const window = await pipelineItemRepository.listRespaceWindow(
      {
        ...scope,
        lower: slot.lower,
        upper: slot.upper,
        ...windowSizes(slot, existing),
        excludeItemId: movedItemId,
      },
      tx,
    )
    const values = spreadPositions(
      window.lowerBound,
      window.upperBound,
      window.below.length + 1 + window.above.length,
    )
    if (values) {
      const movedIndex = window.below.length
      const neighbours: PlacementAnchor[] = [
        ...window.below,
        ...window.above,
      ].map((row, index) => ({
        id: row.id,
        position: values[index < movedIndex ? index : index + 1] as number,
      }))
      await pipelineItemRepository.setPositions(
        { ...scope, rows: neighbours },
        tx,
      )
      return values[movedIndex] as number
    }
    // The cap is reached: no more room.
    if (existing >= RESPACE_EXISTING_MAX) {
      throw respaceLimitReached(scope)
    }
    existing = Math.min(existing * 2 + 1, RESPACE_EXISTING_MAX)
  }
}

const RESPACE_CONFLICT_MESSAGE = "Too many items share this spot. Try again."

const respaceConflict = () =>
  conflictException(RESPACE_CONFLICT_MESSAGE, "conflict")

function respaceLimitReached(scope: PipelineStageScope) {
  const err = respaceConflict()
  logger.warn({ err, ...scope }, "Pipeline stage respace found no room")
  return err
}
