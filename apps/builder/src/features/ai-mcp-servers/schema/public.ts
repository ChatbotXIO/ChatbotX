import { aiMcpServerAuthTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { aiMcpServerResource } from "./resource"

// `auth` carries the raw secret used to authenticate to the external MCP
// server (a bearer token, or custom header values). The public API is
// reachable by any automation-scoped workspace token — a materially
// broader and more long-lived trust boundary than the session-authenticated
// builder UI this resource also backs — so the secret itself must never
// appear in a response, only whether/how auth is configured.
export const publicAIMcpServerAuth = z.discriminatedUnion("type", [
  z.object({ type: z.literal(aiMcpServerAuthTypes.enum.none) }),
  z.object({ type: z.literal(aiMcpServerAuthTypes.enum.token) }),
  z.object({
    type: z.literal(aiMcpServerAuthTypes.enum.header),
    headers: z.array(z.object({ header: z.string() })),
  }),
])

export const publicAIMcpServerResource = aiMcpServerResource
  .omit({ auth: true })
  .extend({ auth: publicAIMcpServerAuth })
