"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { createMcpTokenAction } from "../actions/create-mcp-token-action"

const TRAILING_SLASH = /\/$/

interface ConnectAgentCardProps {
  /** Hosted MCP origin; `null` hides the hosted snippets (self-hosted without one). */
  mcpServerUrl: string | null
  workspaceId: string
}

interface Snippet {
  code: string
  label: string
}

function buildSnippets(params: {
  token: string
  mcpServerUrl: string | null
  labels: { claudeCode: string; mcpJson: string; cli: string }
}): Snippet[] {
  const { token, mcpServerUrl, labels } = params
  const cli: Snippet = {
    label: labels.cli,
    code: `CHATBOTX_API_KEY=${token} chatbotx contacts list`,
  }
  if (!mcpServerUrl) {
    return [cli]
  }
  const url = `${mcpServerUrl.replace(TRAILING_SLASH, "")}/sse?workspace_token=${token}`
  return [
    {
      label: labels.claudeCode,
      code: `claude mcp add chatbotx -t sse "${url}"`,
    },
    {
      label: labels.mcpJson,
      code: JSON.stringify({ mcpServers: { chatbotx: { url } } }, null, 2),
    },
    cli,
  ]
}

export function ConnectAgentCard({
  workspaceId,
  mcpServerUrl,
}: ConnectAgentCardProps) {
  const t = useTranslations("workspaces.connectAgent")
  const { handleCopy } = useClipboard()
  const boundCreate = useMemo(
    () => createMcpTokenAction.bind(null, workspaceId),
    [workspaceId],
  )
  const { execute, result, isPending } = useAction(boundCreate, {
    onError: () => toast.error(t("error")),
  })

  const token = result.data?.token ?? null
  const snippets = token
    ? buildSnippets({
        token,
        mcpServerUrl,
        labels: {
          claudeCode: t("claudeCode"),
          mcpJson: t("mcpJson"),
          cli: t("cli"),
        },
      })
    : []

  return (
    <section
      aria-labelledby="connect-agent-heading"
      className="space-y-3 rounded-lg border p-4"
    >
      <div>
        <h2 className="font-semibold" id="connect-agent-heading">
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {token ? (
        <div className="space-y-3">
          {snippets.map((snippet) => (
            <div className="space-y-1" key={snippet.label}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{snippet.label}</span>
                <Button
                  aria-label={t("copy")}
                  onClick={() => handleCopy(snippet.code)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </div>
              <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                {snippet.code}
              </pre>
            </div>
          ))}
          <p className="text-muted-foreground text-xs">{t("revokeHint")}</p>
        </div>
      ) : (
        <Button disabled={isPending} onClick={() => execute()} type="button">
          {isPending ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              {t("generating")}
            </>
          ) : (
            t("generate")
          )}
        </Button>
      )}
    </section>
  )
}
