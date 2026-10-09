"use client"

import {
  MINI_APP_SCREEN_TITLE_MAX_LENGTH,
  type MiniAppValidationIssue,
} from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { MonitorSmartphoneIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId } from "react"
import { useIssueMessage } from "../../lib/use-issue-message"
import { useMiniAppEditor } from "../editor-context"
import { DisplayTextCounter } from "./fields"
import { VariableTextEditor } from "./variable-text-editor"

const SCREEN_ID_SANITIZE = /[^A-Za-z_]/g

export function ScreenInspector({
  issues,
}: {
  issues: MiniAppValidationIssue[]
}) {
  const t = useTranslations("miniApps.screen")
  const message = useIssueMessage()
  const idInput = useId()
  const terminalInput = useId()
  const definition = useMiniAppEditor((state) => state.definition)
  const selectedScreenKey = useMiniAppEditor((state) => state.selectedScreenKey)
  const updateScreen = useMiniAppEditor((state) => state.updateScreen)
  const removeScreen = useMiniAppEditor((state) => state.removeScreen)
  const screen = definition.screens.find(
    (candidate) => candidate.key === selectedScreenKey,
  )
  if (!screen) {
    return null
  }
  const screenIssues = issues.filter(
    (issue) => issue.screenKey === screen.key && !issue.nodeId,
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <MonitorSmartphoneIcon className="size-4 text-muted-foreground" />
        <span className="font-semibold">{t("title")}</span>
      </div>
      {screenIssues.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
          {screenIssues.map((issue, index) => (
            <span
              className={
                issue.severity === "warning"
                  ? "text-amber-600 text-xs"
                  : "text-destructive text-xs"
              }
              // biome-ignore lint/suspicious/noArrayIndexKey: issues have no id
              key={index}
            >
              {message(issue)}
            </span>
          ))}
        </div>
      ) : null}
      <Separator />
      <div className="flex flex-col gap-1.5">
        <Label>{t("screenTitle")}</Label>
        <VariableTextEditor
          onChange={(title) => updateScreen(screen.key, { title })}
          value={screen.title}
        />
        <DisplayTextCounter
          maxLength={MINI_APP_SCREEN_TITLE_MAX_LENGTH}
          value={screen.title}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idInput}>{t("screenId")}</Label>
        <Input
          className="font-mono text-xs"
          id={idInput}
          onChange={(event) =>
            updateScreen(screen.key, {
              id: event.target.value
                .toUpperCase()
                .replace(SCREEN_ID_SANITIZE, "_"),
            })
          }
          value={screen.id}
        />
        <span className="text-muted-foreground text-xs">
          {t("screenIdHint")}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <Label htmlFor={terminalInput}>{t("terminal")}</Label>
          <span className="text-muted-foreground text-xs">
            {t("terminalHint")}
          </span>
        </div>
        <Switch
          checked={screen.terminal}
          id={terminalInput}
          onCheckedChange={(checked) =>
            updateScreen(screen.key, { terminal: checked })
          }
        />
      </div>
      <Separator />
      <Button
        disabled={definition.screens.length <= 1}
        onClick={() => removeScreen(screen.key)}
        size="sm"
        variant="outline"
      >
        <Trash2Icon className="size-4" />
        {t("remove")}
      </Button>
    </div>
  )
}
