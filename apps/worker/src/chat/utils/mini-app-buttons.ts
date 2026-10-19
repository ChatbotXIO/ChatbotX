import { miniAppService } from "@chatbotx.io/business/mini-app"
import {
  signMiniAppResumeToken,
  signMiniAppToken,
} from "@chatbotx.io/encryption/mini-app-token"
import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"
import { mapStepButtons, readStepButtons } from "./step-buttons"

type MiniAppLinkContext = {
  workspaceId: string
  contactId: string
  conversationId: string
  contactInboxId: string
  flowId: string
  flowVersionId?: string
  metadata?: MetadataPayload
  appUrl: string
}

type OpenMiniAppButton = Extract<ButtonStepProps, { buttonType: "openMiniApp" }>

const isOpenMiniAppButton = (
  button: ButtonStepProps,
): button is OpenMiniAppButton =>
  button.buttonType === buttonTypes.enum.openMiniApp

/**
 * The ids, among `miniAppIds`, of Mini Apps this workspace can send: in the
 * workspace and enabled. A flow copied from another workspace keeps that
 * workspace's ids, which must not be linked to.
 */
const findSendableMiniAppIds = async (
  workspaceId: string,
  miniAppIds: string[],
): Promise<Set<string>> => {
  const miniApps = await Promise.all(
    [...new Set(miniAppIds)].map((id) => miniAppService.findUnscoped(id)),
  )
  return new Set(
    miniApps
      .filter(
        (miniApp) => miniApp?.workspaceId === workspaceId && miniApp.enabled,
      )
      .map((miniApp) => miniApp?.id as string),
  )
}

/**
 * Turns an "Open Mini App" button into a plain `openWebsite` button whose link
 * opens the Mini App for this contact. Every channel encoder already knows how
 * to send a link button, so none of them needs a Mini App case.
 *
 * The link carries two signed tokens: `token` names the contact (the same
 * `{{mini_app_token}}` a pasted Mini App link resolves to), and `resume` names
 * the button and conversation, so a submission can continue the flow along the
 * button's edge. The payload inside `resume` is built exactly like the one
 * `convertButtonsToTemplate` puts on a tapped button.
 */
const toMiniAppLinkButton = async (
  props: MiniAppLinkContext & {
    button: OpenMiniAppButton
    contactToken: string
  },
): Promise<ButtonStepProps> => {
  const { button } = props
  const buttonPayload = encodeButtonPayload({
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    buttonId: button.id,
    broadcastId: extractMetadata("broadcastId", props.metadata),
    sequenceStepId: extractMetadata("sequenceStepId", props.metadata),
    contactInboxId: props.contactInboxId,
    commentAutomationId: extractMetadata("commentAutomationId", props.metadata),
  })
  const resumeToken = await signMiniAppResumeToken({
    workspaceId: props.workspaceId,
    contactId: props.contactId,
    miniAppId: button.beforeStep.miniAppId,
    conversationId: props.conversationId,
    contactInboxId: props.contactInboxId,
    buttonPayload,
  })

  const url = new URL("/mini-apps", props.appUrl)
  url.searchParams.set("id", button.beforeStep.miniAppId)
  url.searchParams.set("token", props.contactToken)
  url.searchParams.set("resume", resumeToken)

  return {
    id: button.id,
    label: button.label,
    buttonType: buttonTypes.enum.openWebsite,
    beforeStep: {
      id: createId(),
      stepType: stepTypes.enum.openWebsite,
      url: url.toString(),
      browserSize: 100,
    },
    steps: button.steps,
  }
}

/**
 * Resolves every Open Mini App button on a step (its own buttons and its
 * cards') and on its quick replies into a link button. A button whose Mini App
 * is missing, disabled or from another workspace is dropped from the message.
 * Does nothing — no lookup, no signing, no copy — when there is no such button.
 */
export const resolveMiniAppLinks = async (
  props: MiniAppLinkContext & {
    step: SendFlowStepData
    quickReplies?: ButtonStepProps[]
  },
): Promise<{ step: SendFlowStepData; quickReplies?: ButtonStepProps[] }> => {
  const miniAppButtons = [
    ...readStepButtons(props.step),
    ...(props.quickReplies ?? []),
  ].filter(isOpenMiniAppButton)
  if (miniAppButtons.length === 0) {
    return { step: props.step, quickReplies: props.quickReplies }
  }

  const [sendableIds, contactToken] = await Promise.all([
    findSendableMiniAppIds(
      props.workspaceId,
      miniAppButtons.map((button) => button.beforeStep.miniAppId),
    ),
    signMiniAppToken({
      workspaceId: props.workspaceId,
      contactId: props.contactId,
    }),
  ])

  const resolveButtons = async (buttons: ButtonStepProps[]) => {
    const resolved = await Promise.all(
      buttons.map((button) => {
        if (!isOpenMiniAppButton(button)) {
          return button
        }
        if (!sendableIds.has(button.beforeStep.miniAppId)) {
          logger.warn(
            {
              workspaceId: props.workspaceId,
              flowId: props.flowId,
              buttonId: button.id,
              miniAppId: button.beforeStep.miniAppId,
            },
            "Dropping an Open Mini App button whose Mini App cannot be sent",
          )
          return null
        }
        return toMiniAppLinkButton({ ...props, button, contactToken })
      }),
    )
    return resolved.filter((button) => button !== null)
  }

  const [step, quickReplies] = await Promise.all([
    mapStepButtons(props.step, resolveButtons),
    props.quickReplies ? resolveButtons(props.quickReplies) : undefined,
  ])
  return { step, quickReplies }
}
