import type { McpConnectSnippets } from "./connect-snippets"

/** Deep links into each assistant's connector settings / a new chat. */
export const CLAUDE_CONNECTORS_URL =
  "https://claude.ai/new#customize/connectors/yours"
export const CLAUDE_NEW_CHAT_URL = "https://claude.ai/new"
export const CHATGPT_CONNECTORS_URL = "https://chatgpt.com/plugins"
export const CHATGPT_NEW_CHAT_URL = "https://chatgpt.com/"

export const MCP_GUIDED_CLIENT_IDS = [
  "claude",
  "chatgpt",
  "claudeCode",
  "cursor",
  "openclaw",
  "hermes",
] as const

export type McpGuidedClientId = (typeof MCP_GUIDED_CLIENT_IDS)[number]

export type McpGuideStepAction =
  | { kind: "copy"; value: string }
  | { kind: "link"; href: string; label: "addConnector" | "startChatting" }
  | { kind: "none" }

export type McpGuideStep = {
  action: McpGuideStepAction
  /** Translation keys, relative to the `chatbotxMcp` namespace. */
  bodyKey: string
  titleKey: string
}

type GuideStepKeys = { bodyKey: string; titleKey: string }

// Literal key map so every translation key stays greppable and type-checked.
const STEP_KEYS = {
  claude: [
    {
      titleKey: "guide.steps.claude.step1.title",
      bodyKey: "guide.steps.claude.step1.body",
    },
    {
      titleKey: "guide.steps.claude.step2.title",
      bodyKey: "guide.steps.claude.step2.body",
    },
    {
      titleKey: "guide.steps.claude.step3.title",
      bodyKey: "guide.steps.claude.step3.body",
    },
  ],
  chatgpt: [
    {
      titleKey: "guide.steps.chatgpt.step1.title",
      bodyKey: "guide.steps.chatgpt.step1.body",
    },
    {
      titleKey: "guide.steps.chatgpt.step2.title",
      bodyKey: "guide.steps.chatgpt.step2.body",
    },
    {
      titleKey: "guide.steps.chatgpt.step3.title",
      bodyKey: "guide.steps.chatgpt.step3.body",
    },
  ],
  claudeCode: [
    {
      titleKey: "guide.steps.claudeCode.step1.title",
      bodyKey: "guide.steps.claudeCode.step1.body",
    },
    {
      titleKey: "guide.steps.claudeCode.step2.title",
      bodyKey: "guide.steps.claudeCode.step2.body",
    },
    {
      titleKey: "guide.steps.claudeCode.step3.title",
      bodyKey: "guide.steps.claudeCode.step3.body",
    },
  ],
  cursor: [
    {
      titleKey: "guide.steps.cursor.step1.title",
      bodyKey: "guide.steps.cursor.step1.body",
    },
    {
      titleKey: "guide.steps.cursor.step2.title",
      bodyKey: "guide.steps.cursor.step2.body",
    },
    {
      titleKey: "guide.steps.cursor.step3.title",
      bodyKey: "guide.steps.cursor.step3.body",
    },
  ],
  openclaw: [
    {
      titleKey: "guide.steps.openclaw.step1.title",
      bodyKey: "guide.steps.openclaw.step1.body",
    },
    {
      titleKey: "guide.steps.openclaw.step2.title",
      bodyKey: "guide.steps.openclaw.step2.body",
    },
    {
      titleKey: "guide.steps.openclaw.step3.title",
      bodyKey: "guide.steps.openclaw.step3.body",
    },
  ],
  hermes: [
    {
      titleKey: "guide.steps.hermes.step1.title",
      bodyKey: "guide.steps.hermes.step1.body",
    },
    {
      titleKey: "guide.steps.hermes.step2.title",
      bodyKey: "guide.steps.hermes.step2.body",
    },
    {
      titleKey: "guide.steps.hermes.step3.title",
      bodyKey: "guide.steps.hermes.step3.body",
    },
  ],
} as const satisfies Record<
  McpGuidedClientId,
  readonly [GuideStepKeys, GuideStepKeys, GuideStepKeys]
>

const NO_ACTION: McpGuideStepAction = { kind: "none" }

const actionsFor = (
  id: McpGuidedClientId,
  snippets: McpConnectSnippets,
): readonly [McpGuideStepAction, McpGuideStepAction, McpGuideStepAction] => {
  switch (id) {
    case "claude":
      return [
        { kind: "copy", value: snippets.claudeAi },
        { kind: "link", href: CLAUDE_CONNECTORS_URL, label: "addConnector" },
        { kind: "link", href: CLAUDE_NEW_CHAT_URL, label: "startChatting" },
      ]
    case "chatgpt":
      return [
        { kind: "copy", value: snippets.chatgpt },
        { kind: "link", href: CHATGPT_CONNECTORS_URL, label: "addConnector" },
        { kind: "link", href: CHATGPT_NEW_CHAT_URL, label: "startChatting" },
      ]
    case "claudeCode":
      return [
        { kind: "copy", value: snippets.claudeCode },
        { kind: "copy", value: "/mcp" },
        NO_ACTION,
      ]
    case "cursor":
      return [{ kind: "copy", value: snippets.cursor }, NO_ACTION, NO_ACTION]
    case "openclaw":
      return [
        { kind: "copy", value: snippets.openclawInstall },
        { kind: "copy", value: snippets.openclawLogin },
        NO_ACTION,
      ]
    case "hermes":
      return [
        { kind: "copy", value: snippets.hermes },
        { kind: "copy", value: "/reload-mcp" },
        NO_ACTION,
      ]
    default:
      return [NO_ACTION, NO_ACTION, NO_ACTION]
  }
}

/** Three numbered setup steps per client: get the URL, add it, approve & use. */
const stepsFor = (
  id: McpGuidedClientId,
  snippets: McpConnectSnippets,
): readonly McpGuideStep[] => {
  const actions = actionsFor(id, snippets)
  return STEP_KEYS[id].map((keys, index) => ({
    ...keys,
    action: actions[index] ?? NO_ACTION,
  }))
}

export const buildMcpClientGuides = (
  snippets: McpConnectSnippets,
): Record<McpGuidedClientId, readonly McpGuideStep[]> => ({
  claude: stepsFor("claude", snippets),
  chatgpt: stepsFor("chatgpt", snippets),
  claudeCode: stepsFor("claudeCode", snippets),
  cursor: stepsFor("cursor", snippets),
  openclaw: stepsFor("openclaw", snippets),
  hermes: stepsFor("hermes", snippets),
})
