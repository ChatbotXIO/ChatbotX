"use client"

import {
  findScreen,
  type MiniAppValidationIssue,
  screenLabel,
} from "@chatbotx.io/mini-app"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useIssueMessage } from "../lib/use-issue-message"
import { useMiniAppEditor } from "./editor-context"

/** The validation issues count; clicking one selects its screen and component. */
export function IssuesButton({ issues }: { issues: MiniAppValidationIssue[] }) {
  const t = useTranslations("miniApps.editor")
  const message = useIssueMessage()
  const definition = useMiniAppEditor((state) => state.definition)
  const selectScreen = useMiniAppEditor((state) => state.selectScreen)
  const selectNode = useMiniAppEditor((state) => state.selectNode)
  const errors = issues.filter((issue) => issue.severity === "error").length

  if (issues.length === 0) {
    return (
      <Badge className="gap-1" variant="outline">
        <CheckCircle2Icon className="size-3.5 text-green-600" />
        {t("noIssues")}
      </Badge>
    )
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline">
            <AlertTriangleIcon
              className={cn(
                "size-4",
                errors > 0 ? "text-destructive" : "text-amber-500",
              )}
            />
            {t("issuesCount", { count: issues.length })}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        {/* A plain overflow box: ScrollArea's viewport is `h-full`, which a
            max-height alone cannot bound, so the list spilled out. */}
        <div className="max-h-80 overflow-y-auto">
          <div className="flex flex-col divide-y">
            {issues.map((issue, index) => {
              const screen = issue.screenKey
                ? findScreen(definition, issue.screenKey)
                : undefined
              return (
                <button
                  className="flex min-w-0 flex-col gap-0.5 px-3 py-2 text-start hover:bg-muted"
                  // biome-ignore lint/suspicious/noArrayIndexKey: issues have no id
                  key={index}
                  onClick={() => {
                    if (issue.screenKey) {
                      selectScreen(issue.screenKey)
                    }
                    if (issue.nodeId) {
                      selectNode(issue.nodeId)
                    }
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "break-words text-sm",
                      issue.severity === "error"
                        ? "text-destructive"
                        : "text-amber-600",
                    )}
                  >
                    {message(issue)}
                  </span>
                  {screen ? (
                    <span className="truncate text-muted-foreground text-xs">
                      {screenLabel(screen)}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
