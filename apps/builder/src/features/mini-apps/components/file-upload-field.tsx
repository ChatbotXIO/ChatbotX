"use client"

import {
  MINI_APP_DEFAULT_DOCUMENT_MIME_TYPES,
  MINI_APP_MAX_UPLOADS_PER_INPUT,
  MINI_APP_PHOTO_MIME_TYPES,
  type MiniAppFileAnswer,
  type MiniAppNode,
} from "@chatbotx.io/mini-app"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { FileTextIcon, ImageIcon, Loader2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { createContext, useContext, useId, useRef, useState } from "react"

export type MiniAppUploadErrorCode =
  | "empty"
  | "too_large"
  | "type_not_allowed"
  | "unknown_input"
  | "rate_limited"
  | "not_found"
  | "forbidden"
  | "invalid_request"
  | "upload_failed"

/** Uploads one file and reports progress (0–1); rejects with an error code. */
export type MiniAppUploader = (input: {
  inputName: string
  file: File
  onProgress: (fraction: number) => void
}) => Promise<MiniAppFileAnswer>

/**
 * Supplied by the public page. Without it (the editor preview) files are only
 * previewed locally, never uploaded.
 */
export const MiniAppUploaderContext = createContext<MiniAppUploader | null>(
  null,
)

const uploadErrorKey = {
  empty: "miniApps.upload.errors.empty",
  too_large: "miniApps.upload.errors.too_large",
  type_not_allowed: "miniApps.upload.errors.type_not_allowed",
  unknown_input: "miniApps.upload.errors.upload_failed",
  rate_limited: "miniApps.upload.errors.rate_limited",
  not_found: "miniApps.upload.errors.upload_failed",
  forbidden: "miniApps.upload.errors.upload_failed",
  invalid_request: "miniApps.upload.errors.upload_failed",
  upload_failed: "miniApps.upload.errors.upload_failed",
} as const satisfies Record<MiniAppUploadErrorCode, string>

const isUploadErrorCode = (value: unknown): value is MiniAppUploadErrorCode =>
  typeof value === "string" && value in uploadErrorKey

const readNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

/** Local stand-in for the editor preview, so its submit shows a file answer. */
const previewUpload: MiniAppUploader = ({ file }) =>
  Promise.resolve({
    uploadId: `preview-${file.name}`,
    url: URL.createObjectURL(file),
    name: file.name,
    mimeType: file.type,
    size: file.size,
  })

const acceptedTypes = (node: MiniAppNode): readonly string[] => {
  if (node.type === "PhotoPicker") {
    return MINI_APP_PHOTO_MIME_TYPES
  }
  const configured = node.props["allowed-mime-types"]
  return Array.isArray(configured) && configured.length > 0
    ? (configured as string[])
    : MINI_APP_DEFAULT_DOCUMENT_MIME_TYPES
}

type Pending = { key: string; name: string; progress: number }

export function FileUploadField({
  node,
  value,
  onChange,
  disabled,
}: {
  node: MiniAppNode
  value: MiniAppFileAnswer[]
  onChange: (files: MiniAppFileAnswer[]) => void
  disabled: boolean
}) {
  const t = useTranslations()
  const inputId = useId()
  const upload = useContext(MiniAppUploaderContext) ?? previewUpload
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState<string | null>(null)
  // Uploads finish one by one; keep the latest list to append to.
  const filesRef = useRef(value)
  filesRef.current = value

  const isPhoto = node.type === "PhotoPicker"
  const name = typeof node.props.name === "string" ? node.props.name : ""
  const maxFiles = Math.min(
    readNumber(
      node.props[isPhoto ? "max-uploaded-photos" : "max-uploaded-documents"],
      MINI_APP_MAX_UPLOADS_PER_INPUT,
    ),
    MINI_APP_MAX_UPLOADS_PER_INPUT,
  )
  const accept = acceptedTypes(node).join(",")
  const capture =
    isPhoto && node.props["photo-source"] === "camera"
      ? "environment"
      : undefined
  const remaining = maxFiles - value.length - pending.length

  const startUploads = (files: File[]) => {
    setError(null)
    for (const file of files.slice(0, Math.max(remaining, 0))) {
      const key = `${file.name}-${file.size}-${Math.random()}`
      setPending((current) => [
        ...current,
        { key, name: file.name, progress: 0 },
      ])
      upload({
        inputName: name,
        file,
        onProgress: (progress) =>
          setPending((current) =>
            current.map((item) =>
              item.key === key ? { ...item, progress } : item,
            ),
          ),
      })
        .then((uploaded) => onChange([...filesRef.current, uploaded]))
        .catch((reason: unknown) => {
          const code = isUploadErrorCode(reason) ? reason : "upload_failed"
          setError(`${file.name}: ${t(uploadErrorKey[code])}`)
        })
        .finally(() =>
          setPending((current) => current.filter((item) => item.key !== key)),
        )
    }
  }

  const Icon = isPhoto ? ImageIcon : FileTextIcon
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 || pending.length > 0 ? (
        <div
          className={cn(
            "gap-2",
            isPhoto ? "grid grid-cols-3" : "flex flex-col",
          )}
        >
          {value.map((file) => (
            <div
              className="relative rounded-md border border-[#d1d7db] bg-white"
              key={file.uploadId}
            >
              {file.mimeType.startsWith("image/") ? (
                // biome-ignore lint/performance/noImgElement: visitor-uploaded preview
                <img
                  alt={file.name}
                  className="aspect-square w-full rounded-md object-cover"
                  height={96}
                  src={file.url}
                  width={96}
                />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 text-[#111b21] text-[14px]">
                  <FileTextIcon className="size-4 shrink-0 text-[#008069]" />
                  <span className="truncate">{file.name}</span>
                </div>
              )}
              <button
                aria-label={t("miniApps.upload.remove")}
                className="absolute end-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    value.filter((item) => item.uploadId !== file.uploadId),
                  )
                }
                type="button"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
          {pending.map((item) => (
            <div
              className="flex flex-col justify-center gap-1 rounded-md border border-[#d1d7db] border-dashed p-2"
              key={item.key}
            >
              <span className="flex items-center gap-1 truncate text-[#667781] text-[12px]">
                <Loader2Icon className="size-3 shrink-0 animate-spin" />
                {item.name}
              </span>
              <div className="h-1 overflow-hidden rounded-full bg-[#e9edef]">
                <div
                  className="h-full bg-[#008069] transition-all"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {remaining > 0 ? (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md border border-[#d1d7db] border-dashed px-3 py-3 text-[#008069] text-[14px]",
            disabled && "pointer-events-none opacity-60",
          )}
          htmlFor={inputId}
        >
          <Icon className="size-4" />
          {t(
            isPhoto
              ? "miniApps.upload.choosePhotos"
              : "miniApps.upload.chooseDocuments",
          )}
          <span className="ms-auto text-[#667781] text-[12px]">
            {t("miniApps.upload.count", { count: value.length, max: maxFiles })}
          </span>
        </label>
      ) : null}
      <input
        accept={accept}
        capture={capture}
        className="hidden"
        disabled={disabled || remaining <= 0}
        id={inputId}
        multiple={maxFiles > 1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          startUploads(files)
        }}
        type="file"
      />
      {error ? (
        <span className="text-[#ea0038] text-[12px]">{error}</span>
      ) : null}
    </div>
  )
}
