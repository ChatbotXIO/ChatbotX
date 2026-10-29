import { env } from "@/env"
import {
  getMcpPublicPath,
  getMcpPublicUrl,
  mcpOAuthScopes,
} from "@/features/mcp-oauth/lib/mcp-oauth"

export const GET = async (
  _request: Request,
  context: {
    params: Promise<{ path: string[] }>
  },
) => {
  const { path } = await context.params
  const resourcePath = `/${path.join("/")}`
  const mcpUrl = new URL(getMcpPublicUrl())
  const mcpPath = getMcpPublicPath()
  if (
    !mcpPath ||
    mcpUrl.origin !== new URL(env.BETTER_AUTH_URL).origin ||
    !(resourcePath === mcpPath || resourcePath.startsWith(`${mcpPath}/`))
  ) {
    return new Response(null, { status: 404 })
  }

  return Response.json(
    {
      resource: new URL(resourcePath, mcpUrl.origin).toString(),
      authorization_servers: [env.BETTER_AUTH_URL],
      scopes_supported: mcpOAuthScopes,
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
