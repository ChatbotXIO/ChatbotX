import { dynamicImageService } from "@chatbotx.io/business/dynamic-image"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListDynamicImagesRequest,
  ListDynamicImagesResponse,
} from "../schema/query"
import type { DynamicImageResource } from "../schema/resource"

export async function listDynamicImages(
  input: ListDynamicImagesRequest,
): Promise<ListDynamicImagesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await dynamicImageService.list({
    ...input,
    name: input.name ?? undefined,
  })
}

export async function findDynamicImage(where: {
  workspaceId: string
  id: string
}): Promise<DynamicImageResource | undefined> {
  await assertCurrentUserCanAccessChatbot(where.workspaceId)

  try {
    return await dynamicImageService.find(where)
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return
    }
    throw error
  }
}
