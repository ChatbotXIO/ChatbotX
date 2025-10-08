import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { getCurrentUserId } from "@/lib/auth"

export default async function MainPage() {
  const t = await getTranslations()
  const userId = await getCurrentUserId()

  const { chatbots } = await getAllChatbotMembers(userId)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                {t("chatbots.list.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {chatbots?.map((chatbot) => (
                  <Button asChild key={chatbot.id} variant="secondary">
                    <Link href={`/chatbots/${chatbot.id}/dashboard`}>
                      {chatbot.name}
                    </Link>
                  </Button>
                ))}
                {chatbots.length === 0 && (
                  <div className="text-center">
                    {t("messages.noChatbotsFound")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                {t("actions.createNewChatbot")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div className="flex w-full items-center rounded">
                  <div className="flex-1">Whatsapp</div>
                  <Button variant="secondary">Continue</Button>
                </div>
                <div className="flex w-full items-center rounded">
                  <div className="flex-1">Chat Widget</div>
                  <Button variant="secondary">Continue</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
