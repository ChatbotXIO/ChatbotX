"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { parseJsonSafely } from "./json-path"
import { useJsonSourceContext } from "./json-source-context"
import { JsonTreeView } from "./json-tree-view"

type JsonSourcePanelProps = {
  onSelectPath: (path: string) => void
  activeTargetLabel: string | null
}

export const JsonSourcePanel = ({
  onSelectPath,
  activeTargetLabel,
}: JsonSourcePanelProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { pastedSample, setPastedSample, activeTab, setActiveTab, testResult } =
    useJsonSourceContext()

  const testResponseParsed = useMemo(
    () => (testResult ? parseJsonSafely(testResult.responseBody) : undefined),
    [testResult],
  )
  const pastedParsed = useMemo(
    () => (pastedSample ? parseJsonSafely(pastedSample) : undefined),
    [pastedSample],
  )

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center gap-1.5 text-left font-medium text-sm"
          type="button"
        >
          {open ? (
            <ChevronDownIcon size={16} />
          ) : (
            <ChevronRightIcon size={16} />
          )}
          {t("fields.jsonSource.title")}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="flex flex-col gap-2 pt-2">
        <div className="flex gap-1">
          <Button
            onClick={() => setActiveTab("testResponse")}
            size="sm"
            type="button"
            variant={activeTab === "testResponse" ? "secondary" : "ghost"}
          >
            {t("fields.jsonSource.tabs.testResponse")}
          </Button>
          <Button
            onClick={() => setActiveTab("pasteSample")}
            size="sm"
            type="button"
            variant={activeTab === "pasteSample" ? "secondary" : "ghost"}
          >
            {t("fields.jsonSource.tabs.pasteSample")}
          </Button>
        </div>

        {activeTargetLabel && (
          <p className="text-muted-foreground text-xs">
            {t("fields.jsonSource.activeTarget", { row: activeTargetLabel })}
          </p>
        )}

        {activeTab === "pasteSample" && (
          <Textarea
            className="font-mono text-xs"
            onChange={(event) => setPastedSample(event.target.value)}
            placeholder={t("fields.jsonSource.pastePlaceholder")}
            rows={4}
            value={pastedSample}
          />
        )}

        <div
          className={cn(
            "max-h-48 overflow-auto rounded-md border bg-muted/50 p-2",
          )}
        >
          {activeTab === "testResponse" && (
            <TreeOrMessage
              emptyMessage={t("fields.jsonSource.noTestResponse")}
              invalidMessage={t("fields.jsonSource.invalidJson")}
              onSelectPath={onSelectPath}
              parsed={testResponseParsed}
            />
          )}
          {activeTab === "pasteSample" && (
            <TreeOrMessage
              emptyMessage={t("fields.jsonSource.pastePlaceholder")}
              invalidMessage={t("fields.jsonSource.invalidJson")}
              onSelectPath={onSelectPath}
              parsed={pastedParsed}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

type TreeOrMessageProps = {
  parsed: ReturnType<typeof parseJsonSafely> | undefined
  emptyMessage: string
  invalidMessage: string
  onSelectPath: (path: string) => void
}

const TreeOrMessage = ({
  parsed,
  emptyMessage,
  invalidMessage,
  onSelectPath,
}: TreeOrMessageProps) => {
  if (!parsed) {
    return <p className="text-muted-foreground text-xs">{emptyMessage}</p>
  }
  if (!parsed.ok) {
    return <p className="text-destructive text-xs">{invalidMessage}</p>
  }
  return <JsonTreeView data={parsed.value} onSelectPath={onSelectPath} />
}
