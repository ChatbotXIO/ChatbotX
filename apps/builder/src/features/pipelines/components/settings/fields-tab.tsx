"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { deleteFieldAction } from "../../actions/field-member.action"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import type { BoardField } from "../board/types"
import { FieldDialog, type FieldDialogTarget } from "./field-form"
import { FIELD_TYPE_LABEL_KEYS } from "./field-type-labels"

export function FieldsTab({
  workspaceId,
  pipelineId,
  fields,
}: {
  workspaceId: string
  pipelineId: string
  fields: BoardField[]
}) {
  const t = useTranslations("pipelines")
  const tRoot = useTranslations()
  const [deletingField, setDeletingField] = useState<BoardField | null>(null)
  const [dialogTarget, setDialogTarget] = useState<FieldDialogTarget | null>(
    null,
  )
  const remove = useAction(
    deleteFieldAction.bind(null, workspaceId),
    usePipelineAction({ onDone: () => setDeletingField(null) }),
  )

  return (
    <div className="grid gap-4 py-4 text-sm">
      <ul className="grid gap-1">
        {fields.length === 0 ? (
          <li className="text-muted-foreground text-xs">
            {t("settings.noFields")}
          </li>
        ) : null}
        {fields.map((field) => (
          <li
            className="flex items-center justify-between rounded-md border px-3 py-2"
            key={field.id}
          >
            <span>
              {field.name}
              <span className="ml-2 text-muted-foreground text-xs">
                {field.referenceName} ·{" "}
                {tRoot(FIELD_TYPE_LABEL_KEYS[field.type])}
                {field.required ? ` · ${t("settings.requiredShort")}` : ""}
              </span>
            </span>
            <span className="flex items-center">
              <Button
                aria-label={tRoot("actions.edit")}
                className="size-7"
                onClick={() => setDialogTarget({ mode: "edit", field })}
                size="icon"
                variant="ghost"
              >
                <PencilIcon />
              </Button>
              <Button
                aria-label={t("settings.deleteField")}
                className="size-7"
                onClick={() => setDeletingField(field)}
                size="icon"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <Button
        className="justify-self-start"
        onClick={() => setDialogTarget({ mode: "create" })}
        size="sm"
        variant="outline"
      >
        <PlusIcon />
        {t("settings.addField")}
      </Button>
      <FieldDialog
        onClose={() => setDialogTarget(null)}
        pipelineId={pipelineId}
        target={dialogTarget}
        workspaceId={workspaceId}
      />
      <ConfirmDialog
        confirmLabel={t("settings.deleteField")}
        description={t("settings.confirmDeleteField")}
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (deletingField) {
            remove.execute({ id: pipelineId, fieldId: deletingField.id })
          }
        }}
        onOpenChange={(open) => {
          if (!(open || remove.isPending)) {
            setDeletingField(null)
          }
        }}
        open={deletingField !== null}
        title={
          deletingField
            ? `${t("settings.deleteField")}: ${deletingField.name}`
            : t("settings.deleteField")
        }
      />
    </div>
  )
}
