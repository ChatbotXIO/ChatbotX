"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { PencilIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, type ReactNode, useState } from "react"

type InlineEditProps = {
  value: string
  canEdit: boolean
  label: string
  maxLength: number
  multiline?: boolean
  required?: boolean
  /** Renders the read-only view next to the Edit button. */
  children: ReactNode
  onSave: (next: string) => void
}

/** Read view + Edit button; the draft lives only while editing and writes on Save. */
export function InlineEdit({
  value,
  canEdit,
  label,
  maxLength,
  multiline,
  required,
  children,
  onSave,
}: InlineEditProps) {
  const t = useTranslations("actions")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const start = () => {
    setDraft(value)
    setEditing(true)
  }
  const save = () => {
    const next = draft.trim()
    if (required && !next) {
      return
    }
    if (next !== value) {
      onSave(next)
    }
    setEditing(false)
  }

  // Escape cancels the edit only; it must not also dismiss the drawer around it.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()
      setEditing(false)
      return
    }
    if (event.key === "Enter" && !multiline && !event.nativeEvent.isComposing) {
      save()
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        {canEdit ? (
          <Button onClick={start} size="sm" variant="outline">
            <PencilIcon />
            {t("edit")}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {multiline ? (
        <Textarea
          aria-label={label}
          autoFocus
          maxLength={maxLength}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          value={draft}
        />
      ) : (
        <Input
          aria-label={label}
          autoFocus
          maxLength={maxLength}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          value={draft}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={() => setEditing(false)} size="sm" variant="outline">
          {t("cancel")}
        </Button>
        <Button
          disabled={required ? draft.trim().length === 0 : false}
          onClick={save}
          size="sm"
        >
          {t("save")}
        </Button>
      </div>
    </div>
  )
}
