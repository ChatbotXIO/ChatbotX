"use client"

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { getMimeTypeFromFile } from "@chatbotx.io/ui/lib/file-types"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ChevronLeftIcon,
  FolderIcon,
  HeartIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  TimerIcon,
  Trash2Icon,
} from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import {
  type ComponentPropsWithoutRef,
  useCallback,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"
import { createMediaLibraryFileAction } from "../actions/create-file.action"
import { createMediaLibraryFolderAction } from "../actions/create-folder.action"
import { deleteMediaLibraryFileAction } from "../actions/delete-file.action"
import { deleteMediaLibraryFolderAction } from "../actions/delete-folder.action"
import { recordMediaLibraryFileAccessAction } from "../actions/record-access.action"
import { renameMediaLibraryFolderAction } from "../actions/rename-folder.action"
import { toggleMediaLibraryFavouriteAction } from "../actions/toggle-favourite.action"
import type { ListFilesResponse, ListFoldersResponse } from "../schemas"

type MediaFile = ListFilesResponse["data"][number]
type MediaFolder = ListFoldersResponse["data"][number]

type ActiveSection = "recent" | "favourite" | { folderId: string }

export type MediaLibraryDialogProps = Omit<
  ComponentPropsWithoutRef<typeof Dialog>,
  "onOpenChange"
> & {
  workspaceId: string
  folders: MediaFolder[]
  files: MediaFile[]
  onSelect?: (file: MediaFile) => void
  onSectionChange?: (section: ActiveSection) => void
  onSearch?: (query: string) => void
  searchQuery?: string
  isLoading?: boolean
  onOpenChange?: (open: boolean) => void
}

function FilePreview({ file }: { file: MediaFile }) {
  const isImage = file.mimeType.startsWith("image/")

  if (isImage) {
    return (
      <div className="relative h-[120px] w-full overflow-hidden rounded-md bg-muted">
        <Image alt={file.name} className="object-cover" fill src={file.url} />
      </div>
    )
  }

  return (
    <div className="flex h-[120px] w-full items-center justify-center rounded-md bg-muted">
      <FolderIcon className="size-10 text-muted-foreground" />
    </div>
  )
}

export function MediaLibraryDialog({
  workspaceId,
  folders,
  files,
  onSelect,
  onSectionChange,
  onSearch,
  searchQuery = "",
  isLoading = false,
  open,
  onOpenChange,
  ...props
}: MediaLibraryDialogProps) {
  const t = useTranslations("mediaLibrary")
  const tActions = useTranslations("actions")

  const [activeSection, setActiveSection] = useState<ActiveSection>("recent")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState("")
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null)
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)

  const activeFolderId =
    typeof activeSection === "object" ? activeSection.folderId : null

  const handleSectionChange = useCallback(
    (section: ActiveSection) => {
      setActiveSection(section)
      onSectionChange?.(section)
    },
    [onSectionChange],
  )

  const { execute: executeCreateFolder } = useAction(
    createMediaLibraryFolderAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        setNewFolderMode(false)
        setNewFolderName("")
      },
      onError: () => toast.error(t("newFolder")),
    },
  )

  const { execute: executeRenameFolder } = useAction(
    renameMediaLibraryFolderAction.bind(null, workspaceId),
    {
      onSuccess: () => setRenamingFolderId(null),
      onError: () => toast.error(tActions("rename")),
    },
  )

  const { execute: executeDeleteFolder, isPending: isDeletingFolder } =
    useAction(deleteMediaLibraryFolderAction.bind(null, workspaceId), {
      onSuccess: () => {
        setDeleteFolderId(null)
        if (activeFolderId === deleteFolderId) {
          handleSectionChange("recent")
        }
      },
      onError: () => toast.error(tActions("delete")),
    })

  const { execute: executeCreateFile } = useAction(
    createMediaLibraryFileAction.bind(null, workspaceId),
    {
      onError: () => toast.error(tActions("uploadFile")),
    },
  )

  const { execute: executeDeleteFile, isPending: isDeletingFile } = useAction(
    deleteMediaLibraryFileAction.bind(null, workspaceId),
    {
      onSuccess: () => setDeleteFileId(null),
      onError: () => toast.error(tActions("delete")),
    },
  )

  const { execute: executeToggleFavourite } = useAction(
    toggleMediaLibraryFavouriteAction.bind(null, workspaceId),
  )

  const { execute: executeRecordAccess } = useAction(
    recordMediaLibraryFileAccessAction.bind(null, workspaceId),
  )

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      return
    }
    executeCreateFolder({ name: newFolderName.trim() })
  }

  const handleRenameFolder = (folderId: string) => {
    if (!renameFolderName.trim()) {
      return
    }
    executeRenameFolder({ folderId, name: renameFolderName.trim() })
  }

  const handleSelectFile = (file: MediaFile) => {
    setSelectedFileId(file.id)
    executeRecordAccess(file.id)
    onSelect?.(file)
  }

  const handleDone = () => {
    const selected = files.find((f) => f.id === selectedFileId)
    if (selected) {
      onSelect?.(selected)
    }
    onOpenChange?.(false)
  }

  const folderFileCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const file of files) {
      if (file.folderId) {
        counts[file.folderId] = (counts[file.folderId] ?? 0) + 1
      }
    }
    return counts
  }, [files])

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open} {...props}>
        <DialogContent className="flex h-[80vh] max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            {!sidebarCollapsed && (
              <div className="flex w-[280px] flex-shrink-0 flex-col border-r bg-background">
                <div className="flex flex-col gap-1 p-3">
                  {/* Recent */}
                  <button
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 font-medium text-sm transition-colors",
                      activeSection === "recent"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                    onClick={() => handleSectionChange("recent")}
                    type="button"
                  >
                    <TimerIcon className="size-4" />
                    {t("recent")}
                  </button>

                  {/* Favourite */}
                  <button
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 font-medium text-sm transition-colors",
                      activeSection === "favourite"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                    onClick={() => handleSectionChange("favourite")}
                    type="button"
                  >
                    <HeartIcon className="size-4" />
                    {t("favourite")}
                  </button>
                </div>

                <div className="mx-3 border-t" />

                {/* Folders */}
                <ScrollArea className="flex-1 p-3">
                  <div className="flex flex-col gap-1">
                    {folders.map((folder) =>
                      renamingFolderId === folder.id ? (
                        <div
                          className="flex items-center gap-1 px-1"
                          key={folder.id}
                        >
                          <Input
                            autoFocus
                            className="h-8 flex-1 text-sm"
                            onBlur={() => {
                              if (renameFolderName.trim()) {
                                handleRenameFolder(folder.id)
                              } else {
                                setRenamingFolderId(null)
                              }
                            }}
                            onChange={(e) =>
                              setRenameFolderName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameFolder(folder.id)
                              }
                              if (e.key === "Escape") {
                                setRenamingFolderId(null)
                              }
                            }}
                            value={renameFolderName}
                          />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "group flex items-center gap-2 rounded-md px-3 py-2 font-medium text-sm transition-colors",
                            typeof activeSection === "object" &&
                              activeSection.folderId === folder.id
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent",
                          )}
                          key={folder.id}
                        >
                          <button
                            className="flex flex-1 items-center gap-2 truncate text-left"
                            onClick={() =>
                              handleSectionChange({ folderId: folder.id })
                            }
                            type="button"
                          >
                            <FolderIcon className="size-4 shrink-0" />
                            <span className="flex-1 truncate">
                              {folder.name}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-xs",
                                typeof activeSection === "object" &&
                                  activeSection.folderId === folder.id
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {folderFileCount[folder.id] ?? 0}
                            </span>
                          </button>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  className="hidden shrink-0 rounded p-0.5 hover:bg-accent group-hover:flex"
                                  type="button"
                                >
                                  <MoreVerticalIcon className="size-3.5" />
                                </button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setRenamingFolderId(folder.id)
                                  setRenameFolderName(folder.name)
                                }}
                              >
                                {tActions("rename")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteFolderId(folder.id)}
                              >
                                {t("deleteFolder")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ),
                    )}

                    {/* New folder input */}
                    {newFolderMode ? (
                      <div className="flex items-center gap-1 px-1">
                        <Input
                          autoFocus
                          className="h-8 flex-1 text-sm"
                          onBlur={() => {
                            if (newFolderName.trim()) {
                              handleCreateFolder()
                            } else {
                              setNewFolderMode(false)
                            }
                          }}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleCreateFolder()
                            }
                            if (e.key === "Escape") {
                              setNewFolderMode(false)
                              setNewFolderName("")
                            }
                          }}
                          placeholder={t("folderNamePlaceholder")}
                          value={newFolderName}
                        />
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-2 rounded-md border border-primary border-dashed px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-primary/5"
                        onClick={() => setNewFolderMode(true)}
                        type="button"
                      >
                        <PlusIcon className="size-4" />
                        {t("newFolder")}
                      </button>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Collapse toggle */}
            <div className="relative">
              <button
                className="absolute top-1/2 left-0 z-10 flex size-6 translate-x-[-50%] -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm"
                onClick={() => setSidebarCollapsed((c) => !c)}
                type="button"
              >
                <ChevronLeftIcon
                  className={cn(
                    "size-3 transition-transform",
                    sidebarCollapsed && "rotate-180",
                  )}
                />
              </button>
            </div>

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Search */}
              <div className="p-4 pb-2">
                <div className="relative">
                  <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="rounded-full pl-9"
                    onChange={(e) => onSearch?.(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    value={searchQuery}
                  />
                </div>
              </div>

              {/* File grid */}
              <ScrollArea className="flex-1 p-4">
                {files.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    {t("noFiles")}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {files.map((file) => (
                      <button
                        className={cn(
                          "group relative w-full cursor-pointer rounded-lg border-2 p-2 text-left transition-all hover:border-primary",
                          selectedFileId === file.id
                            ? "border-primary bg-primary/5"
                            : "border-transparent",
                        )}
                        key={file.id}
                        onClick={() => handleSelectFile(file)}
                        type="button"
                      >
                        <FilePreview file={file} />
                        <p className="mt-1 truncate text-muted-foreground text-xs">
                          {file.name}
                        </p>

                        {/* File actions */}
                        <div className="absolute top-1 right-1 hidden gap-1 group-hover:flex">
                          <button
                            className="rounded bg-background/80 p-1 shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              executeToggleFavourite(file.id)
                            }}
                            title={
                              file.isFavourite
                                ? t("removeFromFavourites")
                                : t("addToFavourites")
                            }
                            type="button"
                          >
                            <HeartIcon
                              className={cn(
                                "size-3",
                                file.isFavourite && "fill-red-500 text-red-500",
                              )}
                            />
                          </button>
                          <button
                            className="rounded bg-background/80 p-1 shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteFileId(file.id)
                            }}
                            title={t("deleteFile")}
                            type="button"
                          >
                            <Trash2Icon className="size-3 text-destructive" />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="border-t px-6 py-3">
            <div className="flex w-full items-center justify-between">
              <DirectUploadButton
                accept="image/*,video/*,audio/*,application/*"
                label={t("upload")}
                maxSize={52_428_800} // 50MB
                onUploadError={(error, file) => {
                  toast.error(t("uploadFailed", { name: file.name }), {
                    description: error.message,
                  })
                }}
                onUploadSuccess={(filePath, file) => {
                  const mimeType = getMimeTypeFromFile(file)
                  executeCreateFile({
                    folderId: activeFolderId,
                    name: file.name,
                    path: filePath,
                    mimeType,
                    size: file.size,
                  })
                }}
                uploadPath={`public/space/${workspaceId}/media-library${activeFolderId ? `/${activeFolderId}` : ""}`}
              />
              <Button onClick={handleDone}>{t("done")}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirm */}
      <AlertDialog
        onOpenChange={(open) => !open && setDeleteFolderId(null)}
        open={!!deleteFolderId}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteFolder")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteFolderDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingFolder}
              onClick={() =>
                deleteFolderId && executeDeleteFolder(deleteFolderId)
              }
            >
              {tActions("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete file confirm */}
      <AlertDialog
        onOpenChange={(open) => !open && setDeleteFileId(null)}
        open={!!deleteFileId}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteFile")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteFileDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingFile}
              onClick={() => deleteFileId && executeDeleteFile(deleteFileId)}
            >
              {tActions("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
