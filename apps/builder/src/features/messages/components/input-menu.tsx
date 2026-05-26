import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import EmojiPicker from "./emoji-picker"

type InputMenuProps = {
  setContent: (text: string, insert?: boolean) => void
}

// Toolbar do composer. Antes tinha botão de SelectFlowDialog (workflow) mas
// foi removido porque era redundante com o ShortcutMenu (raio ⚡) no header
// da conversa — Respond.io também só tem o atalho em um lugar (header).
// 2026-05-24 — Sprint Inbox 1.1.
export const InputMenu = ({ setContent }: InputMenuProps) => (
  <>
    <EmojiPicker onSelectEmoji={(emoji) => setContent(emoji, true)} />
    <SavedReplyManage onSelect={setContent} />
  </>
)
