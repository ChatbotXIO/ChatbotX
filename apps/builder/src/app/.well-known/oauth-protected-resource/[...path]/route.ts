import { env } from "@/env"
import { getMcpPublicUrl } from "@/features/mcp-oauth/lib/mcp-url"
import { mcpOAuthScopes } from "@/features/mcp-oauth/lib/oauth-metadata"

const trailingSlash = /\/$/

export const GET = async (
  _request: Request,
  context: {
    params: Promise<{ path: string[] }>
  },
) => {
  const { path } = await context.params
  const resourcePath = `/${path.join("/")}`
  const mcpPath = new URL(getMcpPublicUrl()).pathname.replace(trailingSlash, "")
  if (!(resourcePath === mcpPath || resourcePath.startsWith(`${mcpPath}/`))) {
    return new Response(null, { status: 404 })
  }

  return Response.json(
    {
      resource: new URL(resourcePath, env.BETTER_AUTH_URL).toString(),
      authorization_servers: [env.BETTER_AUTH_URL],
      scopes_supported: mcpOAuthScopes,
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
