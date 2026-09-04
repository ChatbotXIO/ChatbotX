"use server"

import {
  isSuperAdmin,
  workspaceSupportAccessService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getCurrentUser } from "@/lib/auth/utils"
import type {
  ListAdminWorkspacesRequest,
  ListAdminWorkspacesResponse,
} from "../schema/query"

/**
 * The `/admin` layout already gates the whole console on `isSuperAdmin`, but
 * this query is a plain server function callable outside that layout (e.g.
 * from another RSC or a future route) — so it re-checks explicitly. Cheap
 * defense in depth, not redundant trust in the layout.
 */
export async function listAdminWorkspaces(
  input: ListAdminWorkspacesRequest,
): Promise<ListAdminWorkspacesResponse> {
  const user = await getCurrentUser()
  if (!(user && isSuperAdmin(user))) {
    throw new ChatbotXException("Unauthorized")
  }

  return await workspaceSupportAccessService.listWorkspaces({
    ...input,
    keyword: input.keyword ?? undefined,
  })
}
