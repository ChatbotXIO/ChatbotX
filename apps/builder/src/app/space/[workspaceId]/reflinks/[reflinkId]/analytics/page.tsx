import { reflinkService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { ReflinkAnalyticsClient } from "./reflink-analytics-client"

const paramsSchema = z.object({
  workspaceId: zodBigintAsString(),
  reflinkId: zodBigintAsString(),
})

type Props = {
  params: Promise<{ workspaceId: string; reflinkId: string }>
}

export default async function ReflinkAnalyticsPage({ params }: Props) {
  const { data } = await paramsSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const result = await getCurrentUserAndTargetWorkspace(data.workspaceId)
  if (!result) {
    return redirect("/")
  }

  const reflink = await reflinkService.findRefLink({
    workspaceId: data.workspaceId,
    id: data.reflinkId,
  })
  if (!reflink) {
    return notFound()
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 py-6">
      <ReflinkAnalyticsClient
        linkId={data.reflinkId}
        linkName={reflink.name}
        workspaceId={data.workspaceId}
      />
    </div>
  )
}
