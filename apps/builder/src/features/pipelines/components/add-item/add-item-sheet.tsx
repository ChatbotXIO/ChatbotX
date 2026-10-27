"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeftIcon, Loader2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { ContactAvatar } from "@/features/contacts/components/contact-avatar"
import { browserTimeZone } from "@/features/custom-fields/lib/field-date"
import { createItemAction } from "../../actions/item.action"
import { liveDraftTargets } from "../../lib/add-item-draft"
import {
  type AddItemFormValues,
  addItemFormSchema,
  hasMissingRequiredField,
  initialAddItemFormValues,
  splitAssignees,
} from "../../lib/add-item-form"
import { itemNounKeys } from "../../lib/item-noun"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import type { BoardField, BoardPipeline } from "../board/types"
import { AddItemDetailsForm, type AttachedFile } from "./add-item-details-form"
import { AddItemStepper } from "./add-item-stepper"
import { ContactStep, type PickedContact } from "./contact-step"

type AddItemSheetProps = {
  workspaceId: string
  pipeline: Pick<BoardPipeline, "id" | "type" | "currency" | "settings">
  stages: Array<{ id: string; name: string; bulkJobId?: string | null }>
  fields: Pick<BoardField, "id" | "name" | "type" | "required">[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Preselected contact (inbox panel) skips the search step. */
  initialContact?: { id: string; name: string }
  /**
   * The pipeline failed to refresh (deleted, or access revoked): block a new
   * save without unmounting, so a request in flight still completes.
   */
  disabled?: boolean
}

export function AddItemSheet({
  workspaceId,
  pipeline,
  stages,
  fields,
  open,
  onOpenChange,
  initialContact,
  disabled = false,
}: AddItemSheetProps) {
  const t = useTranslations("pipelines")
  const tc = useTranslations("actions")
  const noun = itemNounKeys[pipeline.type]
  const fieldIds = fields.map((field) => field.id)
  const [contact, setContact] = useState<PickedContact | null>(
    initialContact ?? null,
  )
  const [files, setFiles] = useState<AttachedFile[]>([])
  const form = useForm<AddItemFormValues>({
    resolver: zodResolver(addItemFormSchema),
    mode: "onChange",
    defaultValues: initialAddItemFormValues(fieldIds),
  })
  const fieldValues = useWatch({ control: form.control, name: "fieldValues" })
  // A field added while the sheet is open starts empty, not undefined, so its
  // input stays controlled.
  const fieldKey = fieldIds.join(",")
  useEffect(() => {
    for (const id of fieldKey ? fieldKey.split(",") : []) {
      if (form.getValues(`fieldValues.${id}`) === undefined) {
        form.setValue(`fieldValues.${id}`, "")
      }
    }
  }, [form, fieldKey])
  // Stages running a bulk job cannot receive items; the default is the first free one.
  const openStages = stages.filter((stage) => !stage.bulkJobId)

  const reset = () => {
    form.reset(initialAddItemFormValues(fieldIds))
    setContact(initialContact ?? null)
    setFiles([])
  }

  const closeSheet = () => {
    reset()
    onOpenChange(false)
  }

  const { execute, isPending } = useAction(
    createItemAction.bind(null, workspaceId),
    usePipelineAction({
      successMessage: "add.success",
      onDone: closeSheet,
      mayAssignContact: pipeline.settings.assignContactOnAssign,
    }),
  )

  const canSubmit =
    !disabled &&
    Boolean(contact) &&
    form.formState.isValid &&
    !hasMissingRequiredField(fields, fieldValues ?? {})

  const submit = form.handleSubmit((values) => {
    if (!(contact && canSubmit)) {
      return
    }
    const { stageId, fieldValues: liveFieldValues } = liveDraftTargets(
      { stageId: values.stageId ?? "", fieldValues: values.fieldValues },
      {
        openStageIds: openStages.map((stage) => stage.id),
        fieldIds,
      },
    )
    const assigned = splitAssignees(values.assignees)
    execute({
      id: pipeline.id,
      contactId: contact.id,
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      value: values.value,
      priority: values.priority,
      status: values.status,
      stageId: stageId || openStages[0]?.id,
      dueDate: values.dueDate ? new Date(values.dueDate) : undefined,
      assigneeMemberIds: assigned.memberIds,
      assigneeInboxTeamIds: assigned.teamIds,
      fieldValues: liveFieldValues,
      fieldValuesTimezone: browserTimeZone(),
      mediaLibraryFileIds: files.map((file) => file.id),
    })
  })

  const backToContacts = !(contact && initialContact)
  const detailsLabel = t("add.stepDetails", { noun: t(noun.one) })

  return (
    <Sheet
      onOpenChange={(next) => (next ? onOpenChange(true) : closeSheet())}
      open={open}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="flex-row items-center gap-2 border-b p-3 pe-12">
          <Button
            aria-label={tc("back")}
            onClick={() => {
              if (contact && backToContacts) {
                setContact(null)
              } else {
                closeSheet()
              }
            }}
            size="icon"
            variant="ghost"
          >
            <ArrowLeftIcon />
          </Button>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{t(noun.add)}</SheetTitle>
            <SheetDescription className="sr-only">
              {contact ? detailsLabel : t("add.stepContact")}
            </SheetDescription>
          </div>
          <Button
            disabled={!canSubmit || isPending}
            form="add-item-form"
            type="submit"
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {tc("save")}
          </Button>
        </SheetHeader>

        <AddItemStepper
          activeIndex={contact ? 1 : 0}
          steps={[
            { id: "contact", label: t("add.stepContact") },
            { id: "details", label: detailsLabel },
          ]}
        />

        {contact ? (
          <Form {...form}>
            <form
              className="grid gap-4 px-4 pb-6 text-sm"
              id="add-item-form"
              noValidate
              onSubmit={submit}
            >
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                <ContactAvatar
                  className="size-9"
                  contact={{ avatar: contact.avatar ?? null, channel: null }}
                  name={contact.name}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {contact.name}
                </span>
                {initialContact ? null : (
                  <Button
                    aria-label={t("add.changeContact")}
                    className="size-6"
                    onClick={() => setContact(null)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 text-muted-foreground text-xs uppercase tracking-wide">
                <span className="h-px flex-1 bg-border" />
                {detailsLabel}
                <span className="h-px flex-1 bg-border" />
              </div>
              <AddItemDetailsForm
                fields={fields}
                files={files}
                onFilesChange={setFiles}
                openStages={openStages}
                pipeline={pipeline}
                workspaceId={workspaceId}
              />
            </form>
          </Form>
        ) : (
          <ContactStep
            onPick={setContact}
            open={open}
            workspaceId={workspaceId}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
