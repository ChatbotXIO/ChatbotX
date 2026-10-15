import { MINI_APP_ACTION_KEY, readMiniAppAction } from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { readString, readStringArray, withId } from "../../lib/props"
import { ChoiceControl } from "../choice-control"
import { DropdownField } from "../dropdown-field"
import { OptionImage } from "../option-image"
import type { NodeView } from "./context"
import { FieldShell, OptionText } from "./field-shell"

export function DropdownView({ view }: { view: NodeView }) {
  return (
    <FieldShell error={view.error} label={view.label}>
      <DropdownField
        disabled={view.disabled}
        onChange={(next) => view.onChange?.(next)}
        options={view.options}
        value={view.interactive ? readString(view.value) : undefined}
      />
    </FieldShell>
  )
}

/** RadioButtonsGroup (one id) and CheckboxGroup (a list of ids). */
export function ChoiceListView({ view }: { view: NodeView }) {
  const multiple = view.node.type === "CheckboxGroup"
  const selected = multiple ? readStringArray(view.value) : []
  return (
    <FieldShell
      error={view.error}
      helper={view.text("description")}
      label={view.label}
    >
      <div className="flex flex-col divide-y divide-[#e9edef]">
        {view.options.map((option) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: ChoiceControl renders the input inside the label
          <label className="flex items-center gap-3 py-2" key={option.id}>
            <OptionImage option={option} />
            <OptionText option={option} />
            {multiple ? (
              <ChoiceControl
                checked={view.interactive && selected.includes(option.id)}
                disabled={view.disabled || option.enabled === false}
                onChange={(event) =>
                  view.onChange?.(
                    withId(selected, option.id, event.target.checked),
                  )
                }
                type="checkbox"
              />
            ) : (
              <ChoiceControl
                checked={view.interactive && view.value === option.id}
                disabled={view.disabled || option.enabled === false}
                name={readString(view.props.name)}
                onChange={() => view.onChange?.(option.id)}
                type="radio"
              />
            )}
          </label>
        ))}
      </div>
    </FieldShell>
  )
}

export function ChipsSelectorView({ view }: { view: NodeView }) {
  const selected = readStringArray(view.value)
  return (
    <FieldShell
      error={view.error}
      helper={view.text("description")}
      label={view.label}
    >
      <div className="flex flex-wrap gap-2">
        {view.options.map((option) => {
          const isSelected = view.interactive && selected.includes(option.id)
          return (
            <button
              className={cn(
                "rounded-full border px-3 py-1 text-[14px]",
                isSelected
                  ? "border-[#008069] bg-[#d9fdd3] text-[#008069]"
                  : "border-[#d1d7db] bg-white text-[#111b21]",
              )}
              disabled={view.disabled || option.enabled === false}
              key={option.id}
              onClick={() =>
                view.onChange?.(withId(selected, option.id, !isSelected))
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

export function OptInView({ view }: { view: NodeView }) {
  const t = useTranslations("miniApps.view")
  const action = readMiniAppAction(view.props[MINI_APP_ACTION_KEY])
  return (
    <div className="flex flex-col gap-1">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: ChoiceControl renders the input inside the label */}
      <label className="flex items-start gap-3">
        <ChoiceControl
          checked={view.interactive && view.value === true}
          className="mt-0.5"
          disabled={view.disabled}
          onChange={(event) => view.onChange?.(event.target.checked)}
          type="checkbox"
        />
        <span className="text-[#111b21] text-[15px]">{view.label}</span>
      </label>
      {action ? (
        <button
          className="self-start ps-8 text-[#027eb5] text-[14px]"
          disabled={!view.interactive}
          onClick={view.trigger}
          type="button"
        >
          {t("readMore")}
        </button>
      ) : null}
      {view.error ? (
        <span className="ps-8 text-[#ea0038] text-[12px]">{view.error}</span>
      ) : null}
    </div>
  )
}
