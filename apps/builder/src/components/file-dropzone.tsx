"use client"

import type { FileType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Input } from "@aha.chat/ui/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { cn } from "@aha.chat/ui/lib/utils"
import { useTranslations } from "next-intl"
import {
  File,
  FileIcon,
  ImageIcon,
  ImagePlay,
  type LucideIcon,
  Undo2,
  Video,
  Volume2,
  X,
} from "lucide-react"
import Image from "next/image"
import { type SVGProps, useState } from "react"
import Dropzone from "react-dropzone"
import { toast } from "sonner"

type FileDropzoneConfigs = {
  uploadKeyName: string
  linkKeyName: string
  accept: Record<string, string[]>
  maxSize: number
  isCard: boolean
}

type FileDropzoneProps = {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  register: any
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  unregister?: any
  parentName: string
  type?: FileType
  mode?: "file" | "link"
  configs?: Partial<FileDropzoneConfigs>
  onMode?: (mode: "file" | "link") => void
  onRemove?: () => void
  onDrop?: (file: File) => void
}

function UploadIcon({
  type,
  ...props
}: { type?: FileType; size: number } & SVGProps<SVGSVGElement>) {
  const uploadIcons: Record<FileType, { icon: LucideIcon }> = {
    video: {
      icon: Video,
    },
    file: {
      icon: File,
    },
    audio: {
      icon: Volume2,
    },
    gif: {
      icon: ImagePlay,
    },
    image: {
      icon: ImageIcon,
    },
  }
  const dyanmicIcon = uploadIcons[type ?? "image"]

  return <dyanmicIcon.icon {...props} />
}

export default function FileDropzone({
  register,
  unregister,
  parentName,
  type = "image",
  mode = "file",
  configs: {
    uploadKeyName = "texts.or",
    linkKeyName = "actions.insertLink",
    accept = { "image/*": [] },
    maxSize = 10,
    isCard = false,
  } = {},
  onMode,
  onRemove,
  onDrop,
}: FileDropzoneProps) {
  const [preview, setPreview] = useState("")
  const [fileMode, setFileMode] = useState<"file" | "link">(mode)
  const t = useTranslations()

  const _validateSize = (file: File) => file.size > maxSize * 1024 * 1024

  const _videoPreview = (file: File) => {
    const video: HTMLVideoElement = document.createElement("video")
    const canvas: HTMLCanvasElement = document.createElement("canvas")
    const ctx: CanvasRenderingContext2D = canvas.getContext(
      "2d",
    ) as CanvasRenderingContext2D

    const fileURL = URL.createObjectURL(file)
    video.src = fileURL

    video.addEventListener("loadeddata", () => {
      video.currentTime = 1
    })

    video.addEventListener("seeked", () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      setPreview(canvas.toDataURL("image/png"))
      URL.revokeObjectURL(fileURL)
    })

    video.addEventListener("error", () => {
      toast(t("messages.videoError"))
      URL.revokeObjectURL(fileURL)
    })
  }

  const _imagePreview = (file: File) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.onerror = () => {
      toast.error(t("messages.failedToPreviewImage"))
    }
    reader.readAsDataURL(file)
  }

  const _onDrop = ([file]: File[]) => {
    if (file) {
      if (_validateSize(file)) {
        return toast(t("validation.maxSize"))
      }

      if (file.type.startsWith("image/")) {
        _imagePreview(file)
      } else if (file.type.startsWith("video/")) {
        _videoPreview(file)
      } else {
        setPreview(file.name)
      }

      onDrop?.(file)
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const _onRemove = (e: any) => {
    e.stopPropagation()
    setPreview("")
    onRemove?.()
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const _onMode = (e: any) => {
    e.stopPropagation()
    setFileMode(fileMode === "file" ? "link" : "file")
    if (fileMode === "link") {
      unregister(`${parentName}.file`)
    } else {
      unregister(`${parentName}.url`)
    }
    onMode?.(fileMode)
  }

  const _noFile = () => {
    return (
      <div className="flex flex-col items-center">
        <UploadIcon className="text-gray-500" size={30} type={type} />
        <div>
          {t("actions.selectFile")}
          {!isCard && (
            <>
              {t("texts.or")}
              {"\u00A0"}
              <Button
                className="p-0 text-destructive"
                onClick={_onMode}
                variant="link"
              >
                {t("actions.insertLink")}
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  const _hasFile = () => {
    if (type === "image") {
      return (
        <>
          <Image
            alt="Thumbnail"
            className="h-full w-full object-cover"
            src={preview}
          />
          <div className="absolute top-1 right-1 z-10">
            <Button
              className="size-5 rounded-full"
              onClick={_onRemove}
              size="icon"
              variant="outline"
            >
              <X size={10} />
            </Button>
          </div>
        </>
      )
    }
    return (
      <div className="flex flex-col gap-2 items-center px-4">
        <FileIcon />
        <span className="text-sm">{preview}</span>
      </div>
    )
  }

  const dropZone = () => {
    return (
      <Dropzone accept={accept} maxFiles={1} onDrop={_onDrop}>
        {({ getRootProps, getInputProps }) => (
          <section>
            <div {...getRootProps()}>
              <Input {...getInputProps()} />
              <div
                className={cn(
                  "relative flex h-36 flex-col items-center justify-center overflow-hidden hover:cursor-pointer",
                  preview ? "border-solid" : "border-dashed",
                  isCard
                    ? ""
                    : "rounded-lg border-2 hover:border-blue-500 hover:border-solid",
                )}
              >
                {preview ? _hasFile() : _noFile()}
              </div>
            </div>
          </section>
        )}
      </Dropzone>
    )
  }

  const inputLink = () => {
    return (
      <div className="flex flex-col">
        <div className="relative mb-2 flex items-center justify-center gap-2">
          <UploadIcon size={25} />
          <span className="capitalize">{type}</span>
          <div className="absolute right-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={_onMode} variant="link">
                    <Undo2 size={20} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload File</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <Input
          className="rounded-full"
          placeholder={t("fields.insertLink.label")}
          {...register(`${parentName}.url`)}
        />
      </div>
    )
  }

  return fileMode === "file" ? dropZone() : inputLink()
}
