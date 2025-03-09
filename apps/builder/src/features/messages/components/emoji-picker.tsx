import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { SmileIcon } from "lucide-react"
import dynamic from "next/dynamic"

const BaseEmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <Skeleton className="bg-default-300 size-[300px] rounded-xl" />
  ),
})

const EmojiPicker = ({
  size = 300,
  onSelectEmoji,
}: {
  size?: number
  onSelectEmoji: (v: string) => void
}) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="[&_svg]:size-5 px-2 py-1.5"
        >
          <SmileIcon size={20} />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <BaseEmojiPicker
          autoFocusSearch
          lazyLoadEmojis
          onEmojiClick={(v) => onSelectEmoji(v.emoji)}
          emojiVersion="0.6"
          searchDisabled
          height={size + 50}
          width={size}
        />
      </PopoverContent>
    </Popover>
  )
}

export default EmojiPicker
