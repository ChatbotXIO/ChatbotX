"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { FB_COMMENT_REPLY_MAX_TEXTS } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { FormLabel } from "@chatbotx.io/ui/components/ui/form"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type Props = {
  /** Form path of the reply object, e.g. `publicReply`. */
  name: string
  label: string
  placeholder: string
  channel: ChannelType
}

/**
 * The message list of a `text` public reply. Every entry is posted as its own
 * comment reply, so the order here is the order they appear under the comment.
 *
 * Capped at {@link FB_COMMENT_REPLY_MAX_TEXTS}; the add button disappears at
 * the ceiling rather than failing on submit.
 */
export function ReplyTextsField({ name, label, placeholder, channel }: Props) {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${name}.values`,
  })

  const handleAdd = useCallback(() => {
    append({ value: "" })
  }, [append])

  // Always at least one editor. Reached by an automation saved with a
  // different reply type — it has no `values` at all, so switching to `text`
  // would otherwise show a bare "add" button and nothing to type in.
  useEffect(() => {
    if (fields.length === 0) {
      append({ value: "" })
    }
  }, [fields.length, append])

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>

      {fields.map((field, index) => (
        // Keyed by `field.id`, NOT by index. `TiptapEditorField` snapshots its
        // initial content in a `useEffect` keyed on the form path, and removing
        // an entry shifts the ones after it WITHOUT changing the path at a
        // given position — so an index key leaves the editor showing the
        // removed entry's text. The id forces a remount instead.
        <div className="flex items-start gap-2" key={field.id}>
          <div className="flex-1">
            <TiptapEditorField
              channels={[channel]}
              includeBotFieldVariables
              name={`${name}.values.${index}.value`}
              placeholder={placeholder}
            />
          </div>

          {fields.length > 1 && (
            <Button
              aria-label={t("actions.delete")}
              onClick={() => remove(index)}
              type="button"
              variant="outline"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}

      {fields.length < FB_COMMENT_REPLY_MAX_TEXTS && (
        <Button onClick={handleAdd} size="sm" type="button" variant="outline">
          <PlusIcon className="h-4 w-4" />
          {/* A dedicated key, not `addFeature` with the label interpolated:
              that needed `label.toLowerCase()` on an already-translated noun,
              which is wrong in several of the 20 shipped locales — German
              capitalises every noun, and a locale-less toLowerCase maps Turkish
              "I" to "i" instead of "ı". */}
          {t("actions.addTextReply")}
        </Button>
      )}
    </div>
  )
}
