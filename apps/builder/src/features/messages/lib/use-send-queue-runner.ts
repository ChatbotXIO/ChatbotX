"use client"

import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { createMessageAction } from "../actions/create-message.action"
import type { CreateMessageWithRoutingBypassRequest } from "../schema/mutation"
import {
  expireInFlightSend,
  failSendSubmit,
  markSendSubmitted,
  nextSendToSubmit,
  nextSendWakeAt,
  type QueuedSend,
  type SendQueue,
} from "./send-queue"
import { flattenValidationErrors } from "./validation-errors"

/**
 * Runs the composer's send queues: submits the next message of each
 * conversation when its turn comes and expires one that never got an answer.
 * Mounted once by the composer, it serves every conversation's queue, so
 * switching conversations neither loses nor stalls queued messages.
 *
 * The answer itself arrives as a realtime event (`settleSendResult`); this only
 * hands messages to the server and wakes itself at the next gap or deadline.
 */
export const useSendQueueRunner = (props: {
  /** Called once the server has queued a message for delivery. */
  onSubmitted: (conversationId: string) => void
}): void => {
  const { onSubmitted } = props
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const sendQueues = useChatStore((state) => state.sendQueues)
  const updateSendQueue = useChatStore((state) => state.updateSendQueue)
  const markMessageFailed = useChatStore((state) => state.markMessageFailed)
  // Bumped by a timer to re-evaluate the queues when a gap or deadline passes.
  const [tick, setTick] = useState(0)

  // When the runner goes away (the person leaves the inbox, or closes the
  // pipeline item chat) the queues go with it. Messages already cleared from
  // the composer must not be lost, so the ones still waiting are sent now, in
  // order. A held queue is left alone: its owner never chose to go on.
  const latest = useRef({ sendQueues, workspaceId })
  latest.current = { sendQueues, workspaceId }
  useEffect(
    () => () => {
      flushWaitingSends(latest.current)
    },
    [],
  )

  const submit = useCallback(
    async (
      conversationId: string,
      item: QueuedSend<CreateMessageWithRoutingBypassRequest>,
    ): Promise<void> => {
      const fail = (message: string) => {
        updateSendQueue(conversationId, (queue) =>
          failSendSubmit(queue, item.clientId),
        )
        markMessageFailed(
          item.optimisticMessageId ?? "",
          item.clientId,
          message,
        )
        toast.error(message)
      }

      try {
        const result = await createMessageAction(
          workspaceId,
          conversationId,
          item.input,
        )
        if (result?.serverError) {
          fail(result.serverError)
          return
        }
        if (result?.validationErrors) {
          fail(
            flattenValidationErrors(result.validationErrors)[0]?.message ??
              t("messages.unknownError"),
          )
          return
        }
        onSubmitted(conversationId)
      } catch (error) {
        fail(
          error instanceof Error ? error.message : t("messages.unknownError"),
        )
      }
    },
    [markMessageFailed, onSubmitted, t, updateSendQueue, workspaceId],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-runs the evaluation when a timer fires
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const now = Date.now()
    for (const [conversationId, queue] of Object.entries(sendQueues)) {
      if (expireInFlightSend(queue, now) !== queue) {
        updateSendQueue(conversationId, (current) =>
          expireInFlightSend(current, Date.now()),
        )
        continue
      }
      const next = nextSendToSubmit(queue, now)
      if (next) {
        updateSendQueue(conversationId, (current) =>
          markSendSubmitted(current, next.clientId, Date.now()),
        )
        submit(conversationId, next)
        continue
      }
      const wakeAt = nextSendWakeAt(queue, now)
      if (wakeAt !== null) {
        timers.push(
          setTimeout(() => setTick((value) => value + 1), wakeAt - now),
        )
      }
    }
    return () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
    }
  }, [sendQueues, submit, tick, updateSendQueue])
}

/** Sends one conversation's waiting messages in order; failures only toast. */
const sendInOrder = async (
  workspaceId: string,
  conversationId: string,
  waiting: QueuedSend<CreateMessageWithRoutingBypassRequest>[],
): Promise<void> => {
  for (const item of waiting) {
    try {
      const result = await createMessageAction(
        workspaceId,
        conversationId,
        item.input,
      )
      if (result?.serverError) {
        toast.error(result.serverError)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }
}

/** Sends what is still waiting in unheld queues (one chain per conversation). */
const flushWaitingSends = (state: {
  sendQueues: Record<string, SendQueue<CreateMessageWithRoutingBypassRequest>>
  workspaceId: string
}): void => {
  for (const [conversationId, queue] of Object.entries(state.sendQueues)) {
    if (queue.holdReason === null && queue.waiting.length > 0) {
      sendInOrder(state.workspaceId, conversationId, queue.waiting)
    }
  }
}
