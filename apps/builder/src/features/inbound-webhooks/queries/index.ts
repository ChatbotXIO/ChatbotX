import { inboundWebhookService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  toInboundWebhookRequestSummary,
  toInboundWebhookSummary,
} from "../schema/public"

export async function listInboundWebhooks(input: {
  workspaceId: string
  page: number
  perPage: number
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const { data, pageCount } = await inboundWebhookService.list(input)
  return { data: data.map(toInboundWebhookSummary), pageCount }
}

export async function findInboundWebhookForEditor(input: {
  workspaceId: string
  id: string
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await inboundWebhookService.findOrFail(input)
}

/** One page of the delivery log, without payloads (those load on demand). */
export async function listInboundWebhookRequests(input: {
  workspaceId: string
  inboundWebhookId: string
  page: number
  perPage: number
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const { data, pageCount } = await inboundWebhookService.listRequests(input)
  return { data: data.map(toInboundWebhookRequestSummary), pageCount }
}
