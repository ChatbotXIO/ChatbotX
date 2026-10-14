"use client"

import { sendProductsStepDefaultFn } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { createId } from "@chatbotx.io/utils"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { ShoppingCartIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { disableBotAction } from "@/features/conversations/actions/disable-bot.action"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "@/features/conversations/utils/bot-state"
import { SendProductsDialog } from "@/features/flows/react-flow/steps/send-products/components/send-products-dialog"
import {
  type SendProductsFormValues,
  toStepFields,
} from "@/features/flows/react-flow/steps/send-products/lib/form"
import { createMessageAction } from "../actions/create-message.action"

type SendProductsDialogTriggerProps = {
  channel: ChannelType
  /** The inbox the composer was gated on, so the server checks the same one. */
  inboxId: string
  bypassThreadControlLock?: boolean
}

/**
 * The composer's "Send products" button and its dialog. The same dialog and
 * rules as the flow step's editor; the message is sent through the ordinary
 * inbox send, so the server validates it against the channel's rules again.
 */
export function SendProductsDialogTrigger({
  channel,
  inboxId,
  bypassThreadControlLock,
}: SendProductsDialogTriggerProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { activeConversationId, conversations, updateConversation } =
    useChatStore((state) => state)
  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )
  const emptyMessage = useMemo(() => sendProductsStepDefaultFn(), [])

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
      onSuccess: () => {
        if (conversation && isConversationActive(conversation)) {
          disableBot({ ids: [conversation.id] })
        }
      },
      onError: ({ error }) => {
        toast.error(t("flows.sendProducts.sendFailed"), {
          description: error.serverError,
        })
      },
    },
  )

  const handleSend = async (values: SendProductsFormValues) => {
    try {
      const result = await executeAsync({
        products: toStepFields(values),
        inboxId,
        clientId: createId(),
        bypassThreadControlLock,
      })
      // The dialog stays open on a refusal, so the message can be fixed and resent.
      return !(result?.serverError || result?.validationErrors)
    } catch {
      // A failed request (offline, cut off) already reached `onError` above, which
      // shows the toast; the dialog just has to stay open for a retry.
      return false
    }
  }

  return (
    <>
      <Button
        aria-label={t("flows.actions.sendProducts")}
        onClick={() => setOpen(true)}
        type="button"
        variant="ghost"
      >
        <ShoppingCartIcon size={20} />
      </Button>
      <SendProductsDialog
        channel={channel}
        isSubmitting={isExecuting}
        onOpenChange={setOpen}
        onSave={handleSend}
        open={open}
        step={emptyMessage}
        submitText={t("actions.send")}
      />
    </>
  )
}
