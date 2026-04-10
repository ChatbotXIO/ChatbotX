import type { SendWaTemplateMessageStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import type {
  TemplateMessage,
  WhatsAppTemplateComponent,
  WhatsappAuthValue,
} from "../../../schema"

export function* convertFlowStepWaTemplate(
  props: Parameters<
    MessageHandlers<
      WhatsappAuthValue,
      SendWaTemplateMessageStepSchema
    >["sendFlowStep"]
  >[0],
): Generator<TemplateMessage> {
  const {
    data: { step },
  } = props
  const template = step.template

  const components = buildTemplateComponents(template.params)

  yield {
    _type: "template",
    type: "template",
    template: {
      name: template.name,
      language: { code: template.languageCode },
      components,
    },
  }
}

function buildTemplateComponents(
  params: SendWaTemplateMessageStepSchema["template"]["params"],
) {
  const components: WhatsAppTemplateComponent[] = []

  if (params.header && params.header.length > 0) {
    const headerParams = params.header.map((param) => {
      if (param.type === "text" && param.text) {
        return {
          type: "text",
          text: param.text,
        }
      }
      if (param.type === "image" && param.image?.link) {
        return {
          type: "image",
          image: {
            link: param.image.link,
          },
        }
      }
      if (param.type === "video" && param.video?.link) {
        return {
          type: "video",
          video: {
            link: param.video.link,
          },
        }
      }
      if (param.type === "document" && param.document?.link) {
        return {
          type: "document",
          document: {
            link: param.document.link,
          },
        }
      }
      return { type: "text", text: "" }
    })
    components.push({
      type: "header",
      parameters: headerParams,
    })
  }

  if (params.body && params.body.length > 0) {
    const bodyParams = params.body.map((param) => ({
      type: "text",
      text: param.text,
    }))
    components.push({
      type: "body",
      parameters: bodyParams,
    })
  }

  if (params.button && params.button.length > 0) {
    for (let i = 0; i < params.button.length; i++) {
      const param = params.button[i]
      components.push({
        type: "button",
        sub_type: "url",
        index: param.index ?? i,
        parameters: [
          {
            type: "text",
            text: param.text,
          },
        ],
      })
    }
  }

  return components
}
