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
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useRef } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useEmailTopicSelectOptions } from "@/features/email-topics/provider/email-topic-hook"
import {
  useSmtpInboxFromAddressMap,
  useSmtpInboxOptions,
} from "@/features/inboxes/provider/inbox-hook"
import { PageElementBuilder } from "../../components/page-element-builder"
import { PAGE_ELEMENTS } from "./page-node-menu"

type EmailStepEditorProps = {
  parentName: string
}

export default function EmailStepEditor(props: EmailStepEditorProps) {
  const { parentName } = props
  const t = useTranslations()
  const params = useParams<{ workspaceId: string; flowId: string }>()
  const smtpInboxOptions = useSmtpInboxOptions()
  const smtpFromAddressMap = useSmtpInboxFromAddressMap()
  const smtpFromAddressMapRef = useRef(smtpFromAddressMap)
  smtpFromAddressMapRef.current = smtpFromAddressMap
  const { control, setValue } = useFormContext()
  const emailTopicOptions = useEmailTopicSelectOptions()

  const integrationSmtpId = useWatch({
    name: `${parentName}.integrationSmtpId`,
  })

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
        triggerValueChange={(value) => {
          setValue(
            `${parentName}.from`,
            smtpFromAddressMapRef.current[value ?? ""] ?? "",
          )
        }}
      />

      <div className="relative">
        <SelectField
          label={t("fields.emailTopic.label")}
          name={`${parentName}.topicId`}
          options={emailTopicOptions}
        />
        <Link
          className="absolute end-0 top-[-2px] text-primary text-sm hover:underline"
          href={`/space/${params.workspaceId}/email-topics`}
        >
          {t("actions.addNew")}
        </Link>
      </div>

      <TiptapEditorField
        key={`from-${integrationSmtpId}`}
        label={t("fields.from.label")}
        name={`${parentName}.from`}
        required
      />
      <TiptapEditorField
        label={t("fields.to.label")}
        name={`${parentName}.to`}
        required
      />
      <TiptapEditorField
        label={t("fields.subject.label")}
        name={`${parentName}.subject`}
        required
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
          <SortableContent className="flex flex-col gap-2">
            {(fields as PageElementSchema[]).map((field, index) => (
              <SortableItem
                key={field.id}
                render={
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
                      <SortableItemHandle
                        render={
                          <Button
                            className="size-8"
                            size="icon"
                            variant="ghost"
                          >
                            <MoveVerticalIcon className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                }
                value={field.id}
              />
            ))}
          </SortableContent>
        </Sortable>
      </Card>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline">
              <PlusIcon />
              {t("actions.create")}
            </Button>
          }
        />
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
