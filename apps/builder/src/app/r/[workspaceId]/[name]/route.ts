import { flowVersionService } from "@chatbotx.io/business"
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
import { logger } from "@/lib/log"
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

  // `ContactInbox` has no `workspaceId` of its own and this id arrives inside the
  // payload, so the conversation's workspace is what proves the inbox belongs to
  // the workspace whose link is being served. Without it, a crafted code naming
  // another tenant's inbox would emit a click attributed to this workspace while
  // carrying that tenant's contact and conversation. Same guard, and the same
  // redirect-without-recording response, as `app/email-topic/click`.
  if (
    !contactInbox?.conversation ||
    contactInbox.conversation.workspaceId !== workspaceId
  ) {
    logger.warn(
      {
        workspaceId,
        magicLinkId: row.id,
        contactInboxId: decodedButton.contactInboxId,
        // Absent when the inbox is simply gone; a real id means the payload
        // pointed at another workspace.
        contactInboxWorkspaceId: contactInbox?.conversation?.workspaceId,
      },
      "Magic link click could not be attributed: contact inbox missing or outside this workspace",
    )
    return NextResponse.redirect(destination, 302)
  }

  // The payload pins a version only when the run that sent the message was
  // pinned, which almost none are, so the flow id has to carry the lookup — see
  // `flowVersionService.findForButtonPayload`.
  const flowVersion = await flowVersionService.findForButtonPayload({
    flowId: decodedButton.flowId,
    workspaceId,
    versionId: decodedButton.flowVersionId,
  })

  const nodes = flowVersion?.nodes as unknown as FlowNode[] | undefined

  // A flow that no longer resolves (deleted, or never published) costs the click
  // report, never the redirect: the contact tapped a link and the destination is
  // already known. Reported so an unattributed click is diagnosable.
  if (!nodes) {
    logger.warn(
      {
        workspaceId,
        magicLinkId: row.id,
        flowId: decodedButton.flowId,
        flowVersionId: decodedButton.flowVersionId,
      },
      "Magic link click could not be attributed: no flow version resolved",
    )
    return NextResponse.redirect(destination, 302)
  }

  // Quick replies use the same editor as step buttons, so they can also carry a
  // website link — resolving both keeps their magic links redirecting.
  const target = resolveFlowActionTarget(nodes, decodedButton.buttonId ?? "")

  // Republishing without the button strands every link already sent for it, since
  // the payload resolves the live version rather than the one that sent the
  // message. Treated like an unresolvable version: the destination belongs to the
  // magic link, not to the button, so only the attribution is lost.
  if (!target?.nodeId) {
    logger.warn(
      {
        workspaceId,
        magicLinkId: row.id,
        flowId: decodedButton.flowId,
        flowVersionId: flowVersion?.id,
        buttonId: decodedButton.buttonId,
      },
      "Magic link click could not be attributed: button not in the live version",
    )
    return NextResponse.redirect(destination, 302)
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
