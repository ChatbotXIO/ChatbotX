import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@aha.chat/ui/components/emoji-picker"
import "./emoji-list.css"

import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion"
import type { LucideIcon } from "lucide-react"
import type { RefObject } from "react"

type EmojiItem = { value: string; label: string; icon: LucideIcon }

export type EmojiListRef = {
  // For convenience using this SuggestionList from within the
  // mentionSuggestionOptions, we'll match the signature of SuggestionOptions's
  // `onKeyDown` returned in its `render` function
  onKeyDown: NonNullable<
    ReturnType<
      NonNullable<SuggestionOptions<EmojiItem, { id: string }>["render"]>
    >["onKeyDown"]
  >
}

export type EmojiListProps = SuggestionProps<EmojiItem, { id: string }> & {
  ref: RefObject<{
    onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean
  }>
}

export default (props: EmojiListProps) => {
  const selectItem = (val: string) => {
    props.command({ id: `${val}` })
  }

  return (
    <div className="cursor-pointer border border-secondary">
      <EmojiPicker
        className="h-[326px] rounded-lg border shadow-md"
        onEmojiSelect={({ emoji }) => {
          selectItem(emoji)
        }}
      >
        <EmojiPickerSearch />
        <EmojiPickerContent />
      </EmojiPicker>
    </div>
  )
}
