import {
  integrationWhatsappService,
  whatsappFlowService,
} from "@chatbotx.io/business"
import {
  notFoundException,
  validationException,
} from "@chatbotx.io/business/errors"
import {
  miniAppPublicationService,
  miniAppService,
} from "@chatbotx.io/business/mini-app"
import type { PublishFlowJsonResult } from "@chatbotx.io/integration-whatsapp/api/flow"
import {
  hasContactVariables,
  type MiniAppDefinition,
} from "@chatbotx.io/mini-app"
import { getTranslations } from "next-intl/server"
import { buildWhatsappContext } from "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations"
import { integrations } from "@/integration"

type MiniAppWhatsappTarget = {
  workspaceId: string
  miniAppId: string
  integrationWhatsappId: string
}

/** The workspace's WhatsApp number and a context to call Meta with. */
async function loadWhatsappContext(target: MiniAppWhatsappTarget) {
  const integrationWhatsapp =
    await integrationWhatsappService.findByIdForWorkspace({
      id: target.integrationWhatsappId,
      workspaceId: target.workspaceId,
    })
  if (!integrationWhatsapp) {
    throw notFoundException("WhatsApp number not found")
  }
  return {
    integrationWhatsapp,
    whatsappContext: await buildWhatsappContext(
      target.workspaceId,
      integrationWhatsapp,
    ),
  }
}

/** The Mini App's Flow on one number; throws when it was never pushed there. */
async function loadPublication(target: MiniAppWhatsappTarget) {
  const miniApp = await miniAppService.findOrFail({
    workspaceId: target.workspaceId,
    id: target.miniAppId,
  })
  const publication = await miniAppPublicationService.findForIntegration({
    miniAppId: miniApp.id,
    integrationWhatsappId: target.integrationWhatsappId,
  })
  if (!publication) {
    const t = await getTranslations("miniApps.publish")
    throw notFoundException(t("notOnNumber"))
  }
  return publication
}

/**
 * Mirrors a Meta call's result into `WhatsappFlow` (so the "Send WhatsApp
 * Flow" step can pick it right away) and into the Mini App's publication.
 */
async function recordFlowResult(props: {
  miniAppId: string
  integrationWhatsappId: string
  result: PublishFlowJsonResult
}) {
  const { result } = props
  const whatsappFlow = await whatsappFlowService.upsertFromMeta({
    integrationWhatsappId: props.integrationWhatsappId,
    flow: result.flow,
  })
  const publication = await miniAppPublicationService.record({
    miniAppId: props.miniAppId,
    integrationWhatsappId: props.integrationWhatsappId,
    whatsappFlowId: whatsappFlow.id,
    sourceId: result.flow.id,
    status: result.flow.status,
    // A refused publish has no validation error; surface Meta's reason the
    // same way so the dialog and API callers see why it stayed a draft.
    validationErrors: [
      ...(result.flow.validation_errors ?? []),
      ...(result.publishError ? [{ message: result.publishError }] : []),
    ],
    published: result.published,
  })
  // `published` comes from the publish call itself; the status Meta reports
  // right after it can lag behind.
  return { ...publication, published: result.published }
}

/**
 * Sends the Mini App to one of the workspace's WhatsApp numbers as a Flow.
 * With `publish: false` it is saved on Meta as a draft (to preview it, then
 * publish or delete it); otherwise it is published right away. Shared by the
 * builder actions and the public API.
 */
/** Refuses a Mini App with validation errors or `{{variables}}` WhatsApp cannot show. */
async function assertPublishable(definition: MiniAppDefinition) {
  const validation = miniAppService.validate(definition)
  if (!validation.valid) {
    throw validationException(
      "definition",
      "Fix the Mini App errors before publishing",
      {
        errors: validation.issues.filter((issue) => issue.severity === "error")
          .length,
      },
    )
  }
  // Custom field values only render on the web link for now; WhatsApp would
  // show the raw `{{first_name}}` tokens to every recipient.
  if (hasContactVariables(definition)) {
    const t = await getTranslations("miniApps.publish")
    throw validationException("definition", t("contactVariables"))
  }
}

export async function publishMiniAppToWhatsapp(
  props: MiniAppWhatsappTarget & { publish?: boolean },
) {
  const miniApp = await miniAppService.findOrFail({
    workspaceId: props.workspaceId,
    id: props.miniAppId,
  })
  await assertPublishable(miniApp.definition)

  const { integrationWhatsapp, whatsappContext } =
    await loadWhatsappContext(props)
  const existing = await miniAppPublicationService.findForIntegration({
    miniAppId: miniApp.id,
    integrationWhatsappId: integrationWhatsapp.id,
  })
  const result = await integrations.whatsapp.runAction("publishFlowJson", {
    ctx: whatsappContext,
    params: {
      name: miniApp.name,
      flowJson: JSON.stringify(miniApp.flowJson),
      existingFlowId: existing?.sourceId,
      publish: props.publish ?? true,
    },
  })
  if (result.refusedLive) {
    // Nothing changed on Meta; only bring the stored status in line with it
    // (without moving `publishedAt`) before refusing the draft save.
    await recordFlowResult({
      miniAppId: miniApp.id,
      integrationWhatsappId: integrationWhatsapp.id,
      result: { ...result, published: false },
    })
    const t = await getTranslations("miniApps.publish")
    throw validationException("publish", t("flowIsLive"))
  }
  return await recordFlowResult({
    miniAppId: miniApp.id,
    integrationWhatsappId: integrationWhatsapp.id,
    result,
  })
}

/** Publishes the draft already on Meta, exactly as it was previewed. */
export async function publishMiniAppWhatsappDraft(
  props: MiniAppWhatsappTarget,
) {
  const publication = await loadPublication(props)
  const { whatsappContext } = await loadWhatsappContext(props)
  const result = await integrations.whatsapp.runAction("publishFlowDraft", {
    ctx: whatsappContext,
    params: { flowSourceId: publication.sourceId },
  })
  return await recordFlowResult({
    miniAppId: publication.miniAppId,
    integrationWhatsappId: publication.integrationWhatsappId,
    result,
  })
}

/** Meta's temporary web preview link of the Mini App's Flow on one number. */
export async function getMiniAppWhatsappPreview(props: MiniAppWhatsappTarget) {
  const publication = await loadPublication(props)
  const { whatsappContext } = await loadWhatsappContext(props)
  return await integrations.whatsapp.runAction("getFlowPreview", {
    ctx: whatsappContext,
    params: { flowSourceId: publication.sourceId },
  })
}

/**
 * Deletes the Mini App's draft Flow from Meta and forgets it, so the Mini App
 * is no longer on that number. The status is read from Meta, not from the
 * stored publication (which can lag behind): a Flow that is live there is
 * refused and left serving, never deprecated (delete the Mini App with its
 * Flows to deprecate it instead).
 */
export async function deleteMiniAppWhatsappDraft(props: MiniAppWhatsappTarget) {
  const publication = await loadPublication(props)
  const { whatsappContext } = await loadWhatsappContext(props)
  const result = await integrations.whatsapp.runAction("deleteFlowDraft", {
    ctx: whatsappContext,
    params: { flowSourceId: publication.sourceId },
  })
  await whatsappFlowService.markRemovedOnMeta({
    workspaceId: props.workspaceId,
    sourceId: publication.sourceId,
    status: result.status,
  })
  if (result.outcome === "notDraft") {
    await miniAppPublicationService.record({
      miniAppId: publication.miniAppId,
      integrationWhatsappId: publication.integrationWhatsappId,
      whatsappFlowId: publication.whatsappFlowId,
      sourceId: publication.sourceId,
      status: result.status ?? publication.status,
      validationErrors: [],
      published: false,
    })
    const t = await getTranslations("miniApps.publish")
    throw validationException("integrationWhatsappId", t("onlyDraftDeletable"))
  }
  await miniAppPublicationService.remove({
    miniAppId: publication.miniAppId,
    integrationWhatsappId: publication.integrationWhatsappId,
  })
  return { outcome: result.outcome }
}
