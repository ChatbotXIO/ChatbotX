import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { DiscountCodeFormPage } from "../form-page"

export default async function NewDiscountCodePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  await assertCurrentUserCanAccessChatbot(workspaceId)
  return <DiscountCodeFormPage workspaceId={workspaceId} />
}
