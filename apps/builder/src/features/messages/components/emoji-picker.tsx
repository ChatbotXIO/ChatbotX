import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { SmileIcon } from "lucide-react"
import dynamic from "next/dynamic"
import "./emoji.picker.css"

const BaseEmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => <Skeleton className="size-75 rounded-xl bg-default-300" />,
})

const EmojiPicker = (props: {
  label?: string
  size?: number
  disabled?: boolean
  onSelectEmoji: (v: string) => void
}) => {
  const { label, size = 300, disabled = false, onSelectEmoji } = props

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="px-2 py-1.5 [&_svg]:size-5"
          disabled={disabled}
          size="sm"
          variant="ghost"
        >
          <div className="flex w-5.5 justify-center">
            <SmileIcon />
          </div>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto border-0 p-0">
        <BaseEmojiPicker
          autoFocusSearch
          emojiVersion="0.6"
          height={size + 50}
          lazyLoadEmojis
          onEmojiClick={(v) => onSelectEmoji(v.emoji)}
          searchDisabled
          width={size}
        />
      </PopoverContent>
    </Popover>
  )
}

export default EmojiPicker
