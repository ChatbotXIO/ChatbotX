import { prisma } from "@aha.chat/database"
import type { SearchParams } from "next/dist/server/request/search-params"
import { notFound } from "next/navigation"
import z from "zod"
import { GuestSessionStoreProvider } from "@/features/webchat/providers/store/guest-session-provider"
import { WebchatWrapper } from "@/features/webchat/webchat-wrapper"

type WebchatPageProps = {
  searchParams: Promise<SearchParams>
}

export default async function WebchatPage(props: WebchatPageProps) {
  const searchParams = await props.searchParams

  const { data } = z
    .object({
      chatbotId: z.cuid2(),
      webchatId: z.cuid2(),
    })
    .safeParse(searchParams)

  if (!data) {
    return notFound()
  }

  const integrationWebchat = await prisma.integrationWebchat.findFirst({
    where: {
      id: data.webchatId,
      chatbotId: data.chatbotId,
    },
  })
  if (!integrationWebchat) {
    return notFound()
  }

  return (
    <GuestSessionStoreProvider config={integrationWebchat}>
      <WebchatWrapper />
    </GuestSessionStoreProvider>
  )
}
