"use client"

import type { FolderType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { FolderIcon, PencilIcon, TrashIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { use, useCallback, useState } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CreateFolderDialog } from "./create-folder-dialog"
import { DeleteFolderDialog } from "./delete-folder-dialog"
import { EditFolderDialog } from "./edit-folder-dialog"
import type { getCurrentFolder, listFolders } from "./queries"
import type { FolderResource } from "./schema/resource"

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

const ListFolders = (props: ListFoldersProps) => {
  const { workspaceId, folderType, promises } = props

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

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex">
        <div className="flex flex-1 flex-col justify-center">
          <AppBreadcrumb
            items={[
              {
                label: "Root",
                element: (
                  <Button
                    className="p-0 hover:bg-transparent"
                    onClick={() => setFolderId(null)}
                    variant="ghost"
                  >
                    Root
                  </Button>
                ),
              },
              ...parents.map((parentFolder: FolderResource) => ({
                label: parentFolder.name,
                element: (
                  <Button
                    className="p-0 hover:bg-transparent"
                    onClick={() => setFolderId(parentFolder.id)}
                    variant="ghost"
                  >
                    {parentFolder.name}
                  </Button>
                ),
                onClick: () => setFolderId(parentFolder.id),
              })),
              ...(folder
                ? [
                    {
                      label: folder?.name ?? "...",
                      element: (
                        <Button
                          className="p-0 hover:bg-transparent"
                          disabled
                          variant="ghost"
                        >
                          {folder.name}
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>

        <CreateFolderDialog folderType={folderType} workspaceId={workspaceId} />
      </div>

      {/* Folders list */}
      <ScrollArea className="max-h-44" type="auto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {folders.map((folderItem: FolderResource) => (
            <div className="overflow-hidden" key={folderItem.id}>
              <div className="group flex items-center gap-2 rounded-lg border pr-3 hover:border-primary">
                <Button
                  className="flex flex-1 overflow-hidden text-ellipsis whitespace-nowrap pr-0 pl-4 hover:bg-transparent"
                  onClick={() => setFolderId(folderItem.id)}
                  size="lg"
                  variant="ghost"
                >
                  <FolderIcon />
                  <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                    {folderItem.name}
                  </div>
                </Button>
                {!folderItem.isTrash && (
                  <>
                    <Button
                      className="px-1 lg:hidden lg:group-hover:inline-flex"
                      onClick={() => onEdit(folderItem)}
                      size="sm"
                      variant="ghost"
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      className="px-1 lg:hidden lg:group-hover:inline-flex"
                      onClick={() => onDelete(folderItem)}
                      size="sm"
                      variant="ghost"
                    >
                      <TrashIcon />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

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
    </>
  )
}

export { ListFolders }
