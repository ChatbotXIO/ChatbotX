"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useEffect, useRef, useState } from "react"
import { PlainTextTiptapEditor } from "@/components/tiptap/plain-text-tiptap-editor"

/**
 * Text field with the shared `{{custom field}}` picker (type `{{` or use the
 * `</>` button). The TipTap editor reloads its content whenever `initValue`
 * changes — and that reload drops a trailing space — so it is fed a frozen
 * initial value, refreshed (with a remount) only when the value changes from
 * outside (undo, reordered options), never while the user types.
 */
export function VariableTextEditor({
  value,
  onChange,
  multiline = false,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  placeholder?: string
  className?: string
}) {
  const lastEmitted = useRef(value)
  const [initial, setInitial] = useState({ value, version: 0 })

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setInitial((current) => ({ value, version: current.version + 1 }))
    }
  }, [value])

  return (
    <div className="min-w-0 flex-1">
      <PlainTextTiptapEditor
        className={cn(multiline ? "min-h-20" : undefined, className)}
        disableLineBreaks={!multiline}
        initValue={initial.value}
        inline={!multiline}
        key={initial.version}
        onChange={(next) => {
          if (next === lastEmitted.current) {
            return
          }
          lastEmitted.current = next
          onChange(next)
        }}
        placeholder={placeholder ?? ""}
        plainText
        showEmojiPicker={multiline}
      />
    </div>
  )
}
