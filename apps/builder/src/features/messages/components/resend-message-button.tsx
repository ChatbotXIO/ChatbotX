"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon, RotateCcwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { resendMessageAction } from "../actions/resend-message.action"
import {
  failResendSubmit,
  isHeldBy,
  markResendSubmitted,
} from "../lib/send-queue"
import type { MessageResource } from "../schema/resource"

type ResendMessageButtonProps = {
  message: Pick<
    MessageResource,
    | "id"
    | "createdAt"
    | "conversationId"
    | "workspaceId"
    | "sendError"
    | "clientId"
  >
}

/**
 * Sends a failed message again. Only offered where the service would accept it
 * (`isResendableMessage`). The error badge clears and the composer queue starts
 * tracking the resent message *before* the request goes out: the worker can
 * answer faster than the response returns, and that answer must find the
 * message already in flight. A refused request puts the failure back.
 */
export function ResendMessageButton({ message }: ResendMessageButtonProps) {
  const t = useTranslations()
  const markMessageFailed = useChatStore((state) => state.markMessageFailed)
  const updateSendQueue = useChatStore((state) => state.updateSendQueue)
  const updateAllSendQueues = useChatStore((state) => state.updateAllSendQueues)
  const [isPending, setIsPending] = useState(false)

  const resend = async () => {
    setIsPending(true)
    markMessageFailed(message.id, undefined, null)
    const ref = { messageId: message.id, clientId: message.clientId }
    const now = Date.now()
    // The queue held for this message may belong to another conversation (a
    // private reply); the message's own queue tracks it either way.
    updateAllSendQueues((queue) =>
      isHeldBy(queue, ref) ? markResendSubmitted(queue, ref, now) : queue,
    )
    updateSendQueue(message.conversationId, (queue) =>
      markResendSubmitted(queue, ref, now),
    )
    const restore = (error: string) => {
      markMessageFailed(message.id, undefined, message.sendError)
      updateAllSendQueues((queue) => failResendSubmit(queue, message.id))
      toast.error(error)
    }
    try {
      const result = await resendMessageAction(
        message.workspaceId,
        message.conversationId,
        { id: message.id, createdAt: message.createdAt },
      )
      if (result?.serverError) {
        restore(result.serverError)
      }
    } catch (error) {
      restore(
        error instanceof Error ? error.message : t("messages.unknownError"),
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      className="self-center"
      disabled={isPending}
      onClick={resend}
      size="sm"
      type="button"
      variant="ghost"
    >
      {isPending ? (
        <Loader2Icon aria-hidden className="size-3.5 animate-spin" />
      ) : (
        <RotateCcwIcon aria-hidden className="size-3.5" />
      )}
      {t("actions.resend")}
    </Button>
  )
}
