"use client"

import type { FlowResponseFileFailureReason } from "@chatbotx.io/sdk"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { FileTextIcon, TriangleAlertIcon } from "lucide-react"
import Image from "next/image"
import { useLocale, useTranslations } from "next-intl"
import type { WhatsappFlowResponseFile } from "../schema/flow-response"

const THUMBNAIL_SIZE_PX = 40
const BYTES_PER_KIB = 1024
/** What every browser can draw; HEIC, HEIF and TIFF would show a broken image. */
const THUMBNAIL_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
])
/** The thumbnail loads the original, so a big photo gets an icon instead. */
const THUMBNAIL_MAX_BYTES = 2 * BYTES_PER_KIB * BYTES_PER_KIB

type NotStoredFile = Exclude<WhatsappFlowResponseFile, { status: "stored" }>

/** How a file that has no stored copy shows, by why it has none. */
const NOT_STORED_VIEWS = {
  failed: { Icon: TriangleAlertIcon, toneClassName: "text-destructive" },
  unprocessed: { Icon: FileTextIcon, toneClassName: "text-muted-foreground" },
} as const satisfies Record<
  NotStoredFile["status"],
  { Icon: typeof FileTextIcon; toneClassName: string }
>

const failureReasonKeys = {
  too_large: "fileFailure.too_large",
  unsupported_type: "fileFailure.unsupported_type",
  download_failed: "fileFailure.download_failed",
} as const satisfies Record<FlowResponseFileFailureReason, string>

/** Largest unit first, so the first one a size reaches is the one shown. */
const SIZE_UNITS = [
  { unit: "megabyte", bytes: BYTES_PER_KIB * BYTES_PER_KIB },
  { unit: "kilobyte", bytes: BYTES_PER_KIB },
] as const
const BYTE_UNIT = { unit: "byte", bytes: 1 } as const

const formatFileSize = (bytes: number, locale: string): string => {
  const { unit, bytes: unitBytes } =
    SIZE_UNITS.find((candidate) => bytes >= candidate.bytes) ?? BYTE_UNIT
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  }).format(bytes / unitBytes)
}

/** Whether a file is shown as a small picture: a type every browser draws, and small. */
export const hasThumbnail = (file: {
  mimeType: string
  size: number
}): boolean =>
  THUMBNAIL_MIME_TYPES.has(file.mimeType) && file.size <= THUMBNAIL_MAX_BYTES

function StoredFile({
  file,
}: {
  file: Extract<WhatsappFlowResponseFile, { status: "stored" }>
}) {
  const locale = useLocale()
  return (
    <a
      className="flex min-w-0 items-center gap-2 text-primary hover:underline"
      href={file.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {hasThumbnail(file) ? (
        <Image
          alt=""
          className="size-10 shrink-0 rounded-md border object-cover"
          height={THUMBNAIL_SIZE_PX}
          // Short-lived storage links: no point optimizing and caching them.
          src={file.url}
          unoptimized
          width={THUMBNAIL_SIZE_PX}
        />
      ) : (
        <FileTextIcon aria-hidden className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
      <span className="shrink-0 text-muted-foreground text-xs">
        {formatFileSize(file.size, locale)}
      </span>
    </a>
  )
}

/** One file of a Flow answer: a link when it was kept, why not when it was not. */
export function FlowResponseFileItem({
  file,
}: {
  file: WhatsappFlowResponseFile
}) {
  const t = useTranslations("messages.flowResponse")

  if (file.status === "stored") {
    return <StoredFile file={file} />
  }
  const { Icon, toneClassName } = NOT_STORED_VIEWS[file.status]
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden className={cn("size-4 shrink-0", toneClassName)} />
      <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
      <span className={cn("shrink-0 text-xs", toneClassName)}>
        {file.status === "failed"
          ? t(failureReasonKeys[file.failureReason])
          : t("fileNotSaved")}
      </span>
    </div>
  )
}
