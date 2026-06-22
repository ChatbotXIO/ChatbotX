import { Button } from "@chatbotx.io/ui/components/ui/button"
import { WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { SelectFlowDialog } from "@/features/flows/components/select-flow-dialog"
import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import { useChatStore } from "../../chat/store/chat-store-provider"
import EmojiPicker from "./emoji-picker"

type InputMenuProps = {
  setContent: (text: string, insert?: boolean) => void
}

export const InputMenu = ({ setContent }: InputMenuProps) => {
  const t = useTranslations()
  const activePost = useChatStore((state) => state.activePost)

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
      <EmojiPicker onSelectEmoji={(emoji) => setContent(emoji, true)} />
      <SavedReplyManage onSelect={setContent} />
    </>
  )
}
