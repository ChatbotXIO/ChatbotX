import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
  selfServeConnection,
} from "@chatbotx.io/sdk"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import type { WebchatActions, WebchatAuthValue } from "./schema"

const config: IntegrationDefinition<
  BaseConfig,
  WebchatAuthValue,
  WebchatActions
> = {
  name: "webchat",
  channels: {
    channel: {
      message: messageHandlers,
      conversation: conversationHandlers,
    },
  },
  actions: {},
  connection: selfServeConnection<WebchatAuthValue>({
    displayName: "Webchat",
    multiAccount: false,
    multiInstance: true,
    configFields: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Webchat display name.",
      },
      {
        name: "welcomeFlowId",
        type: "string",
        required: false,
        description: "Flow to trigger when a visitor opens the widget.",
      },
      {
        name: "authorizedDomains",
        type: "array",
        required: false,
        items: { type: "string" },
        description: "Domains allowed to embed this webchat widget.",
      },
      {
        name: "conversationStarters",
        type: "array",
        required: false,
        items: {
          type: "object",
          fields: [
            {
              name: "label",
              type: "string",
              required: true,
              description:
                "Text of the suggestion button shown to the visitor.",
            },
            {
              name: "type",
              type: "enum",
              required: true,
              enumValues: ["flow", "message", "url"],
              description:
                "Action to perform when the visitor taps the suggestion.",
            },
            {
              name: "flowId",
              type: "string",
              required: false,
              description: "Flow ID required when type is flow.",
            },
            {
              name: "url",
              type: "url",
              required: false,
              description: "Absolute URL required when type is url.",
            },
          ],
        },
        description: "Suggested opening messages shown to visitors.",
      },
      {
        name: "persistentMenus",
        type: "array",
        required: false,
        items: {
          type: "object",
          fields: [
            {
              name: "label",
              type: "string",
              required: true,
              description: "Menu item text shown in the widget.",
            },
            {
              name: "type",
              type: "enum",
              required: true,
              enumValues: ["flow", "url"],
              description:
                "Action to perform when the visitor selects the menu item.",
            },
            {
              name: "flowId",
              type: "string",
              required: false,
              description: "Flow ID required when type is flow.",
            },
            {
              name: "url",
              type: "url",
              required: false,
              description: "Absolute URL required when type is url.",
            },
          ],
        },
        description: "Quick-access menu items shown in the widget.",
      },
      {
        name: "brandColor",
        type: "string",
        required: false,
        description: "Widget accent color as a 6-digit hex code.",
      },
      {
        name: "hideHeader",
        type: "boolean",
        required: false,
        description: "Whether to hide the widget's header bar.",
      },
      {
        name: "showLogo",
        type: "boolean",
        required: false,
        description: "Whether to show the brand logo in the widget.",
      },
      {
        name: "hideMessageInput",
        type: "boolean",
        required: false,
        description: "Whether to hide the message input box.",
      },
      {
        name: "customCss",
        type: "string",
        required: false,
        description: "Custom CSS applied to the widget.",
      },
      {
        name: "enable",
        type: "boolean",
        required: false,
        description: "Whether the webchat widget is active.",
      },
    ],
  }),
  handleRequest(
    _props: HandleRequestProps<BaseConfig>,
  ): Promise<string | number | Oauth2AuthValue> {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: WebchatAuthValue): Promise<void> {
    // Webchat is a built-in channel with no external provider to disconnect;
    // removing the inbox row is the whole teardown, so this is a no-op.
    return Promise.resolve()
  },
}

export const integration = new Integration(config)
