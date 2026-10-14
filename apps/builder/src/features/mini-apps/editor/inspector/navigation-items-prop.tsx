"use client"

import {
  MINI_APP_ACTION_KEY,
  type MiniAppAction,
  type MiniAppNavigationItem,
} from "@chatbotx.io/mini-app"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useTranslations } from "next-intl"
import { nextFreeId } from "../../lib/list-editing"
import { readArray } from "../../lib/props"
import { ActionPicker } from "./action-picker"
import { FieldRow, useInspector } from "./field-row"
import { RepeatableList } from "./repeatable-list"
import { VariableTextEditor } from "./variable-text-editor"

/** The parts of a NavigationList item the inspector edits. */
type NavigationItem = Pick<MiniAppNavigationItem, "id" | "main-content"> & {
  end?: { title?: string }
  badge?: string
  [MINI_APP_ACTION_KEY]?: MiniAppAction
}

export function NavigationItemsProp({ screenKey }: { screenKey: string }) {
  const t = useTranslations("miniApps.inspector")
  const tRoot = useTranslations()
  const { props, setProp } = useInspector()
  const items = readArray<NavigationItem>(props["list-items"])

  return (
    <FieldRow propKey="list-items">
      <RepeatableList<NavigationItem>
        addLabel={t("addOption")}
        createItem={() => ({
          id: nextFreeId(
            "item",
            items.map((item) => String(item.id)),
          ),
          "main-content": {
            title: `${tRoot("miniApps.defaults.navigationItem")} ${items.length + 1}`,
          },
        })}
        extra={(item, patch) => (
          <ActionPicker
            allowed={["navigate"]}
            onChange={(action) => patch({ [MINI_APP_ACTION_KEY]: action })}
            optional={false}
            screenKey={screenKey}
            value={item[MINI_APP_ACTION_KEY]}
          />
        )}
        fields={(item, patch) => (
          <>
            <VariableTextEditor
              onChange={(text) =>
                patch({
                  "main-content": {
                    ...item["main-content"],
                    description: text || undefined,
                  },
                })
              }
              placeholder={tRoot("miniApps.properties.description")}
              value={item["main-content"]?.description ?? ""}
            />
            <VariableTextEditor
              onChange={(text) => patch({ end: { title: text || undefined } })}
              placeholder={t("endText")}
              value={item.end?.title ?? ""}
            />
            <VariableTextEditor
              onChange={(text) => patch({ badge: text || undefined })}
              placeholder={t("badge")}
              value={item.badge ?? ""}
            />
            <Input
              className="h-8 font-mono text-xs"
              onChange={(event) => patch({ id: event.target.value })}
              placeholder={t("optionId")}
              value={item.id}
            />
          </>
        )}
        items={items}
        onChange={(next) => setProp("list-items", next)}
        title={(item, patch) => (
          <VariableTextEditor
            onChange={(text) =>
              patch({
                "main-content": { ...item["main-content"], title: text },
              })
            }
            placeholder={t("optionTitle")}
            value={item["main-content"]?.title ?? ""}
          />
        )}
      />
    </FieldRow>
  )
}
