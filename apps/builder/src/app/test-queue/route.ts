import {
  IntegrationJobAction,
  integrationQueue,
} from "@ahachat.ai/worker-config"

export async function GET() {
  await integrationQueue.add(IntegrationJobAction.SEND_FLOW, {
    type: IntegrationJobAction.SEND_FLOW,
    data: {
      conversationId: "xeoqhlhrpj06lt6i5ka1jigg",
      flowId: "nvajg7a6hpk7krvd56al893s",
    },
  })

  return new Response("ok")
}
