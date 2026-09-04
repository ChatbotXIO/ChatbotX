import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

export const buildThreadsWebhookUrl = (clientId?: string | null): string => {
  const url = new URL(buildBrokerCallbackUrl("/integrations/threads/webhook"))

  if (clientId !== undefined && clientId !== null) {
    url.searchParams.set("appId", clientId)
  }

  return url.toString()
}
