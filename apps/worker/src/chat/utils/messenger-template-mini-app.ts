import {
  type ButtonStepProps,
  buttonTypes,
  type MessengerTemplateComponent,
  type MessengerTemplateParams,
  readMessengerMiniAppButtons,
} from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"
import {
  findSendableMiniAppIds,
  type MiniAppResumeContext,
  signMiniAppResume,
} from "./mini-app-buttons"

/**
 * Lets a Messenger template sent from a flow continue that flow after the
 * contact submits one of its Mini Apps.
 *
 * A template's Mini App URL button has room for one suffix — today the
 * contact's `{{mini_app_token}}`. The step pairs each such button, in template
 * order, with an `openMiniApp` flow button whose edge says where to go next;
 * here the suffix becomes that button's signed `resume` token, which names the
 * contact too, so the Mini App still knows who submitted. A button whose Mini
 * App is not sendable from this workspace keeps the contact token. Returns
 * `params` untouched when there is nothing to pair.
 */
export const applyMiniAppResumeToTemplateParams = async (
  props: MiniAppResumeContext & {
    components: MessengerTemplateComponent[]
    params: MessengerTemplateParams
    flowButtons: ButtonStepProps[]
  },
): Promise<MessengerTemplateParams> => {
  const flowMiniAppButtons = props.flowButtons.filter(
    (button) => button.buttonType === buttonTypes.enum.openMiniApp,
  )
  const pairs = readMessengerMiniAppButtons(props.components)
    .slice(0, flowMiniAppButtons.length)
    .map((templateButton, position) => ({
      templateButton,
      flowButton: flowMiniAppButtons[position] as ButtonStepProps,
    }))
  if (pairs.length === 0 || !props.params.button) {
    return props.params
  }

  const sendableIds = await findSendableMiniAppIds(
    props.workspaceId,
    pairs.map((pair) => pair.templateButton.miniAppId),
  )
  const suffixByIndex = new Map<number, string>()
  await Promise.all(
    pairs.map(async ({ templateButton, flowButton }) => {
      if (!sendableIds.has(templateButton.miniAppId)) {
        logger.warn(
          {
            workspaceId: props.workspaceId,
            flowId: props.flowId,
            buttonId: flowButton.id,
            miniAppId: templateButton.miniAppId,
          },
          "Messenger template Mini App cannot be sent; the flow will not continue on submit",
        )
        return
      }
      const resumeToken = await signMiniAppResume({
        ...props,
        buttonId: flowButton.id,
        miniAppId: templateButton.miniAppId,
      })
      suffixByIndex.set(templateButton.index, encodeURIComponent(resumeToken))
    }),
  )
  if (suffixByIndex.size === 0) {
    return props.params
  }

  return {
    ...props.params,
    button: props.params.button.map((button, position) => {
      const suffix = suffixByIndex.get(button.index ?? position)
      return button.sub_type === "url" && suffix !== undefined
        ? { ...button, text: suffix }
        : button
    }),
  }
}
