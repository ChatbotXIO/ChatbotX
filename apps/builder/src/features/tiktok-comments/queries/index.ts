import { commentAutomationService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListTiktokCommentsRequest,
  ListTiktokCommentsResponse,
} from "../schema/action"
import { tiktokCommentResource } from "./../schema/resource"

/**
 * Narrows a stored row to the shape TikTok actually supports.
 *
 * The row is the shared `CommentAutomation` one, so it can carry values no
 * TikTok automation can act on — a `postIds` variant the picker never writes, a
 * `flow` private reply. `includeKeywords` (including `mentions`) passes through
 * untouched via the spread. Normalising here keeps the resource schema honest about what
 * the channel does rather than about what the table can hold.
 */
const toTiktokResource = (
  record: Awaited<
    ReturnType<typeof commentAutomationService.getTiktokAutomation>
  > &
    object,
) => ({
  ...record,
  post: {
    type: record.post.type === "postIds" ? "postIds" : "all",
    value: record.post.type === "postIds" ? record.post.value : [],
  },
  // `flow` is the one private-reply variant TikTok cannot deliver — see the
  // resource schema — and the shared table can still hold one from a row
  // written before this channel gained a private branch at all.
  privateReply:
    record.privateReply.type === "text" ||
    record.privateReply.type === "AIAgent"
      ? {
          type: record.privateReply.type,
          value: record.privateReply.value ?? "",
        }
      : { type: "none", value: null },
  publicReply:
    record.publicReply.type === "none"
      ? { type: "none", value: null }
      : {
          type: record.publicReply.type,
          value: record.publicReply.value ?? "",
          // Passed through, like `includeKeywords` via the spread: the edit
          // form writes back what it reads, so dropping it erases every text
          // after the first on the next save.
          values: record.publicReply.values,
        },
})

export async function listTiktokComments(
  input: ListTiktokCommentsRequest,
): Promise<ListTiktokCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { data, pageCount } =
    await commentAutomationService.listTiktokAutomations(input)

  return {
    data: tiktokCommentResource.array().parse(data.map(toTiktokResource)),
    pageCount,
  }
}

export async function getTiktokComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const record = await commentAutomationService.getTiktokAutomation({
    workspaceId,
    id,
  })

  if (!record) {
    throw new Error("TikTok Comment Automation not found")
  }

  return tiktokCommentResource.parse(toTiktokResource(record))
}
