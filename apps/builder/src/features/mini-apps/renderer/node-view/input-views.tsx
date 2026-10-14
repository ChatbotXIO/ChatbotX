import { isFileAnswer } from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CalendarIcon, FileTextIcon, ImageIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { readString } from "../../lib/props"
import { FileUploadField } from "../file-upload-field"
import type { NodeView } from "./context"
import { FieldShell, inputClassName } from "./field-shell"

/** The browser input for each TextInput `input-type`. */
const HTML_INPUT_TYPE: Record<string, string> = {
  text: "text",
  number: "number",
  email: "email",
  password: "password",
  passcode: "password",
  phone: "tel",
  date: "date",
  datetime: "datetime-local",
}

const TEXT_INPUT_MAX_CHARS = 80
const TEXT_AREA_MAX_LENGTH = 600

export function TextInputView({ view }: { view: NodeView }) {
  const { props, interactive } = view
  const inputType = readString(props["input-type"]) || "text"
  return (
    <FieldShell error={view.error} helper={view.helper} label={view.label}>
      <input
        className={inputClassName}
        disabled={view.disabled}
        inputMode={
          inputType === "passcode" || inputType === "number"
            ? "numeric"
            : undefined
        }
        maxLength={
          typeof props["max-chars"] === "number"
            ? props["max-chars"]
            : TEXT_INPUT_MAX_CHARS
        }
        onChange={(event) => view.onChange?.(event.target.value)}
        type={HTML_INPUT_TYPE[inputType] ?? "text"}
        value={
          interactive ? readString(view.value) : readString(props["init-value"])
        }
      />
    </FieldShell>
  )
}

export function TextAreaView({ view }: { view: NodeView }) {
  const { props, interactive } = view
  return (
    <FieldShell error={view.error} helper={view.helper} label={view.label}>
      <textarea
        className={cn(inputClassName, "min-h-20 resize-none")}
        disabled={view.disabled}
        maxLength={
          typeof props["max-length"] === "number"
            ? props["max-length"]
            : TEXT_AREA_MAX_LENGTH
        }
        onChange={(event) => view.onChange?.(event.target.value)}
        value={
          interactive ? readString(view.value) : readString(props["init-value"])
        }
      />
    </FieldShell>
  )
}

/** A native date input bounded by the node's `min-date` / `max-date`. */
function DateInput({
  view,
  value,
  onChange,
}: {
  view: NodeView
  value: string
  onChange: (next: string) => void
}) {
  return (
    <input
      className={inputClassName}
      disabled={view.disabled}
      max={readString(view.props["max-date"]) || undefined}
      min={readString(view.props["min-date"]) || undefined}
      onChange={(event) => onChange(event.target.value)}
      type="date"
      value={value}
    />
  )
}

export function DatePickerView({ view }: { view: NodeView }) {
  return (
    <FieldShell error={view.error} helper={view.helper} label={view.label}>
      <DateInput
        onChange={(next) => view.onChange?.(next || undefined)}
        value={view.interactive ? readString(view.value) : ""}
        view={view}
      />
    </FieldShell>
  )
}

type DateRange = { "start-date"?: string; "end-date"?: string }

export function CalendarPickerView({ view }: { view: NodeView }) {
  const t = useTranslations("miniApps.view")
  const { interactive } = view
  const isRange = view.props.mode === "range"
  const range = (view.value ?? {}) as DateRange
  return (
    <FieldShell error={view.error} helper={view.helper} label={view.label}>
      {isRange ? (
        <div className="flex items-center gap-2">
          <DateInput
            onChange={(next) =>
              view.onChange?.({ ...range, "start-date": next })
            }
            value={interactive ? (range["start-date"] ?? "") : ""}
            view={view}
          />
          <span className="text-[#667781]">–</span>
          <DateInput
            onChange={(next) => view.onChange?.({ ...range, "end-date": next })}
            value={interactive ? (range["end-date"] ?? "") : ""}
            view={view}
          />
        </div>
      ) : (
        <DateInput
          onChange={(next) => view.onChange?.(next || undefined)}
          value={interactive ? readString(view.value) : ""}
          view={view}
        />
      )}
      {view.mode === "design" ? (
        <span className="flex items-center gap-1 text-[#667781] text-[12px]">
          <CalendarIcon className="size-3" />
          {isRange ? t("calendarRange") : t("calendarSingle")}
        </span>
      ) : null}
    </FieldShell>
  )
}

/** PhotoPicker and DocumentPicker: an upload field in the runner, a placeholder in the editor. */
export function FilePickerView({ view }: { view: NodeView }) {
  const t = useTranslations("miniApps.view")
  const { node } = view
  const isPhoto = node.type === "PhotoPicker"
  const Icon = isPhoto ? ImageIcon : FileTextIcon
  return (
    <FieldShell label={view.label}>
      {view.text("description") ? (
        <span className="text-[#667781] text-[13px]">
          {view.text("description")}
        </span>
      ) : null}
      {view.interactive ? (
        <FileUploadField
          disabled={view.props.enabled === false}
          node={node}
          onChange={(files) => view.onChange?.(files)}
          value={isFileAnswer(view.value) ? view.value : []}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-[#d1d7db] border-dashed px-3 py-3 text-[#008069] text-[14px]">
          <Icon className="size-4" />
          {t(isPhoto ? "takePhoto" : "uploadDocument")}
        </div>
      )}
      {view.error ? (
        <span className="text-[#ea0038] text-[12px]">{view.error}</span>
      ) : null}
    </FieldShell>
  )
}
