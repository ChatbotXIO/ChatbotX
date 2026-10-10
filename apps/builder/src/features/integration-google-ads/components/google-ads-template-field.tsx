"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { useFormOptionalLabel } from "@chatbotx.io/ui/components/form/optional-label-context"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { type ControllerRenderProps, useFormContext } from "react-hook-form"
import { PlainTextTiptapEditor } from "@/components/tiptap/plain-text-tiptap-editor"
import { GoogleAdsInfoPopover } from "./google-ads-info-popover"
import { TranslatedFieldMessage } from "./translated-field-message"

type GoogleAdsTemplateFieldProps = {
  name: string
  label: string
  description?: string
  placeholder?: string
  required?: boolean
  channels?: ChannelType[]
  formItemClassName?: string
  /** Longer guidance behind a small info button next to the label. */
  info?: { label: string; content: ReactNode }
  /** Leave the "(optional)" suffix off the label (the caller says it elsewhere). */
  hideOptionalMarker?: boolean
  /**
   * Show a validation error only once the field was touched, edited or the
   * form submitted. The flow editor validates every step on open, so without
   * this a required field would be red before the admin did anything.
   */
  deferError?: boolean
}

type SyncedValue = { text: string; version: number }

const toText = (value: unknown) => (typeof value === "string" ? value : "")

type TemplateFieldBodyProps = Omit<
  GoogleAdsTemplateFieldProps,
  "name" | "formItemClassName"
> & { field: ControllerRenderProps }

/**
 * Owns the editor's `initValue` and keeps it in step with react-hook-form:
 * - `lastEmittedRef` is the last text sent to `field.onChange`; a `field.value`
 *   that differs from it is external (reset / setValue).
 * - An external value is applied at once while the editor is unfocused, and on
 *   the next real blur while it is focused, so it never lands under the cursor.
 * - The editor is re-keyed on each application so applying a value equal to the
 *   current `initValue` (reset back to what it was) still reaches the editor.
 */
const TemplateFieldBody = ({
  field,
  label,
  description,
  placeholder,
  required = false,
  channels,
  info,
  hideOptionalMarker = false,
  deferError = false,
}: TemplateFieldBodyProps) => {
  const optionalLabel = useFormOptionalLabel()
  const {
    error,
    isTouched,
    isDirty,
    formItemId,
    formDescriptionId,
    formMessageId,
  } = useFormField()
  // The flow editor submits the whole form on its own (autosave), so
  // "submitted" says nothing about this field: only the user touching it does.
  const isErrorHidden = deferError && !(isTouched || isDirty)
  const visibleError = isErrorHidden ? undefined : error
  const labelId = `${formItemId}-label`

  const [synced, setSynced] = useState<SyncedValue>(() => ({
    text: toText(field.value),
    version: 0,
  }))
  const lastEmittedRef = useRef(synced.text)
  const isFocusedRef = useRef(false)
  const deferredRef = useRef<string | null>(null)

  const applyExternal = useCallback((text: string) => {
    deferredRef.current = null
    lastEmittedRef.current = text
    setSynced((previous) => ({ text, version: previous.version + 1 }))
  }, [])

  const externalValue = toText(field.value)
  useEffect(() => {
    if (externalValue === lastEmittedRef.current) {
      // Back to what the editor already shows: drop any pending deferral.
      deferredRef.current = null
      return
    }
    if (isFocusedRef.current) {
      deferredRef.current = externalValue
      return
    }
    applyExternal(externalValue)
  }, [externalValue, applyExternal])

  const handleChange = (text: string) => {
    // setContent echoes (and no-op edits) never reach the form.
    if (text === lastEmittedRef.current) {
      return
    }
    deferredRef.current = null
    lastEmittedRef.current = text
    field.onChange(text)
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget
    // The inline variable picker lives inside this wrapper: moving into it is
    // not a blur.
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return
    }
    // React dispatches one focusout from the inline picker (a portal into this
    // wrapper) to this handler twice; only the first one is a real blur.
    if (!isFocusedRef.current) {
      return
    }
    isFocusedRef.current = false
    field.onBlur()
    if (deferredRef.current !== null) {
      applyExternal(deferredRef.current)
    }
  }

  const describedBy =
    [
      description ? formDescriptionId : null,
      visibleError ? formMessageId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined

  const editorAttributes: Record<string, string> = {
    role: "textbox",
    "aria-labelledby": labelId,
    "aria-invalid": String(Boolean(visibleError)),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
  }

  return (
    <>
      {/* The info button sits beside the label, not inside it: a click on a
          label would otherwise forward to the button and toggle the popover. */}
      <div className="flex items-center gap-1">
        <FormLabel
          className={cn(
            "flex gap-1",
            isErrorHidden && "data-[error=true]:text-foreground",
          )}
          htmlFor={undefined}
          id={labelId}
        >
          {label}
          {required || hideOptionalMarker ? null : (
            <span className="self-start font-normal text-xxs">
              {optionalLabel}
            </span>
          )}
        </FormLabel>
        {info ? (
          <GoogleAdsInfoPopover label={info.label}>
            {info.content}
          </GoogleAdsInfoPopover>
        ) : null}
      </div>
      {/* focusin/focusout bubble from the editor and the inline picker alike. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: focus tracking only, the wrapper has no interaction of its own */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same */}
      <div
        className="min-w-0"
        onBlur={handleBlur}
        onFocus={() => {
          isFocusedRef.current = true
        }}
      >
        <PlainTextTiptapEditor
          channels={channels}
          editorAttributes={editorAttributes}
          includeBotFieldVariables
          includeRawCustomFieldVariables
          initValue={synced.text}
          inline
          inlineVariablePicker
          key={synced.version}
          onChange={handleChange}
          placeholder={placeholder}
          showEmojiPicker={false}
        />
      </div>
      {description ? (
        <FormDescription className="text-xs">{description}</FormDescription>
      ) : null}
      <TranslatedFieldMessage hidden={isErrorHidden} />
    </>
  )
}

/**
 * A `{{variable}}`-capable single-line input bound to react-hook-form, with the
 * blur / ARIA / reset behaviour the shared `PlainTextEditorField` lacks (it reads
 * the form value on mount only and never reports blur).
 */
export const GoogleAdsTemplateField = ({
  name,
  formItemClassName,
  ...bodyProps
}: GoogleAdsTemplateFieldProps) => {
  const { control } = useFormContext()

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("w-full min-w-0", formItemClassName)}>
          <TemplateFieldBody field={field} {...bodyProps} />
        </FormItem>
      )}
    />
  )
}
