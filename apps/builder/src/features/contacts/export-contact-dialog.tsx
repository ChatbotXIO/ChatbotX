"use client"

import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
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
import type { MultiSelectGroup } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  AlertCircle,
  CheckCircle2,
  CopyIcon,
  DownloadIcon,
  Loader2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"
import { useClipboard } from "@/hooks/use-clipboard"
import { client } from "@/lib/orpc/orpc"
import { useCustomFieldSelectOptions } from "../custom-fields/provider/custom-field-hook"
import { useTagSelectOptions } from "../tags/provider/tag-hook"
import { exportContactsAction } from "./actions/export-contacts.action"
import {
  contactFieldPrefix,
  contactPrefix,
  contactTagPrefix,
  type ExportContactsFilter,
  exportContactsRequest,
} from "./schemas/action"

type ExportState = {
  fileId: string
}

export function ExportContactDialog({
  workspaceId,
  contactIds,
  exportAll = false,
  filter,
  trigger,
}: {
  workspaceId: string
  contactIds: string[]
  exportAll?: boolean
  filter?: ExportContactsFilter
  trigger: React.ReactElement
}) {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const [exportState, setExportState] = useState<ExportState | null>(null)
  // M-6: Track poll count to surface a timeout when the export worker stalls.
  const [pollCount, setPollCount] = useState(0)
  // 24 polls × 5 s = 2 minutes before we give up polling.
  const POLL_TIMEOUT_COUNT = 24

  const customFieldOptions = useCustomFieldSelectOptions({
    prefix: contactFieldPrefix,
  })
  const tagOptions = useTagSelectOptions({ prefix: contactTagPrefix })
  const { handleCopy } = useClipboard()

  const options: MultiSelectGroup[] = [
    {
      heading: t("fields.botFields.label"),
      options: [
        {
          label: t("fields.firstName.label"),
          value: `${contactPrefix}:firstName`,
        },
        {
          label: t("fields.lastName.label"),
          value: `${contactPrefix}:lastName`,
        },
        {
          label: t("fields.fullName.label"),
          value: `${contactPrefix}:fullName`,
        },
        { label: t("fields.email.label"), value: `${contactPrefix}:email` },
        {
          label: t("fields.phoneNumber.label"),
          value: `${contactPrefix}:phoneNumber`,
        },
      ],
    },
    {
      heading: t("fields.customFields.label"),
      options: customFieldOptions,
    },
    {
      heading: t("fields.tags.label"),
      options: tagOptions,
    },
  ]

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      exportContactsAction.bind(null, workspaceId),
      zodResolver(exportContactsRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            if (data) {
              setExportState({ fileId: data.fileId })
            }
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            fields: options[0].options.slice(0, 5).map((opt) => opt.value),
            ...(exportAll ? { exportAll: true, filter } : { contactIds }),
          },
        },
        errorMapProps: {},
      },
    )

  const fileId = exportState?.fileId
  const { data: exportFile } = useSWR(
    fileId ? (["contact-export-file", workspaceId, fileId] as const) : null,
    ([, ws, id]) =>
      client.contactsAPIs.getExportFileAuthenticatedAPI({
        workspaceId: ws,
        fileId: id,
      }),
    {
      refreshInterval: (latest) => {
        if (latest?.status === "uploaded" || latest?.status === "failed") {
          return 0
        }
        if (pollCount >= POLL_TIMEOUT_COUNT) {
          return 0
        }
        setPollCount((n) => n + 1)
        return 5000
      },
    },
  )

  const resetDialog = () => {
    setExportState(null)
    setPollCount(0)
    resetFormAndAction()
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      resetDialog()
    }
  }

  const closeDialog = () => handleOpenChange(false)

  const handleDownload = () => {
    if (exportFile?.downloadUrl) {
      window.open(exportFile.downloadUrl, "_blank", "noopener,noreferrer")
    }
  }

  const renderBody = () => {
    if (!exportState) {
      return (
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            {exportAll && (
              <p className="text-muted-foreground text-sm">
                {t("contacts.exportAllNotice")}
              </p>
            )}

            <MultiSelectField maxCount={100} name="fields" options={options} />

            <div className="flex justify-between gap-4">
              <Button onClick={closeDialog} type="button" variant="outline">
                {t("actions.cancel")}
              </Button>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="animate-spin" />
                )}
                {t("actions.export")}
              </Button>
            </div>
          </form>
        </Form>
      )
    }

    if (exportFile?.status === "failed") {
      return (
        <div className="space-y-4">
          <p className="text-destructive text-sm">
            {t("contacts.exportFailed")}
          </p>
          <div className="flex justify-between gap-4">
            <Button onClick={closeDialog} type="button" variant="outline">
              {t("actions.cancel")}
            </Button>
            <Button onClick={resetDialog} type="button" variant="secondary">
              {t("actions.back")}
            </Button>
          </div>
        </div>
      )
    }

    if (exportFile?.status === "uploaded" && exportFile.downloadUrl) {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {t("contacts.exportReadyTitle")}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("contacts.exportReadyDescription")}
              </p>
            </div>
          </div>

          {/* L-1: Do not expose the raw presigned URL (it contains AWS signing
              parameters). Copy and download actions are sufficient. */}
          <div className="flex justify-between gap-4">
            <Button
              onClick={() => handleCopy(exportFile.downloadUrl ?? "")}
              type="button"
              variant="outline"
            >
              <CopyIcon />
              {t("contacts.copyLink")}
            </Button>
            <Button onClick={handleDownload} type="button">
              <DownloadIcon />
              {t("contacts.exportDownloadCount", {
                count: exportFile.totalRecords ?? 0,
              })}
            </Button>
          </div>
        </div>
      )
    }

    // M-6: Show a timeout message instead of spinning indefinitely.
    if (pollCount >= POLL_TIMEOUT_COUNT) {
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3 py-4">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {t("contacts.exportTakingLong")}
              </p>
              <p className="text-muted-foreground text-sm">
                {t("contacts.exportTakingLongDescription")}
              </p>
            </div>
          </div>
          <div className="flex justify-start">
            <Button onClick={closeDialog} type="button" variant="outline">
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {t("contacts.exportPreparing")}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("contacts.exportPreparingDescription")}
            </p>
          </div>
        </div>
        <div className="flex justify-start">
          <Button onClick={closeDialog} type="button" variant="outline">
            {t("actions.cancel")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent
        className="max-h-screen max-w-lg overflow-y-scroll"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("actions.exportContacts")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  )
}
