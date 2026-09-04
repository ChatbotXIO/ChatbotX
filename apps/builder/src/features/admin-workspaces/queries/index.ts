"use server"

import {
  isSuperAdmin,
  workspaceSupportAccessService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/utils"
import type { ListAdminWorkspacesRequest } from "../schema/query"

export type ListAdminWorkspacesResponse = Awaited<
  ReturnType<typeof workspaceSupportAccessService.listWorkspaces>
>

/**
 * The `/admin` layout already gates the whole console on `isSuperAdmin`, but
 * this query is a plain server function callable outside that layout (e.g.
 * from another RSC or a future route) — so it re-checks explicitly. Cheap
 * defense in depth, not redundant trust in the layout. Degrades the same way
 * as the layout's own gate (`notFound()`) rather than a generic error page.
 */
export async function listAdminWorkspaces(
  input: ListAdminWorkspacesRequest,
): Promise<ListAdminWorkspacesResponse> {
  const user = await getCurrentUser()
  if (!(user && isSuperAdmin(user))) {
    return notFound()
  }

  return await workspaceSupportAccessService.listWorkspaces({
    ...input,
    keyword: input.keyword ?? undefined,
  })
}
