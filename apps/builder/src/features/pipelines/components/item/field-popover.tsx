"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { CheckIcon, PencilIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useId, useState } from "react"

type EditablePopoverProps<T> = {
  label: string
  /** Current server value; the draft re-seeds from it each time the popover opens. */
  value: T
  display: ReactNode
  canEdit: boolean
  disabled?: boolean
  canSave?: (draft: T) => boolean
  onSave: (draft: T) => void
  /** `labelId` is the id of the popover heading, for `aria-labelledby`. */
  children: (
    draft: T,
    setDraft: (next: T) => void,
    labelId: string,
  ) => ReactNode
}

/** A value that opens a small editor with Cancel / Save; only Save writes. */
export function EditablePopover<T>({
  label,
  value,
  display,
  canEdit,
  disabled,
  canSave,
  onSave,
  children,
}: EditablePopoverProps<T>) {
  const t = useTranslations("actions")
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<T>(value)
  const labelId = useId()

  if (!canEdit) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 break-words px-2">
        {display}
      </span>
    )
  }

  const saveAllowed = !disabled && (canSave ? canSave(draft) : true)

  return (
    <Popover
      onOpenChange={(next) => {
        if (next) {
          setDraft(value)
        }
        setOpen(next)
      }}
      open={open}
    >
      <PopoverTrigger
        aria-label={label}
        className="group/edit flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        disabled={disabled}
      >
        <span className="flex min-w-0 items-center gap-1.5 break-words">
          {display}
        </span>
        <PencilIcon
          aria-hidden
          className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        <p className="font-medium text-xs" id={labelId}>
          {label}
        </p>
        {children(draft, setDraft, labelId)}
        <div className="flex justify-end gap-2">
          <Button onClick={() => setOpen(false)} size="sm" variant="outline">
            {t("cancel")}
          </Button>
          <Button
            disabled={!saveAllowed}
            onClick={() => {
              onSave(draft)
              setOpen(false)
            }}
            size="sm"
          >
            {t("save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export type OptionListItem<V extends string> = {
  value: V
  label: string
  leading?: ReactNode
}

/** Single-choice list used inside popovers (status, priority, stage). */
export function OptionList<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: OptionListItem<V>[]
  value: V
  onChange: (next: V) => void
  label: string
}) {
  return (
    <fieldset className="grid max-h-56 gap-0.5 overflow-y-auto">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted has-checked:bg-muted has-focus-visible:outline-2 has-focus-visible:outline-ring"
          key={option.value}
        >
          <input
            checked={option.value === value}
            className="sr-only"
            name={label}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          {option.leading}
          <span className="flex-1 truncate">{option.label}</span>
          {option.value === value ? <CheckIcon className="size-4" /> : null}
        </label>
      ))}
    </fieldset>
  )
}
