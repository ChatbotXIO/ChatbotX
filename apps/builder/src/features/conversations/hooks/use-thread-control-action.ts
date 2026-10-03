"use client"

import type { ThreadControlAction } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import {
  THREAD_CONTROL_PASS_COPY_KEYS,
  type ThreadControlPassTarget,
} from "@/features/messages/lib/thread-control-channel-ui"
import { threadControlAction } from "../actions/thread-control.action"
import { THREAD_CONTROL_NOT_ESCALATION } from "../lib/thread-control-result"

const SUCCESS_TOAST_KEYS = {
  take: "conversationRouting.composer.takeOverSuccess",
  release: "conversationRouting.release.success",
} as const satisfies Record<Exclude<ThreadControlAction, "pass">, string>

/**
 * Runs take/release/pass for one conversation. On success the store is
 * patched from the returned snapshot right away (realtime only confirms it),
 * so the composer unlocks without waiting for the socket. The routing state
 * lives in the chat store, not in a TanStack query, so there is no query
 * cache to invalidate here.
 */
export function useThreadControlAction(input: {
  workspaceId: string
  conversationId: string
  /** Who a pass hands the thread to; picks the pass success toast. */
  passTarget?: ThreadControlPassTarget
}) {
  const t = useTranslations()
  const patchContactInboxThreadControl = useChatStore(
    (state) => state.patchContactInboxThreadControl,
  )
  const [isNotEscalation, setIsNotEscalation] = useState(false)

  const {
    execute,
    executeAsync,
    isExecuting,
    input: lastInput,
  } = useAction(
    threadControlAction.bind(null, input.workspaceId, input.conversationId),
    {
      onExecute: () => setIsNotEscalation(false),
      onSuccess: ({ data, input: actionInput }) => {
        if (!data) {
          return
        }
        if (data.status === THREAD_CONTROL_NOT_ESCALATION) {
          setIsNotEscalation(true)
          return
        }
        patchContactInboxThreadControl(input.conversationId, data.snapshot)
        toast.success(
          t(
            actionInput.action === "pass"
              ? THREAD_CONTROL_PASS_COPY_KEYS[input.passTarget ?? "escalation"]
                  .success
              : SUCCESS_TOAST_KEYS[actionInput.action],
          ),
        )
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  return {
    execute,
    // Awaitable: the composer takes the thread over, then sends only if the
    // take succeeded (see message-input's inline AI hand-over reply).
    executeAsync,
    isExecuting,
    pendingAction: isExecuting ? lastInput?.action : undefined,
    isNotEscalation,
  }
}
