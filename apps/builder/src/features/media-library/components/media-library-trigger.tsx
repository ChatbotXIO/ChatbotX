"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ImageIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useState, useTransition } from "react"
import { listMediaLibraryFiles } from "../queries/files"
import { listMediaLibraryFolders } from "../queries/folders"
import type { ListFilesResponse, ListFoldersResponse } from "../schemas"
import { MediaLibraryDialog } from "./media-library-dialog"

type MediaFile = ListFilesResponse["data"][number]

type MediaLibraryTriggerProps = {
  workspaceId: string
  onSelect: (file: MediaFile) => void
  children?: React.ReactNode
}

export function MediaLibraryTrigger({
  workspaceId,
  onSelect,
  children,
}: MediaLibraryTriggerProps) {
  const t = useTranslations("mediaLibrary")
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [folders, setFolders] = useState<ListFoldersResponse["data"]>([])
  const [files, setFiles] = useState<ListFilesResponse["data"]>([])
  const [searchQuery, setSearchQuery] = useState("")

  const loadSection = useCallback(
    (
      section: "recent" | "favourite" | { folderId: string },
      search?: string,
    ) => {
      startTransition(async () => {
        let filterValue: "recent" | "favourite" | undefined
        if (section === "recent") {
          filterValue = "recent"
        } else if (section === "favourite") {
          filterValue = "favourite"
        }
        const folderIdValue =
          typeof section === "object" ? section.folderId : undefined

        const [foldersData, filesData] = await Promise.all([
          listMediaLibraryFolders({ workspaceId }),
          listMediaLibraryFiles({
            workspaceId,
            filter: filterValue,
            folderId: folderIdValue,
            search: search ?? searchQuery,
          }),
        ])
        setFolders(foldersData.data)
        setFiles(filesData.data)
      })
    },
    [workspaceId, searchQuery],
  )

  const handleOpen = () => {
    setOpen(true)
    loadSection("recent", "")
  }

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      loadSection("recent", query)
    },
    [loadSection],
  )

  return (
    <>
      {children ? (
        <button className="cursor-pointer" onClick={handleOpen} type="button">
          {children}
        </button>
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
        isLoading={isPending}
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
        open={open}
        searchQuery={searchQuery}
        workspaceId={workspaceId}
      />
    </>
  )
}
