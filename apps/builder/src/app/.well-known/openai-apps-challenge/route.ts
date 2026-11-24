import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { env } from "@/env"
import { resolveRequestTenantId } from "@/lib/tenant/request-tenant"

// Domain verification tokens can rotate in the OpenAI Plugins portal. Do not
// prerender or cache this route, otherwise a rotated deployment value could
// keep serving the previous token.
export const dynamic = "force-dynamic"

const notFound = () =>
  new Response(null, { headers: { "Cache-Control": "no-store" }, status: 404 })

export const GET = async () => {
  const challenge = env.OPENAI_APPS_DOMAIN_CHALLENGE
  // The token verifies the platform's own domain; a white-label domain must
  // never serve it.
  if (!challenge || (await resolveRequestTenantId()) !== ROOT_TENANT_ID) {
    return notFound()
  }

  return new Response(challenge, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
