"use client"

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Folder, FolderType } from "@ahachat.ai/database"
import { FolderIcon, PencilIcon, TrashIcon } from "lucide-react"
import { parseAsString, useQueryState } from "nuqs"
import { Fragment, use, useState } from "react"
import { DeleteFolderDialog } from "./delete-folder-dialog"
import { EditFolderDialog } from "./edit-folder-dialog"
import { getCurrentFolder, getFolders } from "./queries"

interface ListFoldersProps {
  chatbotId: string
  folderType: FolderType,
  promises: Promise<[
    Awaited<ReturnType<typeof getCurrentFolder>>,
    Awaited<ReturnType<typeof getFolders>>,
  ]>
}

const ListFolders = ({ chatbotId, folderType, promises }: ListFoldersProps) => {
  const [{ folder, parents }, { data: folders }] = use(promises)
  const [, setFolderId] = useQueryState("folderId", parseAsString.withOptions({
    history: "replace",
    shallow: false,
  }))

  const [targetFolder, setTargetFolder] = useState<Folder | null>(null)

  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false)
  const onEdit = (folder: Folder) => {
    setTargetFolder(folder)
    setOpenEditDialog(true)
  }

  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false)
  const onDelete = (folder: Folder) => {
    setTargetFolder(folder)
    setOpenDeleteDialog(true)
  }

  return (
    <>
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList className="gap-1 sm:gap-1">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Button variant="ghost" className="p-0 hover:bg-transparent" onClick={() => setFolderId(null)}>
                Root
              </Button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {
            parents.map((parentFolder: Folder) => {
              return (
                <Fragment key={parentFolder.id}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Button variant="ghost" className="p-0 hover:bg-transparent" onClick={() => setFolderId(parentFolder.id)}>{parentFolder.name}</Button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </Fragment>
              )
            })
          }
          {
            folder && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Button variant="ghost" disabled className="p-0 hover:bg-transparent">{folder?.name ?? 'N/A'}</Button>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )
          }
        </BreadcrumbList>
      </Breadcrumb>

      {/* Folders list */}
      <ScrollArea className="max-h-44" type="auto">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 lg:grid-cols-5">
          {
            folders.map((folder: Folder) => {
              return (
                <div className="overflow-hidden" key={folder.id}>
                  <div className="group flex items-center border rounded-lg gap-2 hover:border-primary pr-3">
                    <Button
                      variant="ghost"
                      size="lg"
                      className="flex flex-1 pl-4 pr-0 overflow-hidden whitespace-nowrap text-ellipsis hover:bg-transparent"
                      onClick={() => setFolderId(folder.id)}
                    >
                      <FolderIcon />
                      <div className="overflow-hidden whitespace-nowrap text-ellipsis flex-1 text-left">{folder.name}</div>
                    </Button>
                    {!folder.isTrash && (
                      <>
                        <Button size="sm" variant="ghost" className="px-1 lg:hidden lg:group-hover:inline-flex" onClick={() => onEdit(folder)}>
                          <PencilIcon />
                        </Button>
                        <Button size="sm" variant="ghost" className="px-1 lg:hidden lg:group-hover:inline-flex" onClick={() => onDelete(folder)}>
                          <TrashIcon />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          }
        </div>
      </ScrollArea>

      <EditFolderDialog
        open={openEditDialog}
        onOpenChange={setOpenEditDialog}
        chatbotId={chatbotId}
        folder={targetFolder}
        onClose={console.log} />

      <DeleteFolderDialog
        open={openDeleteDialog}
        onOpenChange={setOpenDeleteDialog}
        chatbotId={chatbotId}
        folder={targetFolder}
      />
    </>
  )
}

export { ListFolders }
