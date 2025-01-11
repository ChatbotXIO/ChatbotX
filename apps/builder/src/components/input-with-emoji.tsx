import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"
import { CodeIcon, SmileIcon } from "lucide-react"
import { useFormContext } from "react-hook-form"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card"
import { Textarea } from "./ui/textarea"

export const InputWithEmoji = ({ name }: { name: string }) => {
  const { register } = useFormContext()
  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger asChild>
        <Textarea
          className="max-h-52 rounded-lg rounded-b-none"
          {...register(name)}
        />
      </HoverCardTrigger>
      <HoverCardContent
        className="flex gap-2 p-2 w-auto -mt-3 rounded-tr-none rounded-tl-none"
        side="bottom"
        align="end"
      >
        <HoverCard openDelay={0} closeDelay={0}>
          <HoverCardTrigger asChild>
            <SmileIcon size={16} />
          </HoverCardTrigger>
          <HoverCardContent className="w-auto p-0 bg-transparent border-none">
            <Picker
              data={data}
              onEmojiSelect={console.log}
              emojiSize={24}
              emojiButtonSize={30}
            />
          </HoverCardContent>
        </HoverCard>

        <HoverCard openDelay={0} closeDelay={0}>
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
