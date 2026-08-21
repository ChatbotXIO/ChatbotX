import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { PhoneOutgoingIcon, WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { SelectFlowDialog } from "@/features/flows/components/select-flow-dialog"
import { RequestCallPermissionDialog } from "@/features/integration-whatsapp/calling/request-call-permission-dialog"
import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import { useChatStore } from "../../chat/store/chat-store-provider"
import EmojiPicker from "./emoji-picker"

type InputMenuProps = {
  setContent: (text: string, insert?: boolean) => void
}

export const InputMenu = ({ setContent }: InputMenuProps) => {
  const t = useTranslations()
  const activePost = useChatStore((state) => state.activePost)
  const conversations = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  )
  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )
  const isWhatsappConversation =
    conversation?.contactInboxes[0]?.channel === "whatsapp"

  return (
    <>
      {!activePost && (
        <SelectFlowDialog
          submitText={t("actions.send")}
          title={t("actions.sendFlow")}
        >
          <Button type="button" variant="ghost">
            <WorkflowIcon size={20} />
          </Button>
        </SelectFlowDialog>
      )}
      {!activePost && isWhatsappConversation && conversation && (
        <RequestCallPermissionDialog
          conversationId={conversation.id}
          inboxId={conversation.contactInboxes[0]?.inboxId}
          workspaceId={conversation.workspaceId}
        >
          <Button type="button" variant="ghost">
            <Tooltip>
              <TooltipTrigger
                render={<PhoneOutgoingIcon aria-hidden size={20} />}
              />
              <TooltipContent>
                {t("whatsapp.calls.permissionRequestTitle")}
              </TooltipContent>
            </Tooltip>
          </Button>
        </RequestCallPermissionDialog>
      )}
      <EmojiPicker onSelectEmoji={(emoji) => setContent(emoji, true)} />
      <SavedReplyManage onSelect={setContent} />
    </>
  )
}
