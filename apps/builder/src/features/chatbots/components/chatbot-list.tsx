import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { cn } from "@aha.chat/ui/lib/utils"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { isCommunity } from "@/env"
import type { ChatbotResource } from "../schemas/resource"

type ChatbotListProps = {
  chatbots: ChatbotResource[]
}

const CARD_STYLES = "h-[250px] w-[200px] py-0 rounded-md overflow-hidden"
const LINK_STYLES =
  "flex h-[250px] w-full flex-col flex-wrap items-center justify-center gap-6"

const CreateChatbotCard = () => {
  const t = useTranslations()

  return (
    <Card className={CARD_STYLES}>
      <CardContent className="px-0">
        <Link
          className={cn(LINK_STYLES, "bg-primary text-primary-foreground")}
          href="/channels/create"
        >
          <div className="flex size-20 items-center justify-center">
            <PlusCircleIcon className="size-8" />
          </div>
          <div className="truncate text-center font-medium">
            {t("actions.createFeature", {
              feature: t("fields.chatbot.label"),
            })}
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

type ChatbotCardProps = {
  chatbot: ChatbotResource
}

const ChatbotCard = ({ chatbot }: ChatbotCardProps) => {
  const firstLetter = chatbot.name?.[0] ?? ""

  return (
    <Card className={CARD_STYLES}>
      <CardContent className="px-0">
        <Link
          className={LINK_STYLES}
          href={`/chatbots/${chatbot.id}/dashboard`}
        >
          <Avatar className="size-20">
            <AvatarImage alt={chatbot.name} src={chatbot.logo ?? ""} />
            <AvatarFallback className="rounded text-2xl">
              {firstLetter}
            </AvatarFallback>
          </Avatar>
          <div className="truncate text-center font-medium">{chatbot.name}</div>
        </Link>
      </CardContent>
    </Card>
  )
}

const ChatbotList = ({ chatbots }: ChatbotListProps) => (
  <div className="flex h-screen w-screen justify-start px-20">
    <div className="mt-20 flex flex-wrap gap-6">
      {isCommunity && chatbots.length === 0 && <CreateChatbotCard />}

      {chatbots?.map((chatbot) => (
        <ChatbotCard chatbot={chatbot} key={chatbot.id} />
      ))}
    </div>
  </div>
)

export default ChatbotList
