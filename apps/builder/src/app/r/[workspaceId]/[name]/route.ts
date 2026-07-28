import { db } from "@chatbotx.io/database/client"
import { emit } from "@chatbotx.io/event-bus"
import {
  clickTypeSchema,
  decodeButtonPayload,
  type FlowNode,
  flowEventTypeSchema,
  resolveFlowActionTarget,
} from "@chatbotx.io/flow-config"
import { interpolate } from "@chatbotx.io/variables"
import { type NextRequest, NextResponse } from "next/server"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; name: string }> },
) => {
  const { workspaceId, name: nameParam } = await context.params
  const name = decodeURIComponent(nameParam)
  const { servable } = await loadServableWorkspace(workspaceId)
  if (!servable) {
    return NextResponse.json(
      { code: "workspaceScheduledDeletion" },
      { status: 410 },
    )
  }

  const row = await db.query.magicLinkModel.findFirst({
    where: {
      workspaceId,
      name,
    },
  })

  if (!row) {
    return NextResponse.json({ message: "Not found" }, { status: 404 })
  }

  let destination: string
  try {
    destination = interpolate(row.url, {
      ...Object.fromEntries(request.nextUrl.searchParams.entries()),
    })
  } catch {
    return NextResponse.json(
      { message: "Invalid link configuration" },
      { status: 400 },
    )
  }

  const code = request.nextUrl.searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(destination, 302)
  }

  // Decode the button payload
  const decodedButton = decodeButtonPayload(code)
  if (!decodedButton) {
    return NextResponse.json({ message: "Invalid code" }, { status: 400 })
  }
  if (!decodedButton.contactInboxId) {
    return NextResponse.json(
      { message: "Contact inbox ID is missing" },
      { status: 400 },
    )
  }

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      id: decodedButton.contactInboxId,
    },
    with: {
      conversation: true,
    },
  })

  if (!contactInbox?.conversation) {
    return NextResponse.json(
      { message: "Contact inbox not found" },
      { status: 404 },
    )
  }

  const flowVersion = await db.query.flowVersionModel.findFirst({
    where: {
      id: decodedButton?.flowVersionId,
      workspaceId,
    },
  })

  const nodes = flowVersion?.nodes as unknown as FlowNode[]

  // Quick replies use the same editor as step buttons, so they can also carry a
  // website link — resolving both keeps their magic links redirecting.
  const target = resolveFlowActionTarget(nodes, decodedButton?.buttonId ?? "")

  if (!target) {
    return NextResponse.json({ message: "Button not found" }, { status: 404 })
  }
  if (!target.nodeId) {
    return NextResponse.json({ message: "Node ID is missing" }, { status: 400 })
  }

  await emit(flowEventTypeSchema.enum["flow:clicked"], {
    nodeId: target.nodeId,
    context: {
      workspaceId,
      contactId: contactInbox.contactId,
      conversationId: contactInbox.conversation.id,
      channel: contactInbox.channel,
      contactInboxId: decodedButton.contactInboxId,
    },
    action: {
      flowId: decodedButton.flowId,
      buttonId: decodedButton.buttonId,
      broadcastId: decodedButton.broadcastId,
      sequenceStepId: decodedButton.sequenceStepId,
      magicLinkId: row.id,
      clickType: clickTypeSchema.enum.magic_link,
    },
    occurredAt: new Date(),
  })

  return NextResponse.redirect(destination, 302)
}
