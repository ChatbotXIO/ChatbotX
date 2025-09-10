import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import { redirect } from "next/navigation"
import { getListPagesAction } from "@/features/integration-messenger/actions/list-pages.action"
import { saveAuthValueToCache } from "@/features/integration-messenger/queries/save-auth-value"
import { SelectPageCard } from "@/features/integration-messenger/select-page"

export default async function MessengerMessageTemplatePage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const authValue = (await saveAuthValueToCache(
    chatbotId,
  )) as MessengerAuthValue

  if (!authValue) {
    return redirect(`/chatbots/${chatbotId}/settings/channels`)
  }

  try {
    const pagesResult = await getListPagesAction(
      authValue.metadata.version,
      authValue.tokens.accessToken,
    )

    if (!pagesResult.data?.success) {
      return redirect(`/chatbots/${chatbotId}/settings/channels`)
    }

    const pages = pagesResult.data.data

    return <SelectPageCard chatbotId={chatbotId} pages={pages} />
  } catch (_error) {
    return redirect(`/chatbots/${chatbotId}/settings/channels`)
  }
}
