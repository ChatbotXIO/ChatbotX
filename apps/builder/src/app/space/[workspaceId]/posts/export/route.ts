import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getIdFromParams } from "@chatbotx.io/utils"
import { UTF8_BOM } from "@chatbotx.io/utils/csv"
import { notFound } from "next/navigation"
import { channelPostManagementOperations } from "@/features/channel-posts/lib/management-operations"
import {
  EXPORT_ROWS_ARRAY_KEYS,
  exportChannelPostCommentsRequest,
  exportChannelPostRowsFilters,
} from "@/features/channel-posts/schema/management"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { isCrossSiteRequest } from "@/lib/http/same-site-request"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"

export const runtime = "nodejs"

/** `Sec-Fetch-Site: same-site` is a sibling subdomain, not this origin. */
const isSiblingSiteRequest = (request: Request) =>
  request.headers.get("sec-fetch-site") === "same-site"

/** The list filters of a `kind=rows` export, read from the query string like the public list does. */
const rowsFiltersFromQuery = (searchParams: URLSearchParams) => {
  const query: Record<string, string | string[]> = {}
  for (const key of Object.keys(exportChannelPostRowsFilters.shape)) {
    const values = searchParams.getAll(key)
    if (values.length === 0) {
      continue
    }
    query[key] = (EXPORT_ROWS_ARRAY_KEYS as readonly string[]).includes(key)
      ? values
      : (values[0] ?? "")
  }
  return query
}

/**
 * Downloads the comments (`kind=comments`) or the phone numbers (`kind=phones`)
 * of one or more posts (`postId` repeated) as a CSV. The same service as the
 * public export procedure builds the file, so a download and an API call agree.
 * `kind=rows` writes the post list itself (one row per post) for the list
 * filters given as query parameters (`channels`, `inboxIds`, `publishedFrom`, …,
 * `sort`) instead of `postId`.
 * `phones` needs the member's `emailAndPhone` permission and is refused, never
 * partly written, without it. A download consumes a message of the quota, so
 * an expired workspace is refused (402 `workspaceBlocked`) like a chat send.
 * A GET with the session cookie that spends quota must not be triggerable from
 * another site (a link, an image, a redirect), so only a same-origin request is
 * served: anything else answers 403 `crossSiteRequest` before anything is read
 * or charged. The page downloads with `fetch` from its own origin.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ workspaceId: string }> },
) {
  if (isCrossSiteRequest(request) || isSiblingSiteRequest(request)) {
    return Response.json({ code: "crossSiteRequest" }, { status: 403 })
  }
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    notFound()
  }
  const access = await requireWorkspacePermission(workspaceId, "broadcast")
  const { searchParams } = new URL(request.url)
  const kind = searchParams.get("kind")
  const postIds = searchParams.getAll("postId")
  const parsed = exportChannelPostCommentsRequest.safeParse({
    filters: kind === "rows" ? rowsFiltersFromQuery(searchParams) : undefined,
    kind,
    postIds: postIds.length > 0 ? postIds : undefined,
    search: searchParams.get("search") ?? undefined,
  })
  // Posts are chosen by id for the comment kinds and by filters for `rows`, never both.
  const selectsByIds = parsed.success && parsed.data.kind !== "rows"
  if (!parsed.success || selectsByIds === (parsed.data.postIds === undefined)) {
    return Response.json({ code: "invalidRequest" }, { status: 400 })
  }

  const canViewEmailAndPhone = canViewContactEmailAndPhone(
    access.targetWorkspaceMember.permissions,
  )

  try {
    await assertWorkspaceNotBlocked(access.targetWorkspace.ownerId)
    const file = await channelPostManagementOperations.exportComments(
      { canViewEmailAndPhone, workspaceId },
      parsed.data,
    )
    return new Response(`${UTF8_BOM}${file.csv}`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Export-Row-Count": String(file.rowCount),
        "X-Export-Truncated": String(file.truncated),
      },
    })
  } catch (error) {
    if (error instanceof ChatbotXException) {
      return Response.json(
        { code: error.code },
        { status: error.httpStatusCode },
      )
    }
    throw error
  }
}
