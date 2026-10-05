/**
 * The link a magic link is served at (`app/r/[workspaceId]/[name]`). Shared
 * by the table's Copy URL (browser origin) and the public API (tenant app
 * URL) so both hand out the same shape.
 */
export const buildMagicLinkUrl = (input: {
  origin: string
  workspaceId: string
  name: string
}): string =>
  new URL(`/r/${input.workspaceId}/${input.name}`, input.origin).toString()
