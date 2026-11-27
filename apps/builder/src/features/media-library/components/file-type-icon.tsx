import { cn } from "@chatbotx.io/ui/lib/utils"
import { FileIcon, VideoIcon, Volume2Icon } from "lucide-react"

/** Placeholder icon for a media file that has no image preview. */
export function FileTypeIcon({
  mimeType,
  className,
}: {
  mimeType: string
  className?: string
}) {
  const iconClassName = cn("size-10 text-muted-foreground", className)
  if (mimeType.startsWith("video/")) {
    return <VideoIcon className={iconClassName} />
  }
  if (mimeType.startsWith("audio/")) {
    return <Volume2Icon className={iconClassName} />
  }
  return <FileIcon className={iconClassName} />
}
