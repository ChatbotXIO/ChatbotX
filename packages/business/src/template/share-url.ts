import { resolveWorkspaceAppUrl } from "../platform/settings"

/**
 * A template's share link on the host serving its workspace: a white-label
 * tenant's custom domain when it has an active one, whichever host the
 * request came through. It carries the Template ID and Key in the open, so
 * they can be read off the link.
 */
export const resolveTemplateShareUrl = async (input: {
  workspaceId: string
  templateId: string
  shareToken: string
}): Promise<string> => {
  const url = new URL(
    "/t/template",
    await resolveWorkspaceAppUrl({ workspaceId: input.workspaceId }),
  )
  url.searchParams.set("id", input.templateId)
  url.searchParams.set("key", input.shareToken)
  return url.toString()
}
