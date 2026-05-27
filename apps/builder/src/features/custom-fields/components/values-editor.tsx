"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, useState } from "react"

type ValuesEditorProps = {
  value: string[]
  onChange: (next: string[]) => void
  label?: string
  placeholder?: string
}

/**
 * Editor de opções pré-definidas pro custom field tipo "list".
 * Input + chips removíveis. Enter ou clique no + adiciona.
 */
export function ValuesEditor({
  value,
  onChange,
  label,
  placeholder,
}: ValuesEditorProps) {
  const t = useTranslations()
  const [draft, setDraft] = useState("")

  const handleAdd = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }
    if (value.includes(trimmed)) {
      setDraft("")
      return
    }
    onChange([...value, trimmed])
    setDraft("")
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  const handleRemove = (item: string) => {
    onChange(value.filter((v) => v !== item))
  }

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm">{label}</Label>}
      <div className="flex gap-2">
        <Input
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t("customFields.valuesPlaceholder")}
          value={draft}
        />
        <Button
          disabled={!draft.trim()}
          onClick={handleAdd}
          size="icon"
          type="button"
          variant="outline"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <Badge
              className="gap-1 py-0.5 pr-1 pl-2.5 text-xs"
              key={item}
              variant="secondary"
            >
              <span>{item}</span>
              <button
                aria-label={t("actions.remove")}
                className="rounded-sm p-0.5 hover:bg-white/10"
                onClick={() => handleRemove(item)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
