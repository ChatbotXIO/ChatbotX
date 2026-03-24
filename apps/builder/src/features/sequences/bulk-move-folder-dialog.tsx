"use client"

import { FolderType } from "@aha.chat/database/enums"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FolderInput, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ComponentPropsWithoutRef } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { changeFolderAction } from "../folders/actions/change-folder.action"
import { useFolderSelectOptions } from "../folders/provider/folder-hook"
import type { SequenceResource } from "./schema"

type BulkMoveFolderDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  chatbotId: string
  sequences: SequenceResource[]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange: (val: boolean) => void
}

const bulkMoveFolderSchema = z.object({
  newFolderId: z.string(),
})

export function BulkMoveFolderDialog({
  chatbotId,
  sequences,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: BulkMoveFolderDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const folderOptions = useFolderSelectOptions()

  const form = useForm<z.infer<typeof bulkMoveFolderSchema>>({
    resolver: zodResolver(bulkMoveFolderSchema),
    defaultValues: {
      newFolderId: "",
    },
  })

  const handleBulkMove = async (
    values: z.infer<typeof bulkMoveFolderSchema>,
  ) => {
    try {
      await Promise.all(
        sequences.map((sequence) =>
          changeFolderAction(chatbotId, {
            modelIds: [sequence.id],
            newFolderId: values.newFolderId,
            folderType: FolderType.sequence,
          }),
        ),
      )
      toast.success(
        t("messages.updatedSuccess", {
          feature: t("fields.folder.label"),
        }),
      )
      form.reset()
      onOpenChange(false)
      onSuccess?.()
      router.refresh()
    } catch (error) {
      console.error("Error moving sequences:", error)
      toast.error(t("messages.unknownError"))
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <FolderInput aria-hidden="true" className="mr-2 size-4" />
            {t("actions.move")} ({sequences.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("messages.moveFeature", {
              feature: t("fields.sequences.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {t("messages.moveFolderDescription", {
              count: sequences.length,
            })}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-6"
            onSubmit={form.handleSubmit(handleBulkMove)}
          >
            <ComboboxField
              label={t("fields.folder.label")}
              name="newFolderId"
              options={folderOptions}
              required
            />

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => onOpenChange(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
