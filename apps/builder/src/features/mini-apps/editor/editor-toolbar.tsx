"use client"

import {
  MINI_APP_NAME_MAX_LENGTH,
  type MiniAppValidationIssue,
} from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  BracesIcon,
  EyeIcon,
  Loader2Icon,
  Redo2Icon,
  SaveIcon,
  Undo2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMiniAppEditor } from "./editor-context"
import { IssuesButton } from "./issues-button"

/** The name field, undo/redo, the issues, preview, Flow JSON and save buttons. */
export function EditorToolbar({
  issues,
  nameError,
  isSaving,
  onSave,
  onPreview,
  onViewJson,
}: {
  issues: MiniAppValidationIssue[]
  nameError?: string
  isSaving: boolean
  onSave: () => void
  onPreview: () => void
  onViewJson: () => void
}) {
  const t = useTranslations()
  const name = useMiniAppEditor((state) => state.name)
  const setName = useMiniAppEditor((state) => state.setName)
  const canUndo = useMiniAppEditor((state) => state.past.length > 0)
  const canRedo = useMiniAppEditor((state) => state.future.length > 0)
  const undo = useMiniAppEditor((state) => state.undo)
  const redo = useMiniAppEditor((state) => state.redo)
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <div className="flex min-w-60 flex-col">
        <Input
          aria-invalid={nameError ? true : undefined}
          aria-label={t("fields.name.label")}
          className="h-8 font-semibold"
          maxLength={MINI_APP_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("miniApps.editor.namePlaceholder")}
          value={name}
        />
        {nameError ? (
          <span className="text-destructive text-xs">{nameError}</span>
        ) : null}
      </div>
      <div className="flex items-center">
        <Button
          aria-label={t("miniApps.editor.undo")}
          disabled={!canUndo}
          onClick={undo}
          size="icon"
          variant="ghost"
        >
          <Undo2Icon className="size-4" />
        </Button>
        <Button
          aria-label={t("miniApps.editor.redo")}
          disabled={!canRedo}
          onClick={redo}
          size="icon"
          variant="ghost"
        >
          <Redo2Icon className="size-4" />
        </Button>
      </div>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        <IssuesButton issues={issues} />
        <Button onClick={onPreview} size="sm" variant="outline">
          <EyeIcon className="size-4" />
          {t("miniApps.editor.preview")}
        </Button>
        <Button onClick={onViewJson} size="sm" variant="outline">
          <BracesIcon className="size-4" />
          {t("miniApps.editor.viewJson")}
        </Button>
        <Button disabled={isSaving || !name.trim()} onClick={onSave} size="sm">
          {isSaving ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SaveIcon className="size-4" />
          )}
          {t("actions.save")}
        </Button>
      </div>
    </div>
  )
}
