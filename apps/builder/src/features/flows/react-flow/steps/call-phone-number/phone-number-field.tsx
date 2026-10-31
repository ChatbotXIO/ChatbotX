"use client"

import { flowValidationCodes } from "@chatbotx.io/flow-config"
import {
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from "@chatbotx.io/ui/components/ui/form"
import { type CountryCode, isSupportedCountry } from "libphonenumber-js"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { PlainTextTiptapEditor } from "@/components/tiptap/plain-text-tiptap-editor"
import { resolveFlowValidationCodeKey } from "../../flow-validation-message"
import { useStepStore } from "../../stores/step-store-provider"
import { CountryDialCodePicker } from "./country-dial-code-picker"
import {
  canPickCountry,
  changeCountry,
  joinPhoneNumber,
  moveToOwnCountry,
  type PhoneNumberParts,
  splitPhoneNumber,
} from "./phone-number-parts"

type PhoneNumberFieldProps = {
  name: string
  label: string
}

/**
 * The field's error. An invalid number is explained for what the author has
 * in front of them: a picked country, a national number with none, or a `+…`
 * number. Any other code shows its own translated text.
 */
const PhoneNumberMessage = ({ parts }: { parts: PhoneNumberParts }) => {
  const t = useTranslations()
  const locale = useLocale()
  const { error, formMessageId } = useFormField()
  if (!error?.message) {
    return null
  }

  const describeInvalidNumber = () => {
    if (parts.country) {
      const country =
        new Intl.DisplayNames([locale], { type: "region" }).of(parts.country) ??
        parts.country
      return t("flows.callPhoneNumber.invalidForCountry", { country })
    }
    return parts.local.trim().startsWith("+")
      ? t("flows.callPhoneNumber.invalidInternational")
      : t("flows.callPhoneNumber.needsCountry")
  }

  const key = resolveFlowValidationCodeKey(error.message)
  let text = error.message
  if (error.message === flowValidationCodes.invalidPhoneNumber) {
    text = describeInvalidNumber()
  } else if (key) {
    text = t(key)
  }

  return (
    <p className="text-destructive text-sm" id={formMessageId}>
      {text}
    </p>
  )
}

/**
 * The editable number. The label and error point at tiptap's `contenteditable`
 * through `editorAttributes`, which is where the editor puts DOM attributes.
 */
const PhoneNumberInput = ({
  initValue,
  autoFocus,
  onChange,
}: {
  initValue: string
  autoFocus: boolean
  onChange: (local: string) => void
}) => {
  const { error, formItemId, formMessageId } = useFormField()
  return (
    <PlainTextTiptapEditor
      autoFocus={autoFocus}
      disableLineBreaks
      editorAttributes={{
        id: formItemId,
        "aria-invalid": String(Boolean(error)),
        ...(error ? { "aria-describedby": formMessageId } : {}),
      }}
      includeBotFieldVariables
      initValue={initValue}
      inline
      onChange={onChange}
      placeholder=""
      showEmojiPicker={false}
    />
  )
}

/**
 * Phone number input with an optional country picker (flag + dial code). With
 * a country the input holds only the national number and the stored value is
 * the international one (`+4915123456789`); without one the input holds the
 * whole value — a `+…` number or an expression with `{{variables}}`.
 *
 * A new, empty number starts with the workspace's country picked.
 */
export const PhoneNumberField = ({ name, label }: PhoneNumberFieldProps) => {
  const { control, getValues, setValue } = useFormContext()
  const workspaceTargetCountry = useStepStore(
    (state) => state.workspaceTargetCountry,
  )
  const [parts, setParts] = useState<PhoneNumberParts>(() => {
    const saved: string = getValues(name) ?? ""
    if (saved) {
      return splitPhoneNumber(saved)
    }
    const workspaceCountry =
      workspaceTargetCountry && isSupportedCountry(workspaceTargetCountry)
        ? workspaceTargetCountry
        : null
    return { country: workspaceCountry, local: "" }
  })
  // The editor snapshots its text on mount, so a programmatic change (picking
  // a country) remounts it with the new text.
  const [editorVersion, setEditorVersion] = useState(0)

  const commit = (next: PhoneNumberParts) => {
    setParts(next)
    setValue(name, joinPhoneNumber(next), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  // Shows new parts in the editor, which only reads its text on mount.
  const remountEditor = (next: PhoneNumberParts) => {
    commit(next)
    setEditorVersion((version) => version + 1)
  }

  const onLocalChange = (local: string) => {
    // A number typed with its own `+` carries its own country.
    const typed = {
      country: local.trim().startsWith("+") ? null : parts.country,
      local,
    }
    // Once complete it moves into the picker (`+14155552671` → 🇺🇸 4155552671).
    const moved = moveToOwnCountry(typed)
    if (moved) {
      remountEditor(moved)
      return
    }
    commit(typed)
  }

  const onCountryChange = (country: CountryCode | null) => {
    remountEditor(changeCountry(parts, country))
  }

  return (
    <div className="flex items-start gap-2">
      <CountryDialCodePicker
        disabled={!canPickCountry(parts.local)}
        onChange={onCountryChange}
        value={parts.country}
      />
      <FormField
        control={control}
        name={name}
        render={() => (
          <FormItem className="w-full min-w-0 flex-1">
            {/* The flag and the number explain themselves; the label stays for screen readers. */}
            <FormLabel className="sr-only">{label}</FormLabel>
            <PhoneNumberInput
              // Keep typing after a programmatic change remounts it.
              autoFocus={editorVersion > 0}
              initValue={parts.local}
              key={editorVersion}
              onChange={onLocalChange}
            />
            <PhoneNumberMessage parts={parts} />
          </FormItem>
        )}
      />
    </div>
  )
}
