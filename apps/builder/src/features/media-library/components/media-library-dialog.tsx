"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
  FileIcon,
  FolderIcon,
  HeartIcon,
  Loader,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  TimerIcon,
  Trash2Icon,
  VideoIcon,
  Volume2Icon,
} from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { createMediaLibraryFileAction } from "../actions/create-file.action"
import { createMediaLibraryFolderAction } from "../actions/create-folder.action"
import { deleteMediaLibraryFileAction } from "../actions/delete-file.action"
import { deleteMediaLibraryFolderAction } from "../actions/delete-folder.action"
import { moveMediaLibraryFilesAction } from "../actions/move-files.action"
import { recordMediaLibraryFileAccessAction } from "../actions/record-access.action"
import { renameMediaLibraryFolderAction } from "../actions/rename-folder.action"
import { toggleMediaLibraryFavouriteAction } from "../actions/toggle-favourite.action"
import type { ListFilesResponse, ListFoldersResponse } from "../schema"

type MediaFile = ListFilesResponse["data"][number]
type MediaFolder = ListFoldersResponse["data"][number]

type ActiveSection = "recent" | "favourite" | { folderId: string }

const FILE_GRID_SCROLL_THRESHOLD = 200

export type MediaLibraryDialogProps = Omit<
  ComponentPropsWithoutRef<typeof Dialog>,
  "onOpenChange"
> & {
  workspaceId: string
  folders: MediaFolder[]
  files: MediaFile[]
  // Base storage prefix new uploads are saved under (folder id is still
  // appended below). Defaults to the shared media-library prefix — pass this
  // to keep a caller's uploads under its own feature-specific path.
  uploadPath?: string
  onSelect?: (file: MediaFile) => void
  // When set, "Done" confirms every checked file via `onSelectMultiple`
  // instead of requiring exactly one via `onSelect`.
  multiple?: boolean
  onSelectMultiple?: (files: MediaFile[]) => void
  onSectionChange?: (section: ActiveSection) => void
  onSearch?: (query: string) => void
  searchQuery?: string
  isLoading?: boolean
  hasMoreFiles?: boolean
  isLoadingMoreFiles?: boolean
  onLoadMore?: () => void
  onFileCreated?: (file: MediaFile) => void
  onFileDeleted?: (fileId: string) => void
  onFavouriteToggled?: (fileId: string, isFavourite: boolean) => void
  onFolderCreated?: (folder: MediaFolder) => void
  onFolderRenamed?: (folderId: string, name: string) => void
  onFolderDeleted?: (folderId: string) => void
  onFilesMoved?: (fileIds: string[], folderId: string | null) => void
  onOpenChange?: (open: boolean) => void
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("video/")) {
    return <VideoIcon className="size-10 text-muted-foreground" />
  }
  if (mimeType.startsWith("audio/")) {
    return <Volume2Icon className="size-10 text-muted-foreground" />
  }
  return <FileIcon className="size-10 text-muted-foreground" />
}

function FilePreview({
  file,
  priority = false,
}: {
  file: MediaFile
  priority?: boolean
}) {
  const isImage = file.mimeType.startsWith("image/")

  if (isImage) {
    return (
      <div className="relative h-[120px] w-full overflow-hidden rounded-md bg-muted">
        <Image
          alt={file.name}
          className="object-cover"
          fill
          priority={priority}
          sizes="160px"
          src={file.url}
        />
      </div>
    )
  }

  return (
    <div className="flex h-[120px] w-full items-center justify-center rounded-md bg-muted">
      <FileTypeIcon mimeType={file.mimeType} />
    </div>
  )
}

export function MediaLibraryDialog({
  workspaceId,
  folders,
  files,
  uploadPath,
  onSelect,
  multiple = false,
  onSelectMultiple,
  onSectionChange,
  onSearch,
  searchQuery = "",
  isLoading = false,
  hasMoreFiles = false,
  isLoadingMoreFiles = false,
  onLoadMore,
  onFileCreated,
  onFileDeleted,
  onFavouriteToggled,
  onFolderCreated,
  onFolderRenamed,
  onFolderDeleted,
  onFilesMoved,
  open,
  onOpenChange,
  ...props
}: MediaLibraryDialogProps) {
  const t = useTranslations("mediaLibrary")
  const tActions = useTranslations("actions")
  const fileGridScrollRootRef = useRef<HTMLDivElement>(null)

  const [activeSection, setActiveSection] = useState<ActiveSection>("recent")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState("")
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null)
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  const activeFolderId =
    typeof activeSection === "object" ? activeSection.folderId : null

  const handleSectionChange = useCallback(
    (section: ActiveSection) => {
      setActiveSection(section)
      onSectionChange?.(section)
    },
    [onSectionChange],
  )

  const { execute: executeCreateFolder, isPending: isCreatingFolder } =
    useAction(createMediaLibraryFolderAction.bind(null, workspaceId), {
      onSuccess: ({ data }) => {
        setNewFolderMode(false)
        setNewFolderName("")
        if (data) {
          onFolderCreated?.({ ...data, fileCount: 0 })
        }
      },
      onError: () => toast.error(t("newFolder")),
    })

  const { execute: executeRenameFolder } = useAction(
    renameMediaLibraryFolderAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        if (renamingFolderId) {
          onFolderRenamed?.(renamingFolderId, renameFolderName.trim())
        }
        setRenamingFolderId(null)
      },
      onError: () => toast.error(tActions("rename")),
    },
  )

  const { execute: executeDeleteFolder, isPending: isDeletingFolder } =
    useAction(deleteMediaLibraryFolderAction.bind(null, workspaceId), {
      onSuccess: () => {
        if (deleteFolderId) {
          onFolderDeleted?.(deleteFolderId)
        }
        setDeleteFolderId(null)
        if (activeFolderId === deleteFolderId) {
          handleSectionChange("recent")
        }
      },
      onError: () => toast.error(tActions("delete")),
    })

  const { executeAsync: executeCreateFile } = useAction(
    createMediaLibraryFileAction.bind(null, workspaceId),
    {
      onError: () => toast.error(tActions("uploadFile")),
    },
  )

  const { execute: executeDeleteFile, isPending: isDeletingFile } = useAction(
    deleteMediaLibraryFileAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        if (deleteFileId) {
          onFileDeleted?.(deleteFileId)
        }
        setDeleteFileId(null)
      },
      onError: () => toast.error(tActions("delete")),
    },
  )

  const { execute: executeToggleFavourite } = useAction(
    toggleMediaLibraryFavouriteAction.bind(null, workspaceId),
  )

  const { execute: executeRecordAccess } = useAction(
    recordMediaLibraryFileAccessAction.bind(null, workspaceId),
  )

  const { execute: executeMoveFiles } = useAction(
    moveMediaLibraryFilesAction.bind(null, workspaceId),
    {
      onSuccess: ({ input }) => {
        onFilesMoved?.(input.fileIds, input.folderId ?? null)
        setSelectedFileIds(new Set())
        setBulkSelectMode(false)
      },
      onError: () => toast.error(tActions("move")),
    },
  )

  const { executeAsync: executeDeleteFileAsync } = useAction(
    deleteMediaLibraryFileAction.bind(null, workspaceId),
  )

  const handleCreateFolder = () => {
    if (!newFolderName.trim() || isCreatingFolder) {
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
    const isCurrentlySelected = selectedFileIds.has(file.id)
    setSelectedFileIds((current) => {
      if (bulkSelectMode) {
        const next = new Set(current)
        if (next.has(file.id)) {
          next.delete(file.id)
        } else {
          next.add(file.id)
        }
        return next
      }

      // Outside bulk select mode, clicking a file replaces the selection
      // with just that file; clicking the selected file again deselects it.
      if (current.size === 1 && current.has(file.id)) {
        return new Set()
      }
      return new Set([file.id])
    })
    if (!isCurrentlySelected) {
      executeRecordAccess(file.id)
    }
  }

  const handleMoveSelected = (folderId: string | null) => {
    executeMoveFiles({ fileIds: [...selectedFileIds], folderId })
  }

  const handleBulkDelete = async () => {
    const ids = [...selectedFileIds]
    setIsBulkDeleting(true)
    try {
      const results = await Promise.all(
        ids.map((id) => executeDeleteFileAsync(id)),
      )
      for (const [index, id] of ids.entries()) {
        if (!results[index]?.serverError) {
          onFileDeleted?.(id)
        }
      }
      if (results.some((result) => result?.serverError)) {
        toast.error(tActions("delete"))
      }
    } finally {
      setIsBulkDeleting(false)
      setSelectedFileIds(new Set())
      setBulkSelectMode(false)
      setBulkDeleteConfirmOpen(false)
    }
  }

  const handleToggleBulkSelect = () => {
    if (bulkSelectMode) {
      // "Cancel": exit bulk select mode and clear every selection.
      setBulkSelectMode(false)
      setSelectedFileIds(new Set())
    } else {
      setBulkSelectMode(true)
    }
  }

  const handleSelect = () => {
    if (multiple) {
      if (selectedFileIds.size === 0) {
        return
      }
      onSelectMultiple?.(files.filter((f) => selectedFileIds.has(f.id)))
      setSelectedFileIds(new Set())
      setBulkSelectMode(false)
      onOpenChange?.(false)
      return
    }

    if (selectedFileIds.size > 1) {
      toast.error(t("selectOnlyOneFile"))
      return
    }
    const [selectedId] = selectedFileIds
    const selected = files.find((f) => f.id === selectedId)
    if (selected) {
      onSelect?.(selected)
    }
    onOpenChange?.(false)
  }

  useEffect(() => {
    if (!open) {
      setSelectedFileIds(new Set())
      setBulkSelectMode(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const root = fileGridScrollRootRef.current
    const viewport = root?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )
    if (!viewport) {
      return
    }

    const handleScroll = () => {
      const nearBottom =
        viewport.scrollTop + viewport.clientHeight >=
        viewport.scrollHeight - FILE_GRID_SCROLL_THRESHOLD

      if (nearBottom && hasMoreFiles && !isLoadingMoreFiles) {
        onLoadMore?.()
      }
    }

    viewport.addEventListener("scroll", handleScroll)
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [hasMoreFiles, isLoadingMoreFiles, onLoadMore, open])

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open} {...props}>
        <DialogContent
          className="flex h-[80vh] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            {!sidebarCollapsed && (
              <div className="flex w-[280px] flex-shrink-0 flex-col border-r bg-background">
                <div className="flex flex-col gap-1 p-3">
                  {/* Recent */}
                  <Button
                    className={cn(
                      "justify-start gap-2 font-medium",
                      activeSection === "recent"
                        ? "bg-primary text-primary-foreground hover:bg-primary"
                        : "hover:bg-accent",
                    )}
                    onClick={() => handleSectionChange("recent")}
                    type="button"
                    variant="ghost"
                  >
                    <TimerIcon className="size-4" />
                    {t("recent")}
                  </Button>

                  {/* Favourite */}
                  <Button
                    className={cn(
                      "justify-start gap-2 font-medium",
                      activeSection === "favourite"
                        ? "bg-primary text-primary-foreground hover:bg-primary"
                        : "hover:bg-accent",
                    )}
                    onClick={() => handleSectionChange("favourite")}
                    type="button"
                    variant="ghost"
                  >
                    <HeartIcon className="size-4" />
                    {t("favourite")}
                  </Button>
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
                        <Button
                          className={cn(
                            "group h-auto w-full justify-start gap-2 px-3 py-2 text-left font-medium hover:text-inherit",
                            typeof activeSection === "object" &&
                              activeSection.folderId === folder.id
                              ? "bg-primary text-primary-foreground hover:bg-primary"
                              : "hover:bg-accent",
                          )}
                          key={folder.id}
                          onClick={() =>
                            handleSectionChange({ folderId: folder.id })
                          }
                          type="button"
                          variant="ghost"
                        >
                          <FolderIcon className="size-4 shrink-0" />
                          <span className="flex-1 truncate">{folder.name}</span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-xs",
                              typeof activeSection === "object" &&
                                activeSection.folderId === folder.id
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {folder.fileCount}
                          </span>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              nativeButton={false}
                              render={
                                // biome-ignore lint/a11y/useKeyWithClickEvents: nativeButton={false} lets base-ui attach keyboard handling
                                // biome-ignore lint/a11y/useSemanticElements: a <button> can't nest inside the outer folder-row <button>
                                <div
                                  className={cn(
                                    buttonVariants({
                                      variant: "ghost",
                                      size: "icon",
                                    }),
                                    "size-auto shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100",
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <MoreVerticalIcon className="size-3.5" />
                                </div>
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
                        </Button>
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
                      <Button
                        className="justify-start gap-2 border border-primary border-dashed text-primary hover:bg-primary/5 hover:text-primary"
                        onClick={() => setNewFolderMode(true)}
                        type="button"
                        variant="ghost"
                      >
                        <PlusIcon className="size-4" />
                        {t("newFolder")}
                      </Button>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Collapse toggle */}
            <div className="relative">
              <Button
                className="absolute top-1/2 left-0 z-10 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background shadow-sm"
                onClick={() => setSidebarCollapsed((c) => !c)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronLeftIcon
                  className={cn(
                    "size-3 transition-transform",
                    sidebarCollapsed && "rotate-180",
                  )}
                />
              </Button>
            </div>

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Search */}
              <div className="flex items-center gap-2 p-4 pb-2">
                <div className="relative flex-1">
                  <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="rounded-full pl-9"
                    onChange={(e) => onSearch?.(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    value={searchQuery}
                  />
                </div>

                {selectedFileIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleToggleBulkSelect}
                      type="button"
                      variant="outline"
                    >
                      {bulkSelectMode ? tActions("cancel") : t("bulkSelect")}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button type="button" variant="default">
                            {tActions("move")}
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        {folders
                          .filter((folder) => folder.id !== activeFolderId)
                          .map((folder) => (
                            <DropdownMenuItem
                              key={folder.id}
                              onClick={() => handleMoveSelected(folder.id)}
                            >
                              {folder.name}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                      onClick={() => setBulkDeleteConfirmOpen(true)}
                      type="button"
                      variant="destructive"
                    >
                      {tActions("delete")}
                    </Button>
                  </div>
                )}
              </div>

              {/* File grid */}
              <div
                className="flex-1 overflow-hidden"
                ref={fileGridScrollRootRef}
              >
                <ScrollArea className="h-full p-4">
                  {files.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      {t("noFiles")}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {files.map((file, index) => (
                        <Button
                          className={cn(
                            "group relative h-auto w-full flex-col items-stretch justify-start gap-0 rounded-lg border-2 p-2 text-left hover:border-primary hover:bg-transparent dark:hover:bg-transparent",
                            selectedFileIds.has(file.id)
                              ? "border-primary bg-primary/5"
                              : "border-transparent",
                          )}
                          key={file.id}
                          onClick={() => handleSelectFile(file)}
                          type="button"
                          variant="ghost"
                        >
                          <FilePreview file={file} priority={index === 0} />
                          <p className="mt-1 truncate text-muted-foreground text-xs">
                            {file.name}
                          </p>

                          {/* File actions */}
                          <div className="absolute top-1 right-1 hidden gap-1 group-hover:flex">
                            {/* biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only secondary action, mirrors the codebase's existing pattern for nested actions inside a button */}
                            {/* biome-ignore lint/a11y/useSemanticElements: a <button> can't nest inside the outer file-card <button> */}
                            <div
                              className={cn(
                                buttonVariants({
                                  variant: "ghost",
                                  size: "icon",
                                }),
                                "size-auto rounded bg-background/80 p-1 shadow-sm",
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                executeToggleFavourite(file.id)
                                onFavouriteToggled?.(file.id, !file.isFavourite)
                              }}
                              role="button"
                              tabIndex={0}
                              title={
                                file.isFavourite
                                  ? t("removeFromFavourites")
                                  : t("addToFavourites")
                              }
                            >
                              <HeartIcon
                                className={cn(
                                  "size-3",
                                  file.isFavourite &&
                                    "fill-red-500 text-red-500",
                                )}
                              />
                            </div>
                            {/* biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only secondary action, mirrors the codebase's existing pattern for nested actions inside a button */}
                            {/* biome-ignore lint/a11y/useSemanticElements: a <button> can't nest inside the outer file-card <button> */}
                            <div
                              className={cn(
                                buttonVariants({
                                  variant: "ghost",
                                  size: "icon",
                                }),
                                "size-auto rounded bg-background/80 p-1 shadow-sm",
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteFileId(file.id)
                              }}
                              role="button"
                              tabIndex={0}
                              title={t("deleteFile")}
                            >
                              <Trash2Icon className="size-3 text-destructive" />
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  )}
                  {isLoadingMoreFiles && (
                    <div className="flex items-center justify-center py-4">
                      <Loader
                        aria-hidden="true"
                        className="size-4 animate-spin text-muted-foreground"
                      />
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="mx-0 mb-0 border-t px-6 py-3">
            <div className="flex w-full items-center justify-between">
              <DirectUploadButton
                accept="image/png,image/jpeg,image/gif,video/mp4,audio/*,application/*"
                label={t("upload")}
                maxSize={52_428_800} // 50MB
                multiple
                onUploadError={(error, file) => {
                  toast.error(t("uploadFailed", { name: file.name }), {
                    description: error.message,
                  })
                }}
                onUploadSuccess={async (filePath, file, publicUrl) => {
                  const mimeType = getMimeTypeFromFile(file)
                  const result = await executeCreateFile({
                    folderId: activeFolderId,
                    name: file.name,
                    path: filePath,
                    mimeType,
                    size: file.size,
                  })
                  if (result?.data) {
                    onFileCreated?.({ ...result.data, url: publicUrl })
                  }
                }}
                uploadPath={`${uploadPath ?? `public/space/${workspaceId}/media-library`}${activeFolderId ? `/${activeFolderId}` : ""}`}
                workspaceId={workspaceId}
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => onOpenChange?.(false)}
                  type="button"
                  variant="outline"
                >
                  {tActions("cancel")}
                </Button>
                <Button onClick={handleSelect}>{t("select")}</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirm */}
      <Dialog
        onOpenChange={(open) => !open && setDeleteFolderId(null)}
        open={!!deleteFolderId}
      >
        <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteFolder")}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-sm/6">
              {t("confirmDeleteFolderDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:space-x-0">
            <DialogClose
              render={
                <Button
                  onClick={() => setDeleteFolderId(null)}
                  size="sm"
                  variant="ghost"
                >
                  {tActions("cancel")}
                </Button>
              }
            />
            <Button
              aria-label="Delete folder"
              disabled={isDeletingFolder}
              onClick={() =>
                deleteFolderId && executeDeleteFolder(deleteFolderId)
              }
              size="sm"
              variant="destructive"
            >
              {isDeletingFolder && (
                <Loader
                  aria-hidden="true"
                  className="me-2 size-4 animate-spin"
                />
              )}
              {tActions("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete file confirm */}
      <Dialog
        onOpenChange={(open) => !open && setDeleteFileId(null)}
        open={!!deleteFileId}
      >
        <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteFile")}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-sm/6">
              {t("confirmDeleteFileDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:space-x-0">
            <DialogClose
              render={
                <Button
                  onClick={() => setDeleteFileId(null)}
                  size="sm"
                  variant="ghost"
                >
                  {tActions("cancel")}
                </Button>
              }
            />
            <Button
              aria-label="Delete file"
              disabled={isDeletingFile}
              onClick={() => deleteFileId && executeDeleteFile(deleteFileId)}
              size="sm"
              variant="destructive"
            >
              {isDeletingFile && (
                <Loader
                  aria-hidden="true"
                  className="me-2 size-4 animate-spin"
                />
              )}
              {tActions("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete files confirm */}
      <Dialog
        onOpenChange={(isOpen) => !isOpen && setBulkDeleteConfirmOpen(false)}
        open={bulkDeleteConfirmOpen}
      >
        <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
          <DialogHeader>
            <DialogTitle>
              {t("confirmDeleteFiles", { count: selectedFileIds.size })}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-sm/6">
              {t("confirmDeleteFilesDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:space-x-0">
            <DialogClose
              render={
                <Button
                  onClick={() => setBulkDeleteConfirmOpen(false)}
                  size="sm"
                  variant="ghost"
                >
                  {tActions("cancel")}
                </Button>
              }
            />
            <Button
              aria-label="Delete files"
              disabled={isBulkDeleting}
              onClick={handleBulkDelete}
              size="sm"
              variant="destructive"
            >
              {isBulkDeleting && (
                <Loader
                  aria-hidden="true"
                  className="me-2 size-4 animate-spin"
                />
              )}
              {tActions("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
