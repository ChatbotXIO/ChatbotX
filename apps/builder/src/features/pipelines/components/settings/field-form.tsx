"use client"

import {
  PIPELINE_LIMITS,
  PIPELINE_REFERENCE_NAME_MAX,
  pipelineReferenceNameSchema,
  referenceNameFromName,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { customFieldTypes } from "@chatbotx.io/utils/custom-field"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useState } from "react"
import {
  createFieldAction,
  updateFieldAction,
} from "../../actions/field-member.action"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import type { BoardField } from "../board/types"
import { CheckboxField } from "../shared/checkbox-field"
import { OptionSelect } from "../shared/option-select"
import { FIELD_TYPE_LABEL_KEYS } from "./field-type-labels"

export type FieldDialogTarget =
  | { mode: "create" }
  | {
      mode: "edit"
      field: Pick<BoardField, "id" | "name" | "referenceName" | "required">
    }

type FieldDialogProps = {
  workspaceId: string
  pipelineId: string
  /** The field being created or edited; null keeps the dialog closed. */
  target: FieldDialogTarget | null
  onClose: () => void
}

/** Create or edit one custom field in a dialog. */
export function FieldDialog({
  workspaceId,
  pipelineId,
  target,
  onClose,
}: FieldDialogProps) {
  const t = useTranslations("pipelines")
  const tRoot = useTranslations()
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={target !== null}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.mode === "edit"
              ? `${tRoot("actions.edit")}: ${target.field.name}`
              : t("settings.addField")}
          </DialogTitle>
        </DialogHeader>
        {/* Mounted per opening, so every opening starts from the field's values. */}
        {target ? (
          <FieldForm
            onDone={onClose}
            pipelineId={pipelineId}
            target={target}
            workspaceId={workspaceId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Name, reference name and required flag of a custom field. Create adds a type
 * select and derives the reference name from the name; edit keeps the type
 * (stored item values depend on it).
 */
function FieldForm({
  workspaceId,
  pipelineId,
  target,
  onDone,
}: {
  workspaceId: string
  pipelineId: string
  target: FieldDialogTarget
  onDone: () => void
}) {
  const isEdit = target.mode === "edit"
  const t = useTranslations("pipelines")
  const tRoot = useTranslations()
  const ids = {
    name: useId(),
    reference: useId(),
    referenceError: useId(),
  }
  const [name, setName] = useState(isEdit ? target.field.name : "")
  const [referenceName, setReferenceName] = useState(
    isEdit ? target.field.referenceName : "",
  )
  const [required, setRequired] = useState(
    isEdit ? target.field.required : false,
  )
  const [type, setType] =
    useState<(typeof customFieldTypes.options)[number]>("shortText")

  const create = useAction(
    createFieldAction.bind(null, workspaceId),
    usePipelineAction({ successMessage: "settings.fieldAdded", onDone }),
  )
  const update = useAction(
    updateFieldAction.bind(null, workspaceId),
    usePipelineAction({ onDone }),
  )

  const isPending = create.isPending || update.isPending
  // Checked as typed, so a bad reference name is explained at the field
  // instead of failing on submit with a generic error.
  const isReferenceNameInvalid =
    referenceName !== "" &&
    !pipelineReferenceNameSchema.safeParse(referenceName).success
  const canSubmit =
    !isPending &&
    name.trim() !== "" &&
    referenceName !== "" &&
    !isReferenceNameInvalid

  const submit = () => {
    const values = {
      id: pipelineId,
      name: name.trim(),
      referenceName,
      required,
    }
    if (target.mode === "edit") {
      update.execute({ ...values, fieldId: target.field.id })
      return
    }
    create.execute({ ...values, type })
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) {
          submit()
        }
      }}
    >
      <label className="grid gap-1.5 text-sm" htmlFor={ids.name}>
        {t("settings.fieldName")}
        <Input
          autoFocus
          id={ids.name}
          maxLength={PIPELINE_LIMITS.name}
          onChange={(event) => {
            setName(event.target.value)
            if (!isEdit) {
              setReferenceName(
                referenceNameFromName(event.target.value, "field"),
              )
            }
          }}
          value={name}
        />
      </label>
      <label className="grid gap-1.5 text-sm" htmlFor={ids.reference}>
        {t("settings.fieldReference")}
        <Input
          aria-describedby={
            isReferenceNameInvalid ? ids.referenceError : undefined
          }
          aria-invalid={isReferenceNameInvalid}
          id={ids.reference}
          maxLength={PIPELINE_REFERENCE_NAME_MAX}
          onChange={(event) => setReferenceName(event.target.value)}
          value={referenceName}
        />
        {isReferenceNameInvalid ? (
          <span className="text-destructive text-xs" id={ids.referenceError}>
            {t("settings.referenceNameFormat")}
          </span>
        ) : null}
      </label>
      {isEdit ? null : (
        <div className="grid gap-1.5 text-sm">
          <span>{t("settings.fieldType")}</span>
          <OptionSelect
            ariaLabel={t("settings.fieldType")}
            onValueChange={(next) => setType(customFieldTypes.parse(next))}
            options={customFieldTypes.options.map((option) => ({
              value: option,
              label: tRoot(FIELD_TYPE_LABEL_KEYS[option]),
            }))}
            value={type}
          />
        </div>
      )}
      <CheckboxField checked={required} onCheckedChange={setRequired}>
        {t("settings.required")}
      </CheckboxField>
      <DialogFooter>
        <Button onClick={onDone} type="button" variant="outline">
          {tRoot("actions.cancel")}
        </Button>
        <Button disabled={!canSubmit} type="submit">
          {isPending ? <Loader2Icon className="animate-spin" /> : null}
          {isEdit ? tRoot("actions.save") : t("settings.addField")}
        </Button>
      </DialogFooter>
    </form>
  )
}
