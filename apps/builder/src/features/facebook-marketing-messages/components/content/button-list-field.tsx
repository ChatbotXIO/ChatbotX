"use client"

import { BUTTON_LABEL_MAX } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import {
  MM_MAX_BUTTONS,
  type MmButton,
  mmButtonDefaultFn,
  mmButtonSchema,
} from "../../schema/content"
import { ButtonActionEditor, buttonActionOptions } from "./button-action-editor"
import { ItemListField } from "./item-list-field"

/**
 * Buttons for the Button and Media templates, and for each Generic element.
 * Meta caps all three at 3 buttons.
 *
 * A button collapses to a row showing its label over its action; clicking the
 * row opens the editor dialog.
 */
export function ButtonListField({ name }: { name: string }) {
  const t = useTranslations()

  // Reused rather than re-listed so the row label can never drift from the
  // select's, and so no runtime value is ever passed to `t()`.
  const actionLabels = useMemo(
    () => buttonActionOptions({ allowWebUrl: true, t }),
    [t],
  )

  return (
    <ItemListField<MmButton>
      defaultItem={mmButtonDefaultFn}
      dialogTitle={t("messages.editFeature", {
        feature: t("fields.button.label"),
      })}
      limitMessage={t("flows.buttons.limitReached", { max: MM_MAX_BUTTONS })}
      max={MM_MAX_BUTTONS}
      name={name}
      renderRow={(button) => (
        <>
          <span className="w-full truncate font-medium text-sm">
            {button.title || t("fields.button.label")}
          </span>
          <span className="w-full truncate text-muted-foreground text-xs">
            {
              actionLabels.find((option) => option.value === button.actionType)
                ?.label
            }
          </span>
        </>
      )}
      schema={mmButtonSchema}
    >
      <InputField
        label={t("fields.name.label")}
        maxLength={BUTTON_LABEL_MAX}
        name="title"
        required
      />
      <ButtonActionEditor />
    </ItemListField>
  )
}
