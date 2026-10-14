"use client"

import {
  MINI_APP_ACTION_KEY,
  type MiniAppAction,
  type MiniAppActionName,
  readMiniAppAction,
} from "@chatbotx.io/mini-app"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { actionLabelKey } from "../../lib/labels"
import { useMiniAppEditor } from "../editor-context"
import { FieldRow, InspectorHint, useInspector } from "./field-row"

/** The action a freshly picked action name starts as; `navigate` goes to `firstTarget`. */
const newAction = (
  name: string,
  firstTarget: string | undefined,
): MiniAppAction | undefined => {
  switch (name) {
    case "navigate":
      return firstTarget ? { name: "navigate", next: firstTarget } : undefined
    case "complete":
      return { name: "complete" }
    case "open_url":
      return { name: "open_url", url: "https://" }
    default:
      return
  }
}

/** Picks an `on-click-action`; `navigate` targets a screen by its stable key. */
export function ActionPicker({
  value,
  allowed,
  optional,
  screenKey,
  onChange,
}: {
  value: unknown
  allowed: readonly MiniAppActionName[]
  optional: boolean
  screenKey: string
  onChange: (action: MiniAppAction | undefined) => void
}) {
  const t = useTranslations()
  const screens = useMiniAppEditor((state) => state.definition.screens)
  const action = readMiniAppAction(value)
  const NONE = "none"
  const actionItems = [
    ...(optional
      ? [{ value: NONE, label: t("miniApps.inspector.noAction") }]
      : []),
    ...allowed.map((name) => ({ value: name, label: t(actionLabelKey[name]) })),
  ]
  const targets = screens.filter((screen) => screen.key !== screenKey)
  const screenItems = targets.map((screen) => ({
    value: screen.key,
    label: screen.title ? `${screen.title} (${screen.id})` : screen.id,
  }))

  return (
    <div className="flex flex-col gap-2">
      <Select
        items={actionItems}
        onValueChange={(name) =>
          onChange(newAction(String(name), targets[0]?.key))
        }
        value={action?.name ?? (optional ? NONE : "")}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("miniApps.inspector.chooseAction")} />
        </SelectTrigger>
        <SelectContent>
          {actionItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {action?.name === "navigate" && targets.length > 0 ? (
        <Select
          items={screenItems}
          onValueChange={(next) =>
            onChange({ name: "navigate", next: String(next) })
          }
          value={action.next}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {screenItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {action?.name === "navigate" && targets.length === 0 ? (
        <InspectorHint>{t("miniApps.inspector.noOtherScreen")}</InspectorHint>
      ) : null}
      {action?.name === "open_url" ? (
        <Input
          onChange={(event) =>
            onChange({ name: "open_url", url: event.target.value })
          }
          placeholder="https://"
          value={action.url}
        />
      ) : null}
      {action?.name === "complete" ? (
        <InspectorHint>{t("miniApps.inspector.completeHint")}</InspectorHint>
      ) : null}
    </div>
  )
}

export function ActionProp({
  allowed,
  optional,
  screenKey,
}: {
  allowed: readonly MiniAppActionName[]
  optional: boolean
  screenKey: string
}) {
  const { props, setProp } = useInspector()
  return (
    <FieldRow propKey={MINI_APP_ACTION_KEY}>
      <ActionPicker
        allowed={allowed}
        onChange={(action) => setProp(MINI_APP_ACTION_KEY, action)}
        optional={optional}
        screenKey={screenKey}
        value={props[MINI_APP_ACTION_KEY]}
      />
    </FieldRow>
  )
}
