"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ImageIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useRef, useState, useTransition } from "react"
import { listMediaLibraryFiles } from "../queries/files"
import { listMediaLibraryFolders } from "../queries/folders"
import {
  type ListFilesResponse,
  type ListFoldersResponse,
  MEDIA_LIBRARY_FILES_PAGE_SIZE,
} from "../schema"
import { MediaLibraryDialog } from "./media-library-dialog"

type MediaFile = ListFilesResponse["data"][number]
type MediaSection = "recent" | "favourite" | { folderId: string }

type MediaLibraryTriggerProps = {
  workspaceId: string
  onSelect: (file: MediaFile) => void
  // When set, the dialog opens in multi-select mode and "Done" confirms
  // every checked file via `onSelectMultiple` instead of requiring exactly
  // one file via `onSelect`.
  multiple?: boolean
  onSelectMultiple?: (files: MediaFile[]) => void
  // Base storage prefix new uploads made from this trigger are saved under.
  // Defaults to the shared media-library prefix inside MediaLibraryDialog.
  uploadPath?: string
  // The trigger merges its open behavior onto this element instead of
  // wrapping it, so it must not itself be a <button> nested elsewhere.
  children?: React.ReactElement
}

export function MediaLibraryTrigger({
  workspaceId,
  onSelect,
  multiple = false,
  onSelectMultiple,
  uploadPath,
  children,
}: MediaLibraryTriggerProps) {
  const t = useTranslations("mediaLibrary")
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [folders, setFolders] = useState<ListFoldersResponse["data"]>([])
  const [files, setFiles] = useState<ListFilesResponse["data"]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [hasMoreFiles, setHasMoreFiles] = useState(false)
  const sectionRef = useRef<MediaSection>("recent")
  const pageRef = useRef(1)
  const loadMoreInFlightRef = useRef(false)

  const fetchFilesPage = useCallback(
    (section: MediaSection, search: string, page: number) => {
      let filterValue: "recent" | "favourite" | undefined
      if (section === "recent") {
        filterValue = "recent"
      } else if (section === "favourite") {
        filterValue = "favourite"
      }
      const folderIdValue =
        typeof section === "object" ? section.folderId : undefined

      return listMediaLibraryFiles({
        workspaceId,
        filter: filterValue,
        folderId: folderIdValue,
        page,
        search,
      })
    },
    [workspaceId],
  )

  const loadSection = useCallback(
    (section: MediaSection, search?: string) => {
      sectionRef.current = section
      pageRef.current = 1
      const effectiveSearch = search ?? searchQuery
      startTransition(async () => {
        const [foldersData, filesData] = await Promise.all([
          listMediaLibraryFolders({ workspaceId }),
          fetchFilesPage(section, effectiveSearch, 1),
        ])
        setFolders(foldersData.data)
        setFiles(filesData.data)
        setHasMoreFiles(filesData.data.length === MEDIA_LIBRARY_FILES_PAGE_SIZE)
      })
    },
    [fetchFilesPage, searchQuery, workspaceId],
  )

  const loadMoreFiles = useCallback(() => {
    if (loadMoreInFlightRef.current || !hasMoreFiles) {
      return
    }
    loadMoreInFlightRef.current = true
    setIsLoadingMore(true)
    const nextPage = pageRef.current + 1

    fetchFilesPage(sectionRef.current, searchQuery, nextPage)
      .then((filesData) => {
        pageRef.current = nextPage
        setFiles((current) => [...current, ...filesData.data])
        setHasMoreFiles(filesData.data.length === MEDIA_LIBRARY_FILES_PAGE_SIZE)
      })
      .finally(() => {
        loadMoreInFlightRef.current = false
        setIsLoadingMore(false)
      })
  }, [fetchFilesPage, hasMoreFiles, searchQuery])

  const handleOpen = () => {
    setOpen(true)
    loadSection("recent", "")
  }

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      loadSection(sectionRef.current, query)
    },
    [loadSection],
  )

  return (
    <>
      {children ? (
        <ButtonPrimitive onClick={handleOpen} render={children} />
      ) : (
        <Button
          disabled={isPending}
          onClick={handleOpen}
          type="button"
          variant="outline"
        >
          <ImageIcon className="size-4" />
          {t("openMediaLibrary")}
        </Button>
      )}

      <MediaLibraryDialog
        files={files}
        folders={folders}
        hasMoreFiles={hasMoreFiles}
        isLoading={isPending}
        isLoadingMoreFiles={isLoadingMore}
        multiple={multiple}
        onFavouriteToggled={(fileId, isFavourite) =>
          setFiles((current) => {
            const updated = current.map((f) =>
              f.id === fileId ? { ...f, isFavourite } : f,
            )
            if (sectionRef.current === "favourite" && !isFavourite) {
              return updated.filter((f) => f.id !== fileId)
            }
            return updated
          })
        }
        onFileCreated={(file) => {
          setFiles((current) => [file, ...current])
          if (file.folderId) {
            setFolders((current) =>
              current.map((f) =>
                f.id === file.folderId
                  ? { ...f, fileCount: f.fileCount + 1 }
                  : f,
              ),
            )
          }
        }}
        onFileDeleted={(fileId) => {
          const deleted = files.find((f) => f.id === fileId)
          setFiles((current) => current.filter((f) => f.id !== fileId))
          if (deleted?.folderId) {
            setFolders((current) =>
              current.map((f) =>
                f.id === deleted.folderId
                  ? { ...f, fileCount: Math.max(0, f.fileCount - 1) }
                  : f,
              ),
            )
          }
        }}
        onFilesMoved={(fileIds, folderId) => {
          const idSet = new Set(fileIds)
          const movedFiles = files.filter((f) => idSet.has(f.id))

          setFiles((current) => {
            const updated = current.map((f) =>
              idSet.has(f.id) ? { ...f, folderId } : f,
            )
            const currentSection = sectionRef.current
            if (
              typeof currentSection === "object" &&
              currentSection.folderId !== folderId
            ) {
              return updated.filter((f) => !idSet.has(f.id))
            }
            return updated
          })

          setFolders((current) =>
            current.map((f) => {
              const movedOutCount = movedFiles.filter(
                (file) => file.folderId === f.id,
              ).length
              const movedInCount = f.id === folderId ? movedFiles.length : 0
              if (movedOutCount === 0 && movedInCount === 0) {
                return f
              }
              return {
                ...f,
                fileCount: Math.max(
                  0,
                  f.fileCount - movedOutCount + movedInCount,
                ),
              }
            }),
          )
        }}
        onFolderCreated={(folder) =>
          setFolders((current) =>
            [...current, folder].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
        onFolderDeleted={(folderId) => {
          setFolders((current) => current.filter((f) => f.id !== folderId))
          setFiles((current) => current.filter((f) => f.folderId !== folderId))
        }}
        onFolderRenamed={(folderId, name) =>
          setFolders((current) =>
            current
              .map((f) => (f.id === folderId ? { ...f, name } : f))
              .sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
        onLoadMore={loadMoreFiles}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) {
            setSearchQuery("")
          }
        }}
        onSearch={handleSearch}
        onSectionChange={(section) => loadSection(section)}
        onSelect={(file) => {
          onSelect(file)
          setOpen(false)
        }}
        onSelectMultiple={(selectedFiles) => {
          onSelectMultiple?.(selectedFiles)
          setOpen(false)
        }}
        open={open}
        searchQuery={searchQuery}
        uploadPath={uploadPath}
        workspaceId={workspaceId}
      />
    </>
  )
}
