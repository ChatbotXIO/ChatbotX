import { env } from "@/env"

// Domain verification tokens can rotate in the OpenAI Plugins portal. Do not
// prerender or cache this route, otherwise a rotated deployment value could
// keep serving the previous token.
export const dynamic = "force-dynamic"

export const GET = () => {
  const challenge = env.OPENAI_APPS_DOMAIN_CHALLENGE
  if (!challenge) {
    return new Response(null, {
      headers: { "Cache-Control": "no-store" },
      status: 404,
    })
  }

  return new Response(challenge, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
