"use client"

import type { PageElementSchema } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card } from "@chatbotx.io/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@chatbotx.io/ui/components/ui/sortable"
import { MoveVerticalIcon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useSmtpInboxOptions } from "@/features/inboxes/provider/inbox-hook"
import { PageElementBuilder } from "../../components/page-element-builder"
import { PAGE_ELEMENTS } from "./page-node-menu"

type EmailStepEditorProps = {
  parentName: string
}

export default function EmailStepEditor(props: EmailStepEditorProps) {
  const { parentName } = props
  const t = useTranslations()
  const smtpInboxOptions = useSmtpInboxOptions()
  const { control } = useFormContext()

  const { fields, append, move, remove } = useFieldArray({
    control,
    name: `${parentName}.elements`,
  })

  const onAddNode = useCallback(
    (defaultFn: () => PageElementSchema) => {
      append(defaultFn())
    },
    [append],
  )

  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label={t("fields.smtpChannel.label")}
        name={`${parentName}.integrationSmtpId`}
        options={smtpInboxOptions}
      />

      <SelectField
        label={t("fields.topicId.label")}
        name={`${parentName}.topicId`}
        options={[]}
      />

      <TiptapEditorField
        label={t("fields.from.label")}
        name={`${parentName}.from`}
      />
      <TiptapEditorField
        label={t("fields.to.label")}
        name={`${parentName}.to`}
      />
      <TiptapEditorField
        label={t("fields.subject.label")}
        name={`${parentName}.subject`}
      />
      <TiptapEditorField
        label={t("fields.preheader.label")}
        name={`${parentName}.preheader`}
      />

      <Card className="px-4">
        <Sortable
          getItemValue={(item) => item.id}
          onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
          value={fields}
        >
          <SortableContent asChild>
            <div className="flex flex-col gap-2">
              {(fields as PageElementSchema[]).map((field, index) => (
                <SortableItem asChild key={field.id} value={field.id}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <PageElementBuilder
                        parentName={`${parentName}.elements.${index}`}
                        type={field.type}
                      />
                    </div>
                    <div className="flex flex-col">
                      <Button
                        className="size-8 shrink-0"
                        onClick={() => remove(index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon aria-hidden="true" className="size-4" />
                      </Button>
                      <SortableItemHandle asChild>
                        <Button className="size-8" size="icon" variant="ghost">
                          <MoveVerticalIcon className="h-4 w-4" />
                        </Button>
                      </SortableItemHandle>
                    </div>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableContent>
        </Sortable>
      </Card>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            <PlusIcon />
            {t("actions.create")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PAGE_ELEMENTS.map((item) => (
            <DropdownMenuItem
              key={item.stepType}
              onClick={() => onAddNode(item.defaultFn)}
            >
              <item.icon className="size-4" />
              {t(item.labelKey)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
