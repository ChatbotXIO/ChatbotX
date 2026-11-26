"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import {
  BlocksIcon,
  BotIcon,
  MousePointer2Icon,
  PlugIcon,
  TerminalIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import { ClaudeIcon } from "@/icons/claude"
import { OpenAIIcon } from "@/icons/openai"
import {
  buildMcpClientGuides,
  MCP_GUIDED_CLIENT_IDS,
  type McpGuidedClientId,
} from "../lib/connect-clients"
import { buildMcpConnectSnippets } from "../lib/connect-snippets"
import { McpAdvancedConfig } from "./mcp-advanced-config"
import { McpGuideStepCard } from "./mcp-guide-step-card"

type McpConnectGuideProps = {
  builderUrl: string
  mcpUrl: string
  workspaceId: string
}

type McpClientTab = McpGuidedClientId | "other"

const OTHER_TAB = "other" satisfies McpClientTab

const CLIENT_LABEL_KEYS = {
  claude: "clients.claude",
  chatgpt: "clients.chatgpt",
  claudeCode: "clients.claudeCode",
  cursor: "clients.cursor",
  openclaw: "clients.openclaw",
  hermes: "clients.hermes",
  other: "clients.other",
} as const satisfies Record<McpClientTab, string>

const CLIENT_ICONS: Record<McpClientTab, ReactNode> = {
  claude: <ClaudeIcon className="size-4" />,
  chatgpt: <OpenAIIcon className="size-4" fill="currentColor" />,
  claudeCode: <TerminalIcon aria-hidden="true" className="size-4" />,
  cursor: <MousePointer2Icon aria-hidden="true" className="size-4" />,
  openclaw: <PlugIcon aria-hidden="true" className="size-4" />,
  hermes: <BotIcon aria-hidden="true" className="size-4" />,
  other: <BlocksIcon aria-hidden="true" className="size-4" />,
}

const TAB_ORDER: readonly McpClientTab[] = [...MCP_GUIDED_CLIENT_IDS, OTHER_TAB]

const TRIGGER_CLASS =
  "h-10 gap-2 rounded-full border-0 bg-muted px-4 py-0 font-medium text-muted-foreground transition-colors hover:text-foreground data-active:bg-foreground data-active:font-medium data-active:text-background dark:data-active:text-background"

export const McpConnectGuide = ({
  builderUrl,
  mcpUrl,
  workspaceId,
}: McpConnectGuideProps) => {
  const t = useTranslations("chatbotxMcp")
  const [activeTab, setActiveTab] = useState<McpClientTab>("claude")
  const snippets = buildMcpConnectSnippets({ builderUrl, mcpUrl })
  const guides = buildMcpClientGuides(snippets)

  return (
    <section
      aria-labelledby="mcp-connect-guide-title"
      className="min-w-0 space-y-5 rounded-2xl border p-4 md:p-6"
    >
      <div className="space-y-1">
        <h2 className="font-semibold text-lg" id="mcp-connect-guide-title">
          {t("guide.title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("guide.subtitle")}</p>
      </div>

      <Tabs
        className="min-w-0 gap-5"
        onValueChange={(value) => setActiveTab(value as McpClientTab)}
        value={activeTab}
      >
        <TabsList className="w-full min-w-0 overflow-x-auto rounded-none border-0 bg-transparent px-0 pb-1 shadow-none [&>div]:gap-2">
          {TAB_ORDER.map((id) => (
            <TabsTrigger className={TRIGGER_CLASS} key={id} value={id}>
              {CLIENT_ICONS[id]}
              {t(CLIENT_LABEL_KEYS[id])}
            </TabsTrigger>
          ))}
        </TabsList>

        {MCP_GUIDED_CLIENT_IDS.map((id) => (
          <TabsContent className="min-w-0" key={id} value={id}>
            <ol className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
              {guides[id].map((step, index) => (
                <McpGuideStepCard
                  key={step.titleKey}
                  number={index + 1}
                  step={step}
                />
              ))}
            </ol>
          </TabsContent>
        ))}

        <TabsContent className="min-w-0" value={OTHER_TAB}>
          <McpAdvancedConfig snippets={snippets} workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>

      <div className="space-y-1 text-center text-muted-foreground text-sm">
        {activeTab === OTHER_TAB ? null : (
          <p>
            <button
              className="underline-offset-4 hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
              onClick={() => setActiveTab(OTHER_TAB)}
              type="button"
            >
              {t("guide.otherClients")}
            </button>
          </p>
        )}
        <p>{t("guide.ownerOnly")}</p>
      </div>
    </section>
  )
}
