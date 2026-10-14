"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  canMapToCustomField,
  isTextInputDateType,
  type MiniAppNode,
  type TextInputDateType,
} from "@chatbotx.io/mini-app"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useMiniAppEditor } from "../editor-context"
import { InspectorHint } from "./field-row"

/**
 * Picks the contact custom field an input's answer is saved to. Stored on the
 * node (not in Flow JSON); applied when a known contact submits the web link.
 */
const FILE_FIELD_TYPES: CustomFieldType[] = ["shortText", "longText"]

/** A date input fills a field of its own kind, or a text field. */
const DATE_FIELD_TYPES: Record<TextInputDateType, CustomFieldType[]> = {
  date: ["date", "shortText", "longText"],
  datetime: ["datetime", "shortText", "longText"],
}

const allowedFieldTypes = (
  node: MiniAppNode,
): CustomFieldType[] | undefined => {
  if (node.type === "PhotoPicker" || node.type === "DocumentPicker") {
    return FILE_FIELD_TYPES
  }
  const inputType = node.props["input-type"]
  if (node.type === "TextInput" && isTextInputDateType(inputType)) {
    return DATE_FIELD_TYPES[inputType]
  }
  return
}

export function CustomFieldMapping({ node }: { node: MiniAppNode }) {
  const isFileInput =
    node.type === "PhotoPicker" || node.type === "DocumentPicker"
  const t = useTranslations("miniApps.inspector")
  const setNodeCustomField = useMiniAppEditor(
    (state) => state.setNodeCustomField,
  )
  const form = useForm<{ customFieldId: string }>({
    defaultValues: { customFieldId: node.customFieldId ?? "" },
  })

  if (!canMapToCustomField(node.type)) {
    return null
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Form {...form}>
        <CustomFieldSelect
          allowCreate
          clearable
          // Uploaded files are stored as their public URLs, so only text fields fit.
          createDefaultType={isFileInput ? "longText" : undefined}
          customFieldTypes={allowedFieldTypes(node)}
          label={t("saveToCustomField")}
          name="customFieldId"
          onValueChange={(value) => setNodeCustomField(node.id, value || null)}
          placeholder={t("chooseCustomField")}
        />
      </Form>
      <InspectorHint>{t("customFieldHint")}</InspectorHint>
    </div>
  )
}
