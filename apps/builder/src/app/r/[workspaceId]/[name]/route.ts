import { db } from "@chatbotx.io/database/client"
import { emit } from "@chatbotx.io/event-bus"
import {
  clickTypeSchema,
  decodeButtonPayload,
  FlowEventType,
  type FlowNode,
  getNodeFromButton,
} from "@chatbotx.io/flow-config"
import { interpolate } from "@chatbotx.io/variables"
import { type NextRequest, NextResponse } from "next/server"

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; name: string }> },
) => {
  const { workspaceId, name: nameParam } = await context.params
  const name = decodeURIComponent(nameParam)
  const code = request.nextUrl.searchParams.get("code")

  const row = await db.query.magicLinkModel.findFirst({
    where: {
      workspaceId,
      name,
    },
  })

  if (!row) {
    return NextResponse.json({ message: "Not found" }, { status: 404 })
  }

  if (!code) {
    return NextResponse.json({ message: "Code is required" }, { status: 400 })
  }

  const decodeButton = decodeButtonPayload(code)

  if (!decodeButton) {
    return NextResponse.json({ message: "Invalid code" }, { status: 400 })
  }

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      id: decodeButton?.contactInboxId,
    },
    with: {
      contact: {
        columns: {
          id: true,
        },
      },
      conversation: true,
    },
  })

  if (!contactInbox) {
    return NextResponse.json(
      { message: "Contact inbox not found" },
      { status: 404 },
    )
  }

  const flowVersion = await db.query.flowVersionModel.findFirst({
    where: {
      id: decodeButton?.flowVersionId,
      workspaceId,
    },
  })

  const nodes = flowVersion?.nodes as unknown as FlowNode[]

  const { button: foundedButton, nodeId: foundedNodeId } = getNodeFromButton(
    nodes,
    decodeButton?.buttonId ?? "",
  )

  if (!foundedButton) {
    return NextResponse.json({ message: "Button not found" }, { status: 404 })
  }

  await emit(FlowEventType["flow:clicked"], {
    nodeId: foundedNodeId ?? "",
    context: {
      workspaceId,
      contactId: contactInbox?.contact.id ?? "",
      conversationId: contactInbox?.conversation.id ?? "",
      channel: contactInbox?.channel ?? "",
      contactInboxId: decodeButton?.contactInboxId ?? "",
    },
    action: {
      flowId: decodeButton?.flowId ?? "",
      buttonId: decodeButton?.buttonId ?? "",
      broadcastId: decodeButton?.broadcastId ?? "",
      sequenceStepId: decodeButton?.sequenceStepId ?? "",
      magicLinkId: row.id,
      clickType: clickTypeSchema.enum.magic_link,
    },
    occurredAt: new Date(),
  })

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

  return NextResponse.redirect(destination, 302)
}
