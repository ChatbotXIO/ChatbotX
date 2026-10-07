"use client"

import {
  interpolate,
  isFileAnswer,
  type MiniAppAction,
  type MiniAppNode,
  type MiniAppOption,
  type MiniAppRuntimeScope,
  miniAppActionSchema,
} from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CalendarIcon,
  ChevronRightIcon,
  FileTextIcon,
  ImageIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { toImageSrc } from "../lib/image-src"
import { DropdownField } from "./dropdown-field"
import { FileUploadField } from "./file-upload-field"
import { ImageCarouselView } from "./image-carousel-view"
import { OptionImage } from "./option-image"
import { SimpleMarkdown } from "./simple-markdown"

export type NodeViewMode = "design" | "run"

export type NodeViewProps = {
  node: MiniAppNode
  mode: NodeViewMode
  scope: MiniAppRuntimeScope
  value?: unknown
  onChange?: (value: unknown) => void
  onAction?: (action: MiniAppAction) => void
  error?: string
}

const readString = (value: unknown): string =>
  typeof value === "string" ? value : ""

const readAction = (value: unknown): MiniAppAction | undefined => {
  const parsed = miniAppActionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

const fontWeightClass: Record<string, string> = {
  bold: "font-bold",
  italic: "italic",
  bold_italic: "font-bold italic",
  normal: "",
}

function FieldShell({
  label,
  helper,
  error,
  children,
}: {
  label?: string
  helper?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span className="font-medium text-[#54656f] text-[13px]">{label}</span>
      ) : null}
      {children}
      {error ? (
        <span className="text-[#ea0038] text-[12px]">{error}</span>
      ) : null}
      {!error && helper ? (
        <span className="text-[#667781] text-[12px]">{helper}</span>
      ) : null}
    </div>
  )
}

const inputClassName =
  "w-full rounded-md border border-[#d1d7db] bg-white px-3 py-2 text-[15px] text-[#111b21] outline-none focus:border-[#008069] disabled:cursor-default"

function OptionText({ option }: { option: MiniAppOption }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-[#111b21] text-[15px]">{option.title}</span>
      {option.description ? (
        <span className="text-[#667781] text-[13px]">{option.description}</span>
      ) : null}
      {option.metadata ? (
        <span className="text-[#667781] text-[12px]">{option.metadata}</span>
      ) : null}
    </span>
  )
}

const toArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []

export function NodeView({
  node,
  mode,
  scope,
  value,
  onChange,
  onAction,
  error,
}: NodeViewProps) {
  const t = useTranslations("miniApps.view")
  const props = node.props
  // The editor shows bindings as written (`${form.x}`); the runner resolves them.
  const text = (key: string) =>
    mode === "design"
      ? readString(props[key])
      : interpolate(readString(props[key]), scope)
  const interactive = mode === "run"
  const disabled = !interactive || props.enabled === false
  const options = (
    Array.isArray(props["data-source"]) ? props["data-source"] : []
  ) as MiniAppOption[]
  const label = text("label")
  const helper = text("helper-text") || text("description")
  const fieldError = error
  const trigger = () => {
    const action = readAction(props["on-click-action"])
    if (action && interactive) {
      onAction?.(action)
    }
  }

  switch (node.type) {
    case "TextHeading":
      return (
        <h2 className="font-bold text-[#111b21] text-[20px]">{text("text")}</h2>
      )
    case "TextSubheading":
      return (
        <h3 className="font-semibold text-[#111b21] text-[17px]">
          {text("text")}
        </h3>
      )
    case "TextBody":
    case "TextCaption": {
      const className = cn(
        node.type === "TextBody"
          ? "text-[#111b21] text-[15px]"
          : "text-[#667781] text-[13px]",
        fontWeightClass[readString(props["font-weight"])],
        props.strikethrough === true && "line-through",
      )
      return props.markdown === true ? (
        <div className={className}>
          <SimpleMarkdown source={text("text")} />
        </div>
      ) : (
        <p className={cn("whitespace-pre-wrap", className)}>{text("text")}</p>
      )
    }
    case "RichText":
      return (
        <div className="text-[#111b21] text-[15px]">
          <SimpleMarkdown source={text("text")} />
        </div>
      )
    case "TextInput": {
      const inputType = readString(props["input-type"]) || "text"
      const htmlType: Record<string, string> = {
        text: "text",
        number: "number",
        email: "email",
        password: "password",
        passcode: "password",
        phone: "tel",
      }
      return (
        <FieldShell error={fieldError} helper={helper} label={label}>
          <input
            className={inputClassName}
            disabled={disabled}
            inputMode={
              inputType === "passcode" || inputType === "number"
                ? "numeric"
                : undefined
            }
            maxLength={
              typeof props["max-chars"] === "number" ? props["max-chars"] : 80
            }
            onChange={(event) => onChange?.(event.target.value)}
            type={htmlType[inputType] ?? "text"}
            value={
              interactive ? readString(value) : readString(props["init-value"])
            }
          />
        </FieldShell>
      )
    }
    case "TextArea":
      return (
        <FieldShell error={fieldError} helper={helper} label={label}>
          <textarea
            className={cn(inputClassName, "min-h-20 resize-none")}
            disabled={disabled}
            maxLength={
              typeof props["max-length"] === "number"
                ? props["max-length"]
                : 600
            }
            onChange={(event) => onChange?.(event.target.value)}
            value={
              interactive ? readString(value) : readString(props["init-value"])
            }
          />
        </FieldShell>
      )
    case "Dropdown":
      return (
        <FieldShell error={fieldError} label={label}>
          <DropdownField
            disabled={disabled}
            onChange={(next) => onChange?.(next)}
            options={options}
            value={interactive ? readString(value) : undefined}
          />
        </FieldShell>
      )
    case "RadioButtonsGroup":
      return (
        <FieldShell
          error={fieldError}
          helper={text("description")}
          label={label}
        >
          <div className="flex flex-col divide-y divide-[#e9edef]">
            {options.map((option) => (
              <label className="flex items-center gap-3 py-2" key={option.id}>
                <OptionImage option={option} />
                <OptionText option={option} />
                <input
                  checked={interactive && value === option.id}
                  className="size-5 accent-[#008069]"
                  disabled={disabled || option.enabled === false}
                  name={readString(props.name)}
                  onChange={() => onChange?.(option.id)}
                  type="radio"
                />
              </label>
            ))}
          </div>
        </FieldShell>
      )
    case "CheckboxGroup": {
      const selected = toArray(value)
      return (
        <FieldShell
          error={fieldError}
          helper={text("description")}
          label={label}
        >
          <div className="flex flex-col divide-y divide-[#e9edef]">
            {options.map((option) => (
              <label className="flex items-center gap-3 py-2" key={option.id}>
                <OptionImage option={option} />
                <OptionText option={option} />
                <input
                  checked={interactive && selected.includes(option.id)}
                  className="size-5 accent-[#008069]"
                  disabled={disabled || option.enabled === false}
                  onChange={(event) =>
                    onChange?.(
                      event.target.checked
                        ? [...selected, option.id]
                        : selected.filter((id) => id !== option.id),
                    )
                  }
                  type="checkbox"
                />
              </label>
            ))}
          </div>
        </FieldShell>
      )
    }
    case "ChipsSelector": {
      const selected = toArray(value)
      return (
        <FieldShell
          error={fieldError}
          helper={text("description")}
          label={label}
        >
          <div className="flex flex-wrap gap-2">
            {options.map((option) => {
              const isSelected = interactive && selected.includes(option.id)
              return (
                <button
                  className={cn(
                    "rounded-full border px-3 py-1 text-[14px]",
                    isSelected
                      ? "border-[#008069] bg-[#d9fdd3] text-[#008069]"
                      : "border-[#d1d7db] bg-white text-[#111b21]",
                  )}
                  disabled={disabled || option.enabled === false}
                  key={option.id}
                  onClick={() =>
                    onChange?.(
                      isSelected
                        ? selected.filter((id) => id !== option.id)
                        : [...selected, option.id],
                    )
                  }
                  type="button"
                >
                  {option.title}
                </button>
              )
            })}
          </div>
        </FieldShell>
      )
    }
    case "DatePicker":
      return (
        <FieldShell error={fieldError} helper={helper} label={label}>
          <input
            className={inputClassName}
            disabled={disabled}
            max={readString(props["max-date"]) || undefined}
            min={readString(props["min-date"]) || undefined}
            onChange={(event) => onChange?.(event.target.value || undefined)}
            type="date"
            value={interactive ? readString(value) : ""}
          />
        </FieldShell>
      )
    case "CalendarPicker": {
      const isRange = props.mode === "range"
      const range = (value ?? {}) as {
        "start-date"?: string
        "end-date"?: string
      }
      const dateInput = (current: string, update: (next: string) => void) => (
        <input
          className={inputClassName}
          disabled={disabled}
          max={readString(props["max-date"]) || undefined}
          min={readString(props["min-date"]) || undefined}
          onChange={(event) => update(event.target.value)}
          type="date"
          value={current}
        />
      )
      return (
        <FieldShell error={fieldError} helper={helper} label={label}>
          {isRange ? (
            <div className="flex items-center gap-2">
              {dateInput(
                interactive ? (range["start-date"] ?? "") : "",
                (next) => onChange?.({ ...range, "start-date": next }),
              )}
              <span className="text-[#667781]">–</span>
              {dateInput(interactive ? (range["end-date"] ?? "") : "", (next) =>
                onChange?.({ ...range, "end-date": next }),
              )}
            </div>
          ) : (
            dateInput(interactive ? readString(value) : "", (next) =>
              onChange?.(next || undefined),
            )
          )}
          {mode === "design" ? (
            <span className="flex items-center gap-1 text-[#667781] text-[12px]">
              <CalendarIcon className="size-3" />
              {isRange ? t("calendarRange") : t("calendarSingle")}
            </span>
          ) : null}
        </FieldShell>
      )
    }
    case "OptIn": {
      const action = readAction(props["on-click-action"])
      return (
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-3">
            <input
              checked={interactive && value === true}
              className="mt-0.5 size-5 accent-[#008069]"
              disabled={disabled}
              onChange={(event) => onChange?.(event.target.checked)}
              type="checkbox"
            />
            <span className="text-[#111b21] text-[15px]">{label}</span>
          </label>
          {action ? (
            <button
              className="self-start ps-8 text-[#027eb5] text-[14px]"
              disabled={!interactive}
              onClick={trigger}
              type="button"
            >
              {t("readMore")}
            </button>
          ) : null}
          {fieldError ? (
            <span className="ps-8 text-[#ea0038] text-[12px]">
              {fieldError}
            </span>
          ) : null}
        </div>
      )
    }
    case "PhotoPicker":
    case "DocumentPicker": {
      const Icon = node.type === "PhotoPicker" ? ImageIcon : FileTextIcon
      return (
        <FieldShell label={label}>
          {text("description") ? (
            <span className="text-[#667781] text-[13px]">
              {text("description")}
            </span>
          ) : null}
          {interactive ? (
            <FileUploadField
              disabled={props.enabled === false}
              node={node}
              onChange={(files) => onChange?.(files)}
              value={isFileAnswer(value) ? value : []}
            />
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-[#d1d7db] border-dashed px-3 py-3 text-[#008069] text-[14px]">
              <Icon className="size-4" />
              {t(node.type === "PhotoPicker" ? "takePhoto" : "uploadDocument")}
            </div>
          )}
          {fieldError ? (
            <span className="text-[#ea0038] text-[12px]">{fieldError}</span>
          ) : null}
        </FieldShell>
      )
    }
    case "Image": {
      const src = toImageSrc(props.src)
      const height = typeof props.height === "number" ? props.height : undefined
      return src ? (
        // biome-ignore lint/performance/noImgElement: inline base64 from Flow JSON
        <img
          alt={readString(props["alt-text"])}
          className={cn(
            "w-full rounded-md",
            props["scale-type"] === "cover" ? "object-cover" : "object-contain",
          )}
          height={height ?? 120}
          src={src}
          style={{ height }}
          width={360}
        />
      ) : null
    }
    case "ImageCarousel": {
      const images = (Array.isArray(props.images) ? props.images : []) as {
        src?: string
        "alt-text"?: string
      }[]
      return (
        <ImageCarouselView images={images} scaleType={props["scale-type"]} />
      )
    }
    case "EmbeddedLink":
      return (
        <button
          className="self-start text-[#027eb5] text-[15px]"
          disabled={!interactive}
          onClick={trigger}
          type="button"
        >
          {text("text")}
        </button>
      )
    case "NavigationList": {
      const items = (
        Array.isArray(props["list-items"]) ? props["list-items"] : []
      ) as Record<string, unknown>[]
      return (
        <div className="flex flex-col divide-y divide-[#e9edef] rounded-md border border-[#e9edef]">
          {items.map((item, index) => {
            const main = (item["main-content"] ?? {}) as Record<string, string>
            const end = (item.end ?? {}) as Record<string, string>
            const start = (item.start ?? {}) as Record<string, string>
            const startSrc = toImageSrc(start.image)
            const tags = Array.isArray(item.tags) ? (item.tags as string[]) : []
            const itemAction = readAction(item["on-click-action"])
            return (
              <button
                className="flex items-center gap-3 px-3 py-2 text-start"
                disabled={!interactive}
                key={readString(item.id) || index}
                onClick={() => itemAction && onAction?.(itemAction)}
                type="button"
              >
                {startSrc ? (
                  // biome-ignore lint/performance/noImgElement: inline base64 from Flow JSON
                  <img
                    alt={start["alt-text"] ?? ""}
                    className="size-10 rounded object-cover"
                    height={40}
                    src={startSrc}
                    width={40}
                  />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 text-[#111b21] text-[15px]">
                    {main.title}
                    {typeof item.badge === "string" ? (
                      <span className="rounded bg-[#d9fdd3] px-1.5 text-[#008069] text-[11px]">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  {main.description ? (
                    <span className="text-[#667781] text-[13px]">
                      {main.description}
                    </span>
                  ) : null}
                  {tags.length > 0 ? (
                    <span className="flex gap-1">
                      {tags.map((tag) => (
                        <span
                          className="rounded bg-[#f0f2f5] px-1.5 text-[#54656f] text-[11px]"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                {end.title ? (
                  <span className="text-[#111b21] text-[14px]">
                    {end.title}
                  </span>
                ) : null}
                <ChevronRightIcon className="size-4 text-[#8696a0]" />
              </button>
            )
          })}
        </div>
      )
    }
    case "Footer":
      return (
        <div className="flex flex-col gap-1">
          <button
            className="w-full rounded-full bg-[#008069] py-2.5 font-medium text-[15px] text-white disabled:opacity-60"
            disabled={!interactive || props.enabled === false}
            onClick={trigger}
            type="button"
          >
            {label}
          </button>
          {text("center-caption") ||
          text("left-caption") ||
          text("right-caption") ? (
            <div className="flex justify-between text-[#667781] text-[12px]">
              <span>{text("left-caption")}</span>
              <span>{text("center-caption")}</span>
              <span>{text("right-caption")}</span>
            </div>
          ) : null}
        </div>
      )
    default:
      return null
  }
}
