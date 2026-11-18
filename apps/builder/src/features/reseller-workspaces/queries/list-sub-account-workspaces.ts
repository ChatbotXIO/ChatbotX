import "server-only"

import { workspaceService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getManageAccess } from "@/app/manage/reseller-guard"
import type { ListSubAccountWorkspacesRequest } from "../schema/query"

export type ListSubAccountWorkspacesResponse = Awaited<
  ReturnType<typeof workspaceService.listSubAccountWorkspaces>
>

/**
 * The reseller's sub-accounts' workspaces. Layouts are not an authorization
 * boundary, so this re-checks that the visitor is an active reseller; the
 * tenant itself is derived from their user id inside the service.
 */
export async function listSubAccountWorkspaces(
  input: ListSubAccountWorkspacesRequest,
): Promise<ListSubAccountWorkspacesResponse> {
  const { user, canManageReseller } = await getManageAccess()
  if (!(user && canManageReseller)) {
    return notFound()
  }

  return await workspaceService.listSubAccountWorkspaces({
    resellerUserId: user.id,
    ...input,
    keyword: input.keyword ?? undefined,
  })
}
