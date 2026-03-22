import { db } from "@aha.chat/database/client"
import type { SearchParams } from "next/dist/server/request/search-params"
import { notFound } from "next/navigation"
import z from "zod"
import { GuestSessionStoreProvider } from "@/features/webchat/providers/store/guest-session-provider"
import { WebchatWrapper } from "@/features/webchat/webchat-wrapper"

type WebchatPageProps = {
  searchParams: Promise<SearchParams>
}

export const dynamic = "force-dynamic"

export default async function WebchatPage(props: WebchatPageProps) {
  const searchParams = await props.searchParams

  const { data } = z
    .object({
      chatbotId: z.cuid2(),
      webchatId: z.cuid2(),
      ref: z.string().optional(),
    })
    .safeParse(searchParams)

  if (!data) {
    return notFound()
  }

  const targetWebchat = await db.query.integrationWebchatModel.findFirst({
    where: {
      id: data.webchatId,
      chatbotId: data.chatbotId,
    },
  })

  if (!targetWebchat) {
    return notFound()
  }

  return (
    <GuestSessionStoreProvider config={targetWebchat}>
      <WebchatWrapper referral={data.ref} />
    </GuestSessionStoreProvider>
  )
}
