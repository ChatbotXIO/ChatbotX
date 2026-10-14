"use client"

import {
  MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH,
  type MiniAppOption,
} from "@chatbotx.io/mini-app"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useTranslations } from "next-intl"
import { nextFreeId } from "../../lib/list-editing"
import { readArray } from "../../lib/props"
import { FieldRow, useInspector } from "./field-row"
import { ImagePicker } from "./image-picker"
import { RepeatableList } from "./repeatable-list"
import { VariableTextEditor } from "./variable-text-editor"

/** Editor for `data-source` (Dropdown, radios, checkboxes, chips). */
export function OptionsProp({ withImages = false }: { withImages?: boolean }) {
  const t = useTranslations("miniApps.inspector")
  const tRoot = useTranslations()
  const { props, setProp } = useInspector()
  const options = readArray<MiniAppOption>(props["data-source"])

  return (
    <FieldRow propKey="data-source">
      <RepeatableList<MiniAppOption>
        addLabel={t("addOption")}
        createItem={() => ({
          id: nextFreeId(
            "option",
            options.map((option) => String(option.id)),
          ),
          title: `${tRoot("miniApps.defaults.option")} ${options.length + 1}`,
        })}
        extra={(option, patch) =>
          withImages ? (
            <ImagePicker
              maxLength={MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH}
              onChange={(image) => patch({ image })}
              value={option.image}
            />
          ) : null
        }
        fields={(option, patch) => (
          <>
            <Input
              className="h-8 font-mono text-xs"
              onChange={(event) => patch({ id: event.target.value })}
              placeholder={t("optionId")}
              value={option.id}
            />
            <VariableTextEditor
              onChange={(text) => patch({ description: text || undefined })}
              placeholder={tRoot("miniApps.properties.description")}
              value={option.description ?? ""}
            />
          </>
        )}
        items={options}
        onChange={(next) => setProp("data-source", next)}
        title={(option, patch) => (
          <VariableTextEditor
            onChange={(text) => patch({ title: text })}
            placeholder={t("optionTitle")}
            value={option.title}
          />
        )}
      />
    </FieldRow>
  )
}
