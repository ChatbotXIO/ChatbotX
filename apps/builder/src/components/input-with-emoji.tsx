import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@aha.chat/ui/components/ui/hover-card"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"
import { CodeIcon, SmileIcon } from "lucide-react"
import { useFormContext } from "react-hook-form"

export const InputWithEmoji = ({ name }: { name: string }) => {
  const { register } = useFormContext()
  return (
    <HoverCard closeDelay={0} openDelay={0}>
      <HoverCardTrigger asChild>
        <Textarea
          className="max-h-52 rounded-lg rounded-b-none"
          {...register(name)}
        />
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="-mt-3 flex w-auto gap-2 rounded-tl-none rounded-tr-none p-2"
        side="bottom"
      >
        <HoverCard closeDelay={0} openDelay={0}>
          <HoverCardTrigger asChild>
            <SmileIcon size={16} />
          </HoverCardTrigger>
          <HoverCardContent className="w-auto border-none bg-transparent p-0">
            <Picker
              data={data}
              emojiButtonSize={30}
              emojiSize={24}
              // onEmojiSelect={console.log}
            />
          </HoverCardContent>
        </HoverCard>

        <HoverCard closeDelay={0} openDelay={0}>
          <HoverCardTrigger asChild>
            <CodeIcon size={16} />
          </HoverCardTrigger>
          <HoverCardContent className="w-56">
            {/* {
                injectedVariables && injectedVariables.map((v) => (
                  <DropdownMenuItem onClick={() => onChooseVariable(v)}>{v}</DropdownMenuItem>
                ))
              } */}
          </HoverCardContent>
        </HoverCard>
      </HoverCardContent>
    </HoverCard>
  )
}
