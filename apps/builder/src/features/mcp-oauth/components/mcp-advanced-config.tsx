"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"
import type { McpConnectSnippets } from "../lib/connect-snippets"

type CopyableSnippetProps = {
  copyLabel: string
  label: string
  value: string
}

const CopyableSnippet = ({ copyLabel, label, value }: CopyableSnippetProps) => {
  const { handleCopy } = useClipboard()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-sm">{label}</p>
        <Button
          aria-label={`${copyLabel}: ${label}`}
          onClick={() => handleCopy(value)}
          size="icon"
          type="button"
          variant="outline"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <Textarea
        aria-label={label}
        className="resize-none font-mono text-sm"
        readOnly
        rows={value.includes("\n") ? 8 : 3}
        value={value}
      />
    </div>
  )
}

type McpAdvancedConfigProps = {
  snippets: McpConnectSnippets
  workspaceId: string
}

/** Raw endpoints and configs for any other MCP-compatible client. */
export const McpAdvancedConfig = ({
  snippets,
  workspaceId,
}: McpAdvancedConfigProps) => {
  const t = useTranslations("chatbotxMcp")
  const common = useTranslations()
  const copyLabel = common("actions.copy")

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("guide.otherIntro")}</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
        <CopyableSnippet
          copyLabel={copyLabel}
          label={t("streamableUrl")}
          value={snippets.streamableUrl}
        />
        <CopyableSnippet
          copyLabel={copyLabel}
          label={t("sseUrl")}
          value={snippets.sseUrl}
        />
        <CopyableSnippet
          copyLabel={copyLabel}
          label={t("clients.claudeDesktop")}
          value={snippets.claudeDesktop}
        />
        <div className="space-y-2">
          <CopyableSnippet
            copyLabel={copyLabel}
            label={t("clients.stdio")}
            value={snippets.stdio}
          />
          <p className="text-muted-foreground text-sm">
            {t("clients.stdioHint")}{" "}
            <Link
              className="underline underline-offset-4"
              href={`/space/${workspaceId}/settings/integrations/workspace-token`}
            >
              {common("workspaceToken.title")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
