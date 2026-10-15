import {
  integrationWhatsappService,
  whatsappNumberLabel,
} from "@chatbotx.io/business"
import {
  miniAppService,
  miniAppSubmissionService,
} from "@chatbotx.io/business/mini-app"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListMiniAppsRequest } from "../schema/query"

export async function listMiniApps(input: ListMiniAppsRequest) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await miniAppService.list(input)
}

export async function findMiniApp(input: { workspaceId: string; id: string }) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await miniAppService.findOrFail(input).catch(() => undefined)
}

export async function listMiniAppSubmissions(input: {
  workspaceId: string
  miniAppId: string
  page: number
  perPage: number
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await miniAppSubmissionService.list(input)
}

export type WhatsappPublishTarget = { id: string; label: string }

/** The workspace's WhatsApp numbers, reduced to what the publish picker shows (never the auth blob). */
export async function listWhatsappPublishTargets(
  workspaceId: string,
): Promise<WhatsappPublishTarget[]> {
  await assertCurrentUserCanAccessChatbot(workspaceId)
  const integrations =
    await integrationWhatsappService.listByWorkspaceId(workspaceId)
  return integrations.map((integration) => ({
    id: integration.id,
    label: whatsappNumberLabel(integration),
  }))
}
