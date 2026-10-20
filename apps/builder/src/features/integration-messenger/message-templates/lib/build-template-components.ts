import { normalizeMessengerTokenUrl } from "@chatbotx.io/flow-config"
import { buildMiniAppPublicUrl } from "@/features/mini-apps/lib/public-url"
import {
  type CreateMessengerMessageTemplateRequest,
  TOKEN_URL_SUFFIX_EXAMPLE,
} from "../schema/mutation"

type TemplateVariable = {
  key: string
  example: string
}

type TemplateButton = CreateMessengerMessageTemplateRequest["buttons"][number]

export type MessengerTemplateComponent =
  | {
      type: "HEADER"
      format: "TEXT"
      text: string
      example?: { header_text: string[] }
    }
  | {
      type: "HEADER"
      format: "IMAGE"
      text: string
      example: { header_text?: string[]; header_handle: string[] }
    }
  | {
      type: "BODY"
      text: string
      example?: { body_text: string[][] }
    }
  | {
      type: "BUTTONS"
      buttons: MessengerTemplateButtonComponent[]
    }

export type MessengerTemplateButtonComponent =
  | {
      type: "URL"
      text: string
      url: string
      example?: {
        url_suffix_example: string
      }
    }
  | {
      type: "PHONE_NUMBER"
      text: string
      phone_number: string
    }
  | {
      type: "POSTBACK"
      text: string
      payload: "{{1}}"
    }

function buildHeaderTextExample(variables: TemplateVariable[]) {
  return variables.map((variable) => variable.example)
}

function buildHeaderTextExampleParam(variables: TemplateVariable[]):
  | {
      header_text: string[]
    }
  | undefined {
  const headerText = buildHeaderTextExample(variables)
  return headerText.length > 0 ? { header_text: headerText } : undefined
}

function buildBodyExampleParam(variables: TemplateVariable[]):
  | {
      body_text: string[][]
    }
  | undefined {
  const bodyText = variables.map((variable) => variable.example)
  return bodyText.length > 0 ? { body_text: [bodyText] } : undefined
}

function buildUrlSuffixExample(url: string, variables: string[]) {
  return variables.reduce(
    (result, variable, index) =>
      result.replaceAll(`{{${index + 1}}}`, variable),
    url,
  )
}

/**
 * A Mini App button is a URL button to the Mini App's public link, saved the
 * same way as a pasted one: its `{{mini_app_token}}` suffix becomes `{{1}}`,
 * which the recipient's token fills at send time.
 */
function buildMiniAppButton(
  button: Extract<TemplateButton, { type: "MINI_APP" }>,
): MessengerTemplateButtonComponent {
  const tokenUrl = normalizeMessengerTokenUrl(
    buildMiniAppPublicUrl(button.miniAppId),
  )
  if (!tokenUrl) {
    throw new Error("A Mini App link must end in its token variable")
  }
  return {
    type: "URL",
    text: button.title,
    url: tokenUrl.url,
    example: {
      url_suffix_example: buildUrlSuffixExample(tokenUrl.url, [
        TOKEN_URL_SUFFIX_EXAMPLE,
      ]),
    },
  }
}

function buildButton(button: TemplateButton): MessengerTemplateButtonComponent {
  if (button.type === "MINI_APP") {
    return buildMiniAppButton(button)
  }

  if (button.type === "URL") {
    return {
      type: "URL",
      text: button.title,
      url: button.url,
      ...(button.variables.length > 0
        ? {
            example: {
              url_suffix_example: buildUrlSuffixExample(
                button.url,
                button.variables,
              ),
            },
          }
        : {}),
    }
  }

  if (button.type === "PHONE_NUMBER") {
    return {
      type: "PHONE_NUMBER",
      text: button.title,
      phone_number: button.phoneNumber,
    }
  }

  return {
    type: "POSTBACK",
    text: button.title,
    payload: "{{1}}",
  }
}

export function buildMessengerMessageTemplateComponents(
  input: CreateMessengerMessageTemplateRequest,
  headerHandle?: string,
): MessengerTemplateComponent[] {
  const components: MessengerTemplateComponent[] = []

  if (input.headerType === "text") {
    const headerTextExample = buildHeaderTextExample(input.headerVariables)
    const headerComponent: MessengerTemplateComponent = {
      type: "HEADER",
      format: "TEXT",
      text: input.headerText,
      ...(headerTextExample.length > 0
        ? { example: { header_text: headerTextExample } }
        : {}),
    }
    components.push(headerComponent)
  }

  if (input.headerType === "text_and_image") {
    components.push({
      type: "HEADER",
      format: "IMAGE",
      text: input.headerText,
      example: {
        ...(buildHeaderTextExampleParam(input.headerVariables) ?? {}),
        header_handle: headerHandle ? [headerHandle] : [],
      },
    })
  }

  const bodyExample = buildBodyExampleParam(input.bodyVariables)
  components.push({
    type: "BODY",
    text: input.body,
    ...(bodyExample ? { example: bodyExample } : {}),
  })

  if (input.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map(buildButton),
    })
  }

  return components
}
