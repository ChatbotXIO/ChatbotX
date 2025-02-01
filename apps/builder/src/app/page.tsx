import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { getAllChatbotsOfUser } from "@/features/chatbots/queries"
import Link from "next/link"

export default async function MainPage() {
  const session = await auth()
  const chatbots = await getAllChatbotsOfUser(session?.user.id || "")

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Chatbots List</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {chatbots?.map((chatbot) => (
                  <Button variant="secondary" key={chatbot.id} asChild>
                    <Link href={`/chatbots/${chatbot.id}/dashboard`}>
                      {chatbot.name}
                    </Link>
                  </Button>
                ))}
                {chatbots.length === 0 && (
                  <Label className="text-center">no chatbots found</Label>
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
              <CardTitle className="text-2xl">Create new Chatbot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div className="flex rounded w-full items-center">
                  <div className="flex-1">Whatsapp</div>
                  <Button variant="secondary">Continue</Button>
                </div>
                <div className="flex rounded w-full items-center">
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
