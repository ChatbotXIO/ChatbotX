import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { EmojiPicker, EmojiPickerContent, EmojiPickerFooter, EmojiPickerSearch } from "./ui/emoji-picker";
import { SmileIcon } from "lucide-react";
import { cn } from "../lib/utils";

type EmojiPickerPopupProps = {
  onEmojiSelect: (emoji: string) => void;
  className?: string;
}

export function EmojiPickerPopup({ onEmojiSelect, className }: EmojiPickerPopupProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className={className}>
            <SmileIcon className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-fit p-0">
          <EmojiPicker
            className="h-[342px]"
            onEmojiSelect={({ emoji }) => {
              setIsOpen(false);
              onEmojiSelect(emoji);
            }}
          >
            <EmojiPickerSearch />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </PopoverContent>
      </Popover>

  )
}