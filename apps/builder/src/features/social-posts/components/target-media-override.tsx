"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { ImagePlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import {
  type ComposerMedia,
  fromLibraryFile,
  type LibraryFile,
} from "../lib/composer-state"

/**
 * "Different files for this channel": the destination publishes its own files
 * instead of the shared ones. An empty list is allowed: the channel then
 * publishes without files.
 */
export const TargetMediaOverride = ({
  disabled,
  maxMedia,
  media,
  onChange,
  workspaceId,
}: {
  disabled: boolean
  /** The most files this destination's content type takes; `undefined` = no known limit. */
  maxMedia: number | undefined
  /** The destination's own files; `null` = it follows the shared files. */
  media: ComposerMedia[] | null
  onChange: (media: ComposerMedia[] | null) => void
  workspaceId: string
}) => {
  const t = useTranslations("composer")
  const own = media ?? []
  const known = new Set(own.map((item) => item.id))
  const isFull = maxMedia !== undefined && own.length >= maxMedia
  const add = (files: LibraryFile[]) => {
    const added = [
      ...own,
      ...files.filter((file) => !known.has(file.id)).map(fromLibraryFile),
    ]
    onChange(maxMedia === undefined ? added : added.slice(0, maxMedia))
  }

  return (
    <div className="space-y-2">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control */}
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={media !== null}
          disabled={disabled}
          onCheckedChange={(enabled) => onChange(enabled ? [] : null)}
        />
        {t("targetMediaOwn")}
      </label>
      {media === null ? null : (
        <div className="space-y-2">
          {media.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("targetMediaNone")}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {media.map((item) => (
                <li
                  className="relative size-16 overflow-hidden rounded-lg border bg-muted"
                  key={item.id ?? item.url}
                >
                  {item.kind === "video" ? (
                    <video
                      className="size-full object-cover"
                      muted
                      preload="metadata"
                      src={item.url}
                    />
                  ) : (
                    // biome-ignore lint/performance/noImgElement: workspace media thumbnail
                    <img
                      alt={item.name}
                      className="size-full object-cover"
                      height={64}
                      src={item.url}
                      width={64}
                    />
                  )}
                  <button
                    aria-label={t("removeMedia")}
                    className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 shadow outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    disabled={disabled}
                    onClick={() =>
                      onChange(media.filter((file) => file !== item))
                    }
                    type="button"
                  >
                    <XIcon className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MediaLibraryTrigger
            multiple
            onSelect={(file) => add([file])}
            onSelectMultiple={add}
            workspaceId={workspaceId}
          >
            <Button
              disabled={disabled || isFull}
              size="sm"
              type="button"
              variant="outline"
            >
              <ImagePlusIcon />
              {t("addMedia")}
            </Button>
          </MediaLibraryTrigger>
        </div>
      )}
    </div>
  )
}
