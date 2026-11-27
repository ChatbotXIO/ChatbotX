import { type QueryKey, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useCallback, useRef } from "react"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { moveItemAction } from "../actions/item.action"
import type { BoardColumn } from "../components/board/types"
import {
  type CardPlacement,
  moveItemInBoard,
  toPlacementRequest,
} from "./move-item-in-board"
import { useInvalidatePipelines } from "./use-invalidate-pipelines"

type MovableBoard = { stages: BoardColumn[] }

type BoardMoveOptions = {
  workspaceId: string
  pipelineId: string
  /** Query key of the board being dragged on. */
  boardKey: QueryKey
}

/**
 * Moves a card on the board optimistically. The new order is written to the
 * cache in the same tick as the call, then the action runs. On failure the
 * board goes back to its snapshot, but only while no newer move has started
 * (that one owns the board); a failure is always toasted. Every completion
 * invalidates the pipeline queries, so an overtaken move that settles last
 * still refetches the server's order.
 */
export function useBoardMove({
  workspaceId,
  pipelineId,
  boardKey,
}: BoardMoveOptions) {
  const t = useTranslations("pipelines")
  const queryClient = useQueryClient()
  const invalidatePipelines = useInvalidatePipelines()
  const moveFailedMessage = t("board.moveFailed")
  // Bumped by every move, to tell the latest one from an overtaken one.
  const moveGeneration = useRef(0)

  /** Sends one move; true when it failed (the failure is already toasted). */
  const sendMove = useCallback(
    async (input: Parameters<typeof moveItemAction>[1]): Promise<boolean> => {
      try {
        const result = await moveItemAction(workspaceId, input)
        const isFailed =
          result?.serverError !== undefined ||
          result?.validationErrors !== undefined
        if (isFailed) {
          toastActionError(moveFailedMessage)({
            error: { serverError: result?.serverError },
          })
        }
        return isFailed
      } catch {
        // The request never reached the server (offline, dropped connection).
        toastActionError(moveFailedMessage)({ error: {} })
        return true
      }
    },
    [workspaceId, moveFailedMessage],
  )

  // Only a server fetch moves `dataUpdatedAt`: local cache edits keep it.
  const boardFetchedAt = useCallback(
    () => queryClient.getQueryState(boardKey)?.dataUpdatedAt,
    [queryClient, boardKey],
  )

  return useCallback(
    async (
      itemId: string,
      toStageId: string,
      placement: CardPlacement | null = null,
    ) => {
      // Cancel an in-flight refetch (it would overwrite the optimistic state)
      // and apply the new order in this same tick, with no await in between:
      // dnd-kit resets the drag in the same render, so a later update would
      // show the card snapping back to its old slot first. The cancel reverts
      // the query state synchronously, so the optimistic write lands on top.
      queryClient.cancelQueries({ queryKey: boardKey })
      const generation = ++moveGeneration.current
      const snapshot = queryClient.getQueryData<MovableBoard>(boardKey)
      const snapshotFetchedAt = boardFetchedAt()
      queryClient.setQueryData<MovableBoard>(
        boardKey,
        (current) =>
          current
            ? moveItemInBoard(current, itemId, toStageId, placement)
            : current,
        { updatedAt: snapshotFetchedAt },
      )
      const isFailed = await sendMove({
        id: pipelineId,
        itemId,
        stageId: toStageId,
        ...toPlacementRequest(placement),
      })
      if (generation === moveGeneration.current && isFailed && snapshot) {
        queryClient.setQueryData<MovableBoard>(boardKey, snapshot, {
          updatedAt: snapshotFetchedAt,
        })
      }
      invalidatePipelines()
    },
    [
      queryClient,
      boardKey,
      boardFetchedAt,
      pipelineId,
      sendMove,
      invalidatePipelines,
    ],
  )
}
