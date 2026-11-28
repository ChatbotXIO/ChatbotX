"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { createId } from "@chatbotx.io/utils"
import { Loader2Icon, NewspaperIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  refusalReasonKey,
  SharePostPicker,
} from "@/features/channel-posts/components/share-post-picker"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { disableBotAction } from "@/features/conversations/actions/disable-bot.action"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "@/features/conversations/utils/bot-state"
import { createMessageAction } from "../actions/create-message.action"
import { getChannelPostRefusal } from "../lib/channel-post-refusal"

type SendChannelPostDialogTriggerProps = {
  /** The inbox the composer was gated on, so the server checks the same one. */
  inboxId: string
  bypassThreadControlLock?: boolean
}

/**
 * The composer's "Send a post" button and its picker. The post is sent through
 * the ordinary inbox send (`channelPost`), so the server checks it again with
 * the same rule that disables the posts the channel cannot send here.
 */
export function SendChannelPostDialogTrigger({
  inboxId,
  bypassThreadControlLock,
}: SendChannelPostDialogTriggerProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const { activeConversationId, conversations, updateConversation } =
    useChatStore((state) => state)
  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const { execute: disableBot } = useAction(
    disableBotAction.bind(null, conversation?.workspaceId ?? ""),
    {
      onSuccess: () => {
        if (conversation) {
          updateConversation(conversation.id, {
            botEnabled: false,
            botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
          })
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { executeAsync, isExecuting } = useAction(
    createMessageAction.bind(
      null,
      conversation?.workspaceId ?? "",
      conversation?.id ?? "",
    ),
    {
      onSuccess: ({ data }) => {
        const refusal = getChannelPostRefusal(data)
        if (refusal) {
          toast.error(t("flows.sendChannelPost.sendFailed"), {
            description: t(refusalReasonKey[refusal.reason]),
          })
          return
        }
        if (conversation && isConversationActive(conversation)) {
          disableBot({ ids: [conversation.id] })
        }
      },
      onError: ({ error }) => {
        toast.error(t("flows.sendChannelPost.sendFailed"), {
          description: error.serverError,
        })
      },
    },
  )

  const handleSend = async () => {
    if (!selectedPostId) {
      return
    }
    try {
      const result = await executeAsync({
        channelPost: { channelPostId: selectedPostId },
        inboxId,
        clientId: createId(),
        bypassThreadControlLock,
      })
      // The dialog stays open on a refusal, so another post can be picked.
      if (
        !(
          result?.serverError ||
          result?.validationErrors ||
          getChannelPostRefusal(result?.data)
        )
      ) {
        setOpen(false)
        setSelectedPostId(null)
      }
    } catch {
      // A failed request already reached `onError`, which shows the toast; the
      // dialog stays open for a retry.
    }
  }

  return (
    <>
      <Button
        aria-label={t("flows.actions.sendChannelPost")}
        onClick={() => setOpen(true)}
        type="button"
        variant="ghost"
      >
        <NewspaperIcon size={20} />
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("flows.sendChannelPost.title")}</DialogTitle>
            <DialogDescription>
              {t("flows.sendChannelPost.description")}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <SharePostPicker
              inboxId={inboxId}
              onSelect={(post) => setSelectedPostId(post.id)}
              selectedId={selectedPostId}
            />
          )}
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={!selectedPostId || isExecuting}
              onClick={handleSend}
              type="button"
            >
              {isExecuting && (
                <Loader2Icon aria-hidden className="size-4 animate-spin" />
              )}
              {t("actions.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
