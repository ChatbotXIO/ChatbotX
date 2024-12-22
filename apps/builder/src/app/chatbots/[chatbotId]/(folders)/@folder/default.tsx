import { FolderGroup } from "@prisma/client";
import { getFolders } from "@/features/folders/list/get-folders-queries";
import { ListFolder } from "@/features/folders/list/list-folder";
import { headers } from "next/headers";

export default async function FolderPage(
  props: { params: Promise<{ chatbotId: string }> }
) {
  const params = await props.params
  const headersList = await headers()
  const path = headersList.get("x-current-path") || ""
  let group = FolderGroup.Tag

  const segment = path.replace(`/chatbots/${params.chatbotId}`, "")

  if (segment.startsWith("/tags")) {
    group = FolderGroup.Tag
  }

  const promises = getFolders({
    chatbotId: params.chatbotId,
    group: group
  })

  return (
    <ListFolder promises={promises} chatbotId={params.chatbotId} group={group}/>
  )
}
