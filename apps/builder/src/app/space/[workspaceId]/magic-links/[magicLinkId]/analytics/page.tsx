import { magicLinkService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { MagicLinkAnalyticsClient } from "./magic-link-analytics-client"

const paramsSchema = z.object({
  workspaceId: zodBigintAsString(),
  magicLinkId: zodBigintAsString(),
})

type Props = {
  params: Promise<{ workspaceId: string; magicLinkId: string }>
}

export default async function MagicLinkAnalyticsPage({ params }: Props) {
  const { data } = await paramsSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const result = await getCurrentUserAndTargetWorkspace(data.workspaceId)
  if (!result) {
    return redirect("/")
  }

  const magicLink = await magicLinkService.findByWorkspace({
    workspaceId: data.workspaceId,
    id: data.magicLinkId,
  })
  if (!magicLink) {
    return notFound()
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 py-6">
      <MagicLinkAnalyticsClient
        linkId={data.magicLinkId}
        linkName={magicLink.name}
        workspaceId={data.workspaceId}
      />
    </div>
  )
}
