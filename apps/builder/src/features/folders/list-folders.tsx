"use client"

import type { FolderModel, FolderType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { ScrollArea } from "@aha.chat/ui/components/ui/scroll-area"
import { parseAsString, useQueryState } from "@aha.chat/ui/lib/nuqs"
import { FolderIcon, PencilIcon, TrashIcon } from "lucide-react"
import { use, useState } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CreateFolderDialog } from "./create-folder-dialog"
import { DeleteFolderDialog } from "./delete-folder-dialog"
import { EditFolderDialog } from "./edit-folder-dialog"
import type { getCurrentFolder, getFolders } from "./queries"

type ListFoldersProps = {
  chatbotId: string
  folderType: FolderType
  promises: Promise<
    [
      Awaited<ReturnType<typeof getCurrentFolder>>,
      Awaited<ReturnType<typeof getFolders>>,
    ]
  >
}

const ListFolders = (props: ListFoldersProps) => {
  const { chatbotId, folderType, promises } = props

  const [{ folder, parents }, { data: folders }] = use(promises)
  const [_, setFolderId] = useQueryState(
    "folderId",
    parseAsString.withOptions({
      history: "push",
      shallow: false,
    }),
  )

  const [targetFolder, setTargetFolder] = useState<FolderModel | null>(null)

  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false)
  const onEdit = (selectedFolder: FolderModel) => {
    setTargetFolder(selectedFolder)
    setOpenEditDialog(true)
  }

  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false)
  const onDelete = (selectedFolder: FolderModel) => {
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
              ...parents.map((parentFolder: FolderModel) => ({
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

        <CreateFolderDialog chatbotId={chatbotId} folderType={folderType} />
      </div>

      {/* Folders list */}
      <ScrollArea className="max-h-44" type="auto">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {folders.map((folderItem: FolderModel) => (
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
        chatbotId={chatbotId}
        folder={targetFolder}
        onOpenChange={setOpenEditDialog}
        open={openEditDialog}
      />

      <DeleteFolderDialog
        chatbotId={chatbotId}
        folder={targetFolder}
        onOpenChange={setOpenDeleteDialog}
        open={openDeleteDialog}
      />
    </>
  )
}

export { ListFolders }
