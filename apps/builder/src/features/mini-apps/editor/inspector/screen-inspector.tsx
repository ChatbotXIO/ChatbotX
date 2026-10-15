"use client"

import {
  MINI_APP_SCREEN_TITLE_MAX_LENGTH,
  type MiniAppValidationIssue,
} from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { MonitorSmartphoneIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId } from "react"
import { useMiniAppEditor, useSelectedScreen } from "../editor-context"
import { DisplayTextCounter, InspectorHint, IssueList } from "./field-row"
import { VariableTextEditor } from "./variable-text-editor"

const SCREEN_ID_SANITIZE = /[^A-Za-z_]/g

export function ScreenInspector({
  issues,
}: {
  issues: MiniAppValidationIssue[]
}) {
  const t = useTranslations("miniApps.screen")
  const idInput = useId()
  const screen = useSelectedScreen()
  const screenCount = useMiniAppEditor(
    (state) => state.definition.screens.length,
  )
  const updateScreen = useMiniAppEditor((state) => state.updateScreen)
  const removeScreen = useMiniAppEditor((state) => state.removeScreen)
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
      <IssueList issues={screenIssues} />
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
        <InspectorHint>{t("screenIdHint")}</InspectorHint>
      </div>
      <Separator />
      <Button
        disabled={screenCount <= 1}
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
