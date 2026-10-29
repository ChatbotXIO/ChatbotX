"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"
import { buildMcpConnectSnippets } from "../lib/connect-snippets"

type McpConnectGuideProps = {
  builderUrl: string
  mcpUrl: string
  workspaceId: string
}

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

export const McpConnectGuide = ({
  builderUrl,
  mcpUrl,
  workspaceId,
}: McpConnectGuideProps) => {
  const t = useTranslations("chatbotxMcp")
  const common = useTranslations()
  const snippets = buildMcpConnectSnippets({ builderUrl, mcpUrl, workspaceId })

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">{t("guide.title")}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground text-sm">
          <li>{t("guide.step1")}</li>
          <li>{t("guide.step2")}</li>
          <li>{t("guide.step3")}</li>
          <li>{t("guide.step4")}</li>
        </ol>
        <p className="text-muted-foreground text-sm">{t("guide.ownerOnly")}</p>
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-muted-foreground">{t("workspaceId")}</dt>
          <dd>
            <Badge variant="secondary">{workspaceId}</Badge>
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{t("streamableUrl")}</dt>
          <dd className="break-all font-mono text-xs">
            {snippets.streamableUrl}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{t("sseUrl")}</dt>
          <dd className="break-all font-mono text-xs">{snippets.sseUrl}</dd>
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <CopyableSnippet
          copyLabel={common("actions.copy")}
          label={t("clients.claudeCode")}
          value={snippets.claudeCode}
        />
        <CopyableSnippet
          copyLabel={common("actions.copy")}
          label={t("clients.claudeDesktop")}
          value={snippets.claudeDesktop}
        />
        <CopyableSnippet
          copyLabel={common("actions.copy")}
          label={t("clients.cursor")}
          value={snippets.cursor}
        />
        <CopyableSnippet
          copyLabel={common("actions.copy")}
          label={t("clients.chatgpt")}
          value={snippets.chatgpt}
        />
        <div className="space-y-2 lg:col-span-2">
          <CopyableSnippet
            copyLabel={common("actions.copy")}
            label={t("clients.stdio")}
            value={snippets.stdio}
          />
          <p className="text-muted-foreground text-sm">
            {t("clients.stdioHint")}{" "}
            <Link
              className="underline underline-offset-4"
              href={`/space/${workspaceId}/settings/integrations/workspace-token`}
            >
              {t("clients.stdio")}
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
