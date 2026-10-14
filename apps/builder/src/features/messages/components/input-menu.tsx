import { getChannelFlowPolicy } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactElement } from "react"
import { SelectFlowDialog } from "@/features/flows/components/select-flow-dialog"
import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import { useChatStore } from "../../chat/store/chat-store-provider"
import EmojiPicker from "./emoji-picker"
import { SendProductsDialogTrigger } from "./send-products-trigger"

type InputMenuProps = {
  setContent: (text: string, insert?: boolean) => void
  /** The inbox the composer sends through; decides which tools it offers. */
  contactInbox?: { channel: string; inboxId: string }
  bypassThreadControlLock?: boolean
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
export const InputMenu = ({
  setContent,
  contactInbox,
  bypassThreadControlLock,
}: InputMenuProps) => {
  const activePost = useChatStore((state) => state.activePost)
  const channel = channelTypes.safeParse(contactInbox?.channel)
  // The channel's own policy says whether it has product messages, so a new
  // channel gets the button by declaring them, not by being named here.
  const canSendProducts =
    channel.success &&
    Boolean(getChannelFlowPolicy(channel.data)?.productMessages)

  return (
    <>
      {!activePost && (
        <SendFlowDialogTrigger>
          <Button type="button" variant="ghost">
            <WorkflowIcon size={20} />
          </Button>
        </SendFlowDialogTrigger>
      )}
      {!activePost && canSendProducts && channel.success && contactInbox && (
        <SendProductsDialogTrigger
          bypassThreadControlLock={bypassThreadControlLock}
          channel={channel.data}
          inboxId={contactInbox.inboxId}
        />
      )}
      <EmojiPicker onSelectEmoji={(emoji) => setContent(emoji, true)} />
      <SavedReplyManage onSelect={setContent} />
    </>
  )
}
