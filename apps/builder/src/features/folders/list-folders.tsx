"use client"

import type { FolderType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  FolderIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  TrashIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useCallback, useState } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CreateFolderDialog } from "./create-folder-dialog"
import { DeleteFolderDialog } from "./delete-folder-dialog"
import { EditFolderDialog } from "./edit-folder-dialog"
import type { getCurrentFolder, listFolders } from "./queries"
import type { FolderResource } from "./schema/resource"

const COLLAPSED_FOLDER_LIMIT = 10

type ListFoldersProps = {
  workspaceId: string
  folderType: FolderType
  promises: Promise<
    [
      Awaited<ReturnType<typeof getCurrentFolder>>,
      Awaited<ReturnType<typeof listFolders>>,
    ]
  >
}

const breadcrumbButtonClassName =
  "h-auto gap-1 p-0 font-normal text-muted-foreground text-sm hover:bg-transparent hover:text-foreground"

const ListFolders = (props: ListFoldersProps) => {
  const { workspaceId, folderType, promises } = props
  const t = useTranslations()

  const [{ folder, parents }, { data: folders }] = use(promises)
  const router = useRouter()
  const searchParams = useSearchParams()

  const setFolderId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === null) {
        params.delete("folderId")
      } else {
        params.set("folderId", id)
      }
      params.delete("page")
      router.push(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  const [targetFolder, setTargetFolder] = useState<FolderResource | null>(null)

  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false)
  const onEdit = (selectedFolder: FolderResource) => {
    setTargetFolder(selectedFolder)
    setOpenEditDialog(true)
  }

  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false)
  const onDelete = (selectedFolder: FolderResource) => {
    setTargetFolder(selectedFolder)
    setOpenDeleteDialog(true)
  }

  const [expanded, setExpanded] = useState<boolean>(false)
  const hiddenCount = Math.max(folders.length - COLLAPSED_FOLDER_LIMIT, 0)
  const visibleFolders = expanded
    ? folders
    : folders.slice(0, COLLAPSED_FOLDER_LIMIT)

  const hasFolderInUrl = searchParams.has("folderId")
  const isMissingFolder = hasFolderInUrl && !folder
  const rootLabel = t("folders.root")

  return (
    <div className="mb-4 flex flex-col gap-3 border-b pb-4">
      {hasFolderInUrl && (
        <AppBreadcrumb
          items={[
            {
              label: rootLabel,
              element: (
                <Button
                  className={breadcrumbButtonClassName}
                  onClick={() => setFolderId(null)}
                  variant="ghost"
                >
                  {rootLabel}
                </Button>
              ),
            },
            ...parents.map((parentFolder: FolderResource) => ({
              label: parentFolder.name,
              element: (
                <Button
                  className={cn(breadcrumbButtonClassName, "max-w-40")}
                  onClick={() => setFolderId(parentFolder.id)}
                  title={parentFolder.name}
                  variant="ghost"
                >
                  <span className="truncate">{parentFolder.name}</span>
                </Button>
              ),
            })),
            ...(folder
              ? [
                  {
                    label: folder.name,
                    element: (
                      <span
                        className="block max-w-48 truncate font-medium text-foreground text-sm"
                        title={folder.name}
                      >
                        {folder.name}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {visibleFolders.map((folderItem: FolderResource) => (
          <FolderChip
            folder={folderItem}
            key={folderItem.id}
            onDelete={onDelete}
            onEdit={onEdit}
            onOpen={setFolderId}
          />
        ))}

        {hiddenCount > 0 && (
          <Button
            className="text-muted-foreground"
            onClick={() => setExpanded((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {expanded
              ? t("folders.showLess")
              : t("folders.showMore", { count: hiddenCount })}
          </Button>
        )}

        {!isMissingFolder && (
          <CreateFolderDialog
            folderType={folderType}
            workspaceId={workspaceId}
          />
        )}
      </div>

      <EditFolderDialog
        folder={targetFolder}
        onOpenChange={setOpenEditDialog}
        open={openEditDialog}
        workspaceId={workspaceId}
      />

      <DeleteFolderDialog
        folder={targetFolder}
        onOpenChange={setOpenDeleteDialog}
        open={openDeleteDialog}
        workspaceId={workspaceId}
      />
    </div>
  )
}

type FolderChipProps = {
  folder: FolderResource
  onOpen: (id: string) => void
  onEdit: (folder: FolderResource) => void
  onDelete: (folder: FolderResource) => void
}

const FolderChip = ({ folder, onOpen, onEdit, onDelete }: FolderChipProps) => {
  const t = useTranslations()
  const Icon = folder.isTrash ? Trash2Icon : FolderIcon

  return (
    <div className="group flex h-9 w-50 items-center rounded-md border bg-background transition-colors hover:border-primary/60 hover:bg-accent/50">
      <button
        className={cn(
          "flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md ps-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          folder.isTrash ? "pe-2.5" : "pe-1",
        )}
        onClick={() => onOpen(folder.id)}
        title={folder.name}
        type="button"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-start">
          {folder.name}
        </span>
      </button>

      {!folder.isTrash && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("actions.openMenu")}
                className="me-0.5 size-6 p-0 text-muted-foreground hover:text-foreground"
                variant="ghost"
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onEdit(folder)}>
              <PencilIcon />
              {t("actions.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(folder)}
              variant="destructive"
            >
              <TrashIcon />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export { ListFolders }
