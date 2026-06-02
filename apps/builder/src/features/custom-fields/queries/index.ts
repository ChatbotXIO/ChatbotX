import { customFieldService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindCustomFieldByKeyRequest,
  FindCustomFieldRequest,
  ListCustomFieldsRequest,
  ListCustomFieldsResponse,
} from "../schemas/query"
import type { CustomFieldResource } from "../schemas/resource"

export const listCustomFieldsRSC = async (
  input: ListCustomFieldsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return listCustomFields(input)
}

export function listCustomFields(
  input: ListCustomFieldsRequest & { workspaceId: string },
): Promise<ListCustomFieldsResponse> {
  return customFieldService.list(input)
}

export const findCustomField = async (
  input: FindCustomFieldRequest,
): Promise<CustomFieldResource | undefined> =>
  await customFieldService.findBy({ where: input })

export const findCustomFieldByKey = async (
  input: FindCustomFieldByKeyRequest,
): Promise<CustomFieldResource | undefined> =>
  await customFieldService.findByKey(input)
