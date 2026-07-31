"use client"

import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  CopyIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import React, { useMemo, useState } from "react"
import { toast } from "sonner"
import { deleteMessengerMessageTemplateAction } from "./actions/delete-message-template"
import { CloneMessageTemplateDialog } from "./clone-message-template-dialog"
import { MessengerTemplatePreview } from "./components/template-preview"
import { MessengerMessageTemplatesTableToolbarActions } from "./message-templates-table-toolbar-actions"
import type { MessengerMessageTemplateResource } from "./schema/resource"

type Channel = {
  id: string
  name: string
}

type MessengerMessageTemplatesTableProps = {
  integrationMessenger: IntegrationMessengerModel
  promises: Promise<{
    data: MessengerMessageTemplateResource[]
    pageCount: number
  }>
  channels: Channel[]
}

function DeleteTemplateDialog({
  workspaceId,
  integrationMessengerId,
  template,
  onClose,
}: {
  workspaceId: string
  integrationMessengerId: string
  template: MessengerMessageTemplateResource | null
  onClose: () => void
}) {
  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    deleteMessengerMessageTemplateAction.bind(
      null,
      workspaceId,
      integrationMessengerId,
      template?.id ?? "",
    ),
    {
      onSuccess() {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.messageTemplate.label"),
          }),
        )
        onClose()
        router.refresh()
      },
      onError({ error }) {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open={!!template}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.messageTemplate.label"),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messages.deleteConfirmation", {
              feature: t("fields.messageTemplate.label"),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            disabled={isPending}
            onClick={() => execute()}
          >
            {t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type TemplateComponent = {
  type?: string
  format?: string
  text?: string
  example?: {
    header_handle?: string[]
    header_text?: string[]
    header_text_named_params?: Array<{ example?: string }>
    body_text?: string[][]
    body_text_named_params?: Array<{ example?: string }>
    url_suffix_example?: string
  }
  buttons?: Array<{
    type?: string
    text?: string
    url?: string
    phone_number?: string
    payload?: string
    example?: string[]
  }>
}

function buildPreviewParams(components: TemplateComponent[]) {
  const headerParams: Array<{
    type?: string
    text?: string
    image?: { link: string }
  }> = []
  const bodyParams: Array<{ text?: string }> = []
  const buttonParams: Array<{
    sub_type?: string
    index?: number
    text?: string
    payload?: string
  }> = []

  for (const component of components) {
    const componentType = component.type?.toUpperCase()
    const componentFormat = component.format?.toUpperCase()

    if (componentType === "HEADER") {
      if (componentFormat === "IMAGE") {
        const imageUrl = component.example?.header_handle?.[0]
        if (imageUrl) {
          headerParams.push({ type: "image", image: { link: imageUrl } })
        }
      }
      for (const text of component.example?.header_text ?? []) {
        headerParams.push({ type: "text", text })
      }
      for (const param of component.example?.header_text_named_params ?? []) {
        if (param.example) {
          headerParams.push({ type: "text", text: param.example })
        }
      }
    }
    if (componentType === "BODY") {
      for (const text of component.example?.body_text?.[0] ?? []) {
        bodyParams.push({ text })
      }
      for (const param of component.example?.body_text_named_params ?? []) {
        if (param.example) {
          bodyParams.push({ text: param.example })
        }
      }
    }
    if (componentType === "BUTTONS") {
      for (const [index, button] of (component.buttons ?? []).entries()) {
        const buttonType = button.type?.toUpperCase()
        if (buttonType === "URL") {
          buttonParams.push({
            sub_type: "url",
            index,
            text: button.example?.[0] ?? button.url,
          })
        }
        if (buttonType === "PHONE_NUMBER") {
          buttonParams.push({
            sub_type: "phone_number",
            index,
          })
        }
      }
    }
  }

  return { headerParams, bodyParams, buttonParams }
}

function ViewTemplateDialog({
  template,
  onClose,
}: {
  template: MessengerMessageTemplateResource | null
  onClose: () => void
}) {
  const t = useTranslations()
  const components = (template?.components ?? []) as TemplateComponent[]
  const previewParams = buildPreviewParams(components)
  const buttons = components.flatMap((component) => component.buttons ?? [])

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={!!template}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("actions.view")} {t("fields.messageTemplate.label")}
          </DialogTitle>
        </DialogHeader>

        {template && (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground">
                  {t("fields.name.label")}
                </div>
                <div className="font-medium">{template.name}</div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  {t("fields.language.label")}
                </div>
                <div className="font-medium">{template.language}</div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  {t("fields.category.label")}
                </div>
                <div className="font-medium">{template.category}</div>
              </div>
              <div>
                <div className="text-muted-foreground">
                  {t("fields.status.label")}
                </div>
                <div className="font-medium">{template.status}</div>
              </div>
            </div>

            <MessengerTemplatePreview
              bodyParams={previewParams.bodyParams}
              buttonParams={previewParams.buttonParams}
              components={components as never}
              headerParams={previewParams.headerParams}
            />

            {buttons.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-sm">
                  {t("messenger.messageTemplate.create.buttons")}
                </div>
                <div className="space-y-2">
                  {buttons.map((button, index) => (
                    <div
                      className="rounded border px-3 py-2 text-sm"
                      // biome-ignore lint/suspicious/noArrayIndexKey: template buttons do not expose stable ids
                      key={`${button.type}-${button.text}-${index}`}
                    >
                      <div className="font-medium">{button.text}</div>
                      <div className="text-muted-foreground text-xs">
                        {button.type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function MessengerMessageTemplatesTable({
  integrationMessenger,
  promises,
  channels,
}: MessengerMessageTemplatesTableProps) {
  const t = useTranslations()
  const { data, pageCount } = React.use(promises)

  const [cloneTarget, setCloneTarget] =
    useState<MessengerMessageTemplateResource | null>(null)
  const [viewTarget, setViewTarget] =
    useState<MessengerMessageTemplateResource | null>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<MessengerMessageTemplateResource | null>(null)

  const columns = useMemo<ColumnDef<MessengerMessageTemplateResource>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => row.original.name,
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: false,
      },
      {
        id: "language",
        accessorKey: "language",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.language.label")}
          />
        ),
        cell: ({ row }) => row.original.language,
        enableSorting: false,
      },
      {
        id: "category",
        accessorKey: "category",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.category.label")}
          />
        ),
        cell: ({ row }) => row.original.category,
        enableSorting: false,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => row.original.status,
        enableSorting: false,
      },
      {
        id: "actions",
        header: t("actions.actions"),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("actions.openMenu")}
                  className="flex size-8 p-0 data-[state=open]:bg-muted"
                  variant="ghost"
                >
                  <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40">
              {row.original.status === "APPROVED" && (
                <DropdownMenuItem onClick={() => setCloneTarget(row.original)}>
                  <CopyIcon />
                  {t("actions.clone")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setViewTarget(row.original)}>
                <EyeIcon />
                {t("actions.view")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteTarget(row.original)}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <div className="flex flex-col gap-4">
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      <div className="flex flex-col items-center justify-center p-4">
        <MessengerMessageTemplatesTableToolbarActions
          integrationMessengerId={integrationMessenger.id}
          workspaceId={integrationMessenger.workspaceId}
        />
      </div>

      <CloneMessageTemplateDialog
        channels={channels}
        cloneTarget={cloneTarget}
        key={cloneTarget?.id ?? ""}
        onClose={() => setCloneTarget(null)}
        sourceIntegrationMessengerId={integrationMessenger.id}
        workspaceId={integrationMessenger.workspaceId}
      />
      <ViewTemplateDialog
        onClose={() => setViewTarget(null)}
        template={viewTarget}
      />
      <DeleteTemplateDialog
        integrationMessengerId={integrationMessenger.id}
        onClose={() => setDeleteTarget(null)}
        template={deleteTarget}
        workspaceId={integrationMessenger.workspaceId}
      />
    </div>
  )
}
