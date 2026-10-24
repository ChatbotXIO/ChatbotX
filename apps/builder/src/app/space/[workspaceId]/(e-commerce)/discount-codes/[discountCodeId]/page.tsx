import { discountCodeService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { notFound } from "next/navigation"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { DiscountCodeFormPage } from "../form-page"

const ID_PATTERN = /^\d{1,20}$/

/** A code of another workspace, or one deleted meanwhile, is a 404. */
async function findDiscountCode(workspaceId: string, discountCodeId: string) {
  try {
    return await discountCodeService.get({ workspaceId, discountCodeId })
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      notFound()
    }
    throw error
  }
}

export default async function EditDiscountCodePage({
  params,
}: {
  params: Promise<{ workspaceId: string; discountCodeId: string }>
}) {
  const { workspaceId, discountCodeId } = await params
  if (!ID_PATTERN.test(discountCodeId)) {
    notFound()
  }
  await assertCurrentUserCanAccessChatbot(workspaceId)
  const discountCode = await findDiscountCode(workspaceId, discountCodeId)
  return (
    <DiscountCodeFormPage
      discountCode={discountCode}
      workspaceId={workspaceId}
    />
  )
}
