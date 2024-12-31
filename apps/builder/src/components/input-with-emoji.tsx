import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { CodeIcon, Smile, SmileIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";
import { Textarea } from "./ui/textarea";

export default function InputWithEmoji({ injectedVariables }: { injectedVariables?: string[] }) {
  const onChooseVariable = (v: string) => {
    console.log(v)
  }

  return (
    <>
      <HoverCard openDelay={0}>
        <HoverCardTrigger asChild>
          <Textarea className="max-h-52" />
        </HoverCardTrigger>
        <HoverCardContent>
          <HoverCard openDelay={0}>
            <HoverCardTrigger asChild>
              <SmileIcon />
            </HoverCardTrigger>
            <HoverCardContent>
              <Picker data={data} onEmojiSelect={console.log} />
            </HoverCardContent>
          </HoverCard>

          <HoverCard openDelay={0}>
            <HoverCardTrigger asChild>
              <CodeIcon />
            </HoverCardTrigger>
            <HoverCardContent className="w-56">
              {
                injectedVariables && injectedVariables.map((v) => (
                  <DropdownMenuItem onClick={() => onChooseVariable(v)}>{v}</DropdownMenuItem>
                ))
              }
            </HoverCardContent>
          </HoverCard>
        </HoverCardContent>
      </HoverCard>
    </>
  )
}
