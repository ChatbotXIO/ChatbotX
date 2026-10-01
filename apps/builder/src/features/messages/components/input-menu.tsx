import { Button } from "@chatbotx.io/ui/components/ui/button"
import { WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactElement } from "react"
import { SelectFlowDialog } from "@/features/flows/components/select-flow-dialog"
import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import { useChatStore } from "../../chat/store/chat-store-provider"
import EmojiPicker from "./emoji-picker"

type InputMenuProps = {
  setContent: (text: string, insert?: boolean) => void
}

/**
 * The composer's "Send flow" dialog around any trigger. Shared by the message
 * toolbar and the conversation-routing locked composer, so an agent whose
 * replies are paused can still send a flow (e.g. one holding a template).
 */
export const SendFlowDialogTrigger = ({
  children,
  templateStartType,
}: {
  children: ReactElement
  /** Adds a "Template" tab of template-first flows (see `SelectFlowDialog`). */
  templateStartType?: string
}) => {
  const t = useTranslations()
  return (
    <SelectFlowDialog
      submitText={t("actions.send")}
      templateStartType={templateStartType}
      title={t("actions.sendFlow")}
    >
      {children}
    </SelectFlowDialog>
  )
}

/**
 * Deliberately carries no call control. Requesting call permission is a step of
 * the call flow, so it belongs to the gated controls (`WhatsappVoipCallButton`
 * in the conversation head, `ContactPanelCallEntry` in the contact panel) that
 * resolve outbound call mode first. A copy here would render for every WhatsApp
 * conversation with none of those gates applied.
 */
export const InputMenu = ({ setContent }: InputMenuProps) => {
  const activePost = useChatStore((state) => state.activePost)

  return (
    <>
      {!activePost && (
        <SendFlowDialogTrigger>
          <Button type="button" variant="ghost">
            <WorkflowIcon size={20} />
          </Button>
        </SendFlowDialogTrigger>
      )}
      <EmojiPicker onSelectEmoji={(emoji) => setContent(emoji, true)} />
      <SavedReplyManage onSelect={setContent} />
    </>
  )
}
