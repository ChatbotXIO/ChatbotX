"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import {
  type FieldValues,
  useFieldArray,
  useFormContext,
} from "react-hook-form"
import type { ZodType } from "zod"
import { ItemEditorDialog } from "./item-editor-dialog"

/**
 * The collapsed list shared by buttons and quick replies: one compact row per
 * item, clicked to open `ItemEditorDialog`.
 *
 * Meta's caps (3 buttons, 13 quick replies, 3 buttons per generic element)
 * made the previous always-expanded layout unusably tall — a generic template
 * with a full quick-reply list rendered 43 open editors on one page. This
 * mirrors the flow builder, where a button is a row you click to edit.
 *
 * Add only appends; the new row is then clicked open like any other, so the
 * dialog never opens on its own.
 */
export function ItemListField<TItem extends FieldValues>({
  name,
  max,
  label,
  addLabel,
  limitMessage,
  inline = false,
  dialogTitle,
  schema,
  defaultItem,
  renderRow,
  children,
}: {
  name: string
  /** Meta's cap for this list — the Add button disables once reached. */
  max: number
  /** Optional section heading above the list. */
  label?: string
  /** Names what Add creates; defaults to a bare "Add". */
  addLabel?: string
  /** Shown once the cap is reached. */
  limitMessage?: string
  /**
   * Lays the rows out as wrapping chips sharing a line with Add, the way the
   * flow builder renders quick replies (`react-flow/nodes/editor.tsx`).
   * Buttons stay stacked, matching that same editor's button group.
   */
  inline?: boolean
  dialogTitle: string
  /** Validates one item inside the dialog. */
  schema: ZodType<FieldValues, FieldValues>
  /** Builds the appended row; the caller's `mm*DefaultFn` from `schema/content`. */
  defaultItem: () => TItem
  /** The row's own summary — a chip label inline, a title over its action stacked. */
  renderRow: (item: TItem) => ReactNode
  /** The dialog's fields, bound to root-level names. */
  children: ReactNode
}) {
  const t = useTranslations()
  const { control, getValues } = useFormContext()
  const { fields, append, remove, update } = useFieldArray({
    control,
    name,
    keyName: "_key",
  })

  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const closeDialog = () => setActiveIndex(null)

  const canAdd = fields.length < max

  const rows = fields.map((field, index) => (
    <button
      className={cn(
        "rounded-lg border text-start transition-colors hover:bg-accent",
        inline
          ? "max-w-full truncate px-4 py-2 font-medium text-sm"
          : "flex w-full flex-col items-start gap-0.5 px-3 py-2",
      )}
      data-testid="mm-item-row"
      key={field._key}
      onClick={() => setActiveIndex(index)}
      type="button"
    >
      {renderRow(field as unknown as TItem)}
    </button>
  ))

  const addButton = (
    <Button
      disabled={!canAdd}
      onClick={() => append(defaultItem())}
      size={inline ? "default" : "sm"}
      type="button"
      variant={inline ? "dashed" : "outline"}
    >
      <PlusIcon className="size-4" />
      {addLabel ?? t("actions.add")}
    </Button>
  )

  const limit = limitMessage ? (
    <p className="text-muted-foreground text-sm">{limitMessage}</p>
  ) : null

  return (
    <div className="flex flex-col gap-3">
      {label && <div className="font-medium text-sm">{label}</div>}

      {inline ? (
        // Chips and Add share one wrapping line; at the cap the message takes
        // the Add button's place rather than sitting under it.
        <div className="flex flex-wrap items-center gap-2">
          {rows}
          {canAdd ? addButton : limit}
        </div>
      ) : (
        <>
          {fields.length > 0 && (
            <div className="flex flex-col gap-2">{rows}</div>
          )}
          <div>{addButton}</div>
          {!canAdd && limit}
        </>
      )}

      {activeIndex !== null && (
        <ItemEditorDialog
          item={getValues(`${name}.${activeIndex}`)}
          key={activeIndex}
          onDelete={() => {
            remove(activeIndex)
            closeDialog()
          }}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog()
            }
          }}
          onSave={(values) => update(activeIndex, values)}
          open
          schema={schema}
          title={dialogTitle}
        >
          {children}
        </ItemEditorDialog>
      )}
    </div>
  )
}
