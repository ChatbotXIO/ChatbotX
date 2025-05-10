"use client"

import { cn } from "@/components/lib/utils"
import { T } from "@tolgee/react"
import {
  File,
  Image,
  ImagePlay,
  Undo2,
  Video,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react"
import { useState, type SVGProps } from "react"
import Dropzone from "react-dropzone"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FileType } from "@ahachat.ai/database/types"

type FileDropzoneConfigs = {
  uploadKeyName: string
  linkKeyName: string
  accept: Record<string, string[]>
  maxSize: number
  isCard: boolean
}

interface FileDropzoneProps {
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
    [FileType.VIDEO]: {
      icon: Video,
    },
    [FileType.DOCUMENT]: {
      icon: File,
    },
    [FileType.AUDIO]: {
      icon: Volume2,
    },
    [FileType.GIF]: {
      icon: ImagePlay,
    },
    [FileType.IMAGE]: {
      icon: Image,
    },
  }
  const dyanmicIcon = uploadIcons[type ?? FileType.IMAGE]

  return <dyanmicIcon.icon {...props} />
}

export default function FileDropzone({
  register,
  unregister,
  parentName,
  type = FileType.IMAGE,
  mode = "file",
  configs: {
    uploadKeyName = "common.uploadImageOr",
    linkKeyName = "common.insertLink",
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
      toast("Video error")
      URL.revokeObjectURL(fileURL)
    })
  }

  const _imagePreview = (file: File) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const _onDrop = ([file]: File[]) => {
    if (file) {
      if (_validateSize(file)) {
        return toast("common.upload.fileMaxSize")
      }

      if (file.type.includes(FileType.VIDEO)) {
        _videoPreview(file)
      }

      if (file.type.includes(FileType.IMAGE)) {
        _imagePreview(file)
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
        <UploadIcon type={type} size={30} className="text-gray-500" />
        <div>
          <T keyName={uploadKeyName} />
          {!isCard && (
            <>
              {"\u00A0"}
              <Button
                variant="link"
                onClick={_onMode}
                className="p-0 text-destructive"
              >
                <T keyName={linkKeyName} />
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  const _hasFile = () => {
    return (
      <>
        <img
          src={preview}
          className="w-full h-full object-cover"
          alt="Thumbnail"
        />
        <div className="absolute top-1 right-1 z-10">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full size-5"
            onClick={_onRemove}
          >
            <X size={10} />
          </Button>
        </div>
      </>
    )
  }

  const dropZone = () => {
    return (
      <Dropzone maxFiles={1} accept={accept} onDrop={_onDrop}>
        {({ getRootProps, getInputProps }) => (
          <section>
            <div {...getRootProps()}>
              <Input {...getInputProps()} />
              <div
                className={cn(
                  "relative flex flex-col items-center h-36 overflow-hidden justify-center hover:cursor-pointer",
                  preview ? "border-solid" : "border-dashed",
                  isCard
                    ? ""
                    : "border-2 rounded-lg hover:border-solid hover:border-blue-500",
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
        <div className="flex items-center justify-center gap-2 mb-2 relative">
          <UploadIcon size={25} />
          <span className="capitalize">{type}</span>
          <div className="absolute right-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="link" onClick={_onMode}>
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
          placeholder="Insert link"
          {...register(`${parentName}.url`)}
        />
      </div>
    )
  }

  return fileMode === "file" ? dropZone() : inputLink()
}
