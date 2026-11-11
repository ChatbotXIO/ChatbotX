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
}): Promise<string> =>
  buildTemplateShareUrl(
    await resolveWorkspaceAppUrl({ workspaceId: input.workspaceId }),
    input,
  )

/** The share link's path and query, for a page that links on its own host. */
export const buildTemplateSharePath = (input: {
  templateId: string
  shareToken: string
}): string => {
  const query = new URLSearchParams({
    id: input.templateId,
    key: input.shareToken,
  })
  return `/t/template?${query}`
}

/** The share link of a template on an already-resolved app URL, for lists that resolve the host once. */
export const buildTemplateShareUrl = (
  appUrl: string,
  input: { templateId: string; shareToken: string },
): string => new URL(buildTemplateSharePath(input), appUrl).toString()
