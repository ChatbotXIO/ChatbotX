"use client"

import type { FolderType } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect } from "react"
import { toast } from "sonner"
import { changeFolderAction } from "./actions/change-folder.action"
import { useFolderSelectOptions } from "./provider/folder-hook"
import { changeFolderRequest } from "./schema/action"

export type ChangeFolderDialogProps = {
  workspaceId: string
  modelIds: string[] | null
  currentFolderId: string | null
  folderType: FolderType
  open: boolean
  trigger?: ReactNode
  onOpenChange: (open: boolean) => void
}

export function ChangeFolderDialog(props: ChangeFolderDialogProps) {
  const {
    workspaceId,
    modelIds,
    trigger,
    currentFolderId,
    folderType,
    open,
    onOpenChange,
  } = props

  const router = useRouter()
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("messages.moveFeature", {
              feature: t(`fields.${folderType}.label`),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <ChangeFolderForm
          currentFolderId={currentFolderId}
          folderType={folderType}
          modelIds={modelIds}
          onClose={() => onOpenChange(false)}
          onSuccess={() => {
            onOpenChange(false)
            router.refresh()
          }}
          workspaceId={workspaceId}
        />
      </DialogContent>
    </Dialog>
  )
}

export type ChangeFolderFormProps = {
  workspaceId: string
  modelIds: string[] | null
  currentFolderId: string | null
  folderType: FolderType
  onClose?: () => void
  onSuccess?: () => void
}

export function ChangeFolderForm(props: ChangeFolderFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const folderOptions = useFolderSelectOptions()

  const {
    workspaceId,
    modelIds,
    currentFolderId,
    folderType,
    onClose,
    onSuccess = () => {
      router.refresh()
    },
  } = props

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      changeFolderAction.bind(null, workspaceId),
      zodResolver(changeFolderRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.folder.label"),
              }),
            )
            resetFormAndAction()
            onSuccess?.()
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            newFolderId: "",
          },
        },
      },
    )
  const { setValue } = form

  useEffect(() => {
    if (modelIds) {
      setValue("newFolderId", currentFolderId ?? "")
      setValue("folderType", folderType)
      setValue("modelIds", modelIds)
    }
  }, [modelIds, currentFolderId, folderType, setValue])

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <ComboboxField
          label={t("fields.folder.label")}
          name="newFolderId"
          options={folderOptions}
          required
        />

        <div className="flex justify-end gap-4">
          <Button
            onClick={() => onClose?.()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            size="sm"
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.confirm")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
