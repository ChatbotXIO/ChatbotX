import { importService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListImportsRequest, ListImportsResponse } from "../schemas/query"

export async function listImports(
  input: ListImportsRequest & { workspaceId: string },
): Promise<ListImportsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await importService.list({
    ...input,
    page: input.page ?? undefined,
    perPage: input.perPage ?? undefined,
    sort: input.sort ?? undefined,
  })
}
