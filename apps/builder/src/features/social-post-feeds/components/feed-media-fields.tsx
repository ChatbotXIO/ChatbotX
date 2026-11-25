"use client"

import {
  socialPostFeedMediaModes,
  socialPostFeedNoImageFallbacks,
  socialPostFeedPostAs,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { ImageIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import type { FeedDraft } from "../lib/feed-draft"
import {
  FEED_MAX_FALLBACK_PICTURES,
  FEED_MEDIA_FIELD_EXAMPLE,
} from "../lib/feed-options"
import { getPostAsHelp } from "../lib/post-as-help"
import { FeedFieldMenu } from "./feed-field-menu"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const MODE_KEYS = {
  auto: "posts.feeds.form.mediaModeAuto",
  field: "posts.feeds.form.mediaModeField",
  none: "posts.feeds.form.mediaModeNone",
} as const
const POST_AS_KEYS = {
  link: "posts.feeds.form.postAsLink",
  photo: "posts.feeds.form.postAsPhoto",
  text: "posts.feeds.form.postAsText",
} as const
const FALLBACK_KEYS = {
  link: "posts.feeds.form.fallbackLink",
  skip: "posts.feeds.form.fallbackSkip",
  text: "posts.feeds.form.fallbackText",
} as const

/** Where post pictures come from, how the post is shaped and what happens without a picture. */
export const FeedMediaFields = ({
  draft,
  fields,
  onChange,
  providers,
  workspaceId,
}: {
  draft: FeedDraft
  fields: Record<string, string | string[]> | null
  onChange: (patch: Partial<FeedDraft>) => void
  /** Networks of the selected destinations. */
  providers: readonly string[]
  workspaceId: string
}) => {
  const t = useTranslations()
  // Thumbnails of pictures picked in this session (an id alone has no address).
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const addPictures = (files: { id: string; url: string }[]) => {
    setThumbnails((current) => ({
      ...current,
      ...Object.fromEntries(files.map((file) => [file.id, file.url])),
    }))
    onChange({
      mediaLibraryFileIds: [
        ...new Set([
          ...draft.mediaLibraryFileIds,
          ...files.map((file) => file.id),
        ]),
      ].slice(0, FEED_MAX_FALLBACK_PICTURES),
    })
  }
  const wantsPicture = draft.postAs === "photo"
  const postAsHelp = getPostAsHelp(draft.postAs, providers)
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 font-medium text-sm">
        {t("posts.feeds.form.mediaTitle")}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="feed-post-as">{t("posts.feeds.form.postAs")}</Label>
          <select
            aria-describedby="feed-post-as-help"
            className={selectClass}
            id="feed-post-as"
            onChange={(event) =>
              onChange({
                postAs: socialPostFeedPostAs.parse(event.target.value),
              })
            }
            value={draft.postAs}
          >
            {socialPostFeedPostAs.options.map((option) => (
              <option key={option} value={option}>
                {t(POST_AS_KEYS[option])}
              </option>
            ))}
          </select>
          <div className="space-y-1" id="feed-post-as-help">
            <p className="text-muted-foreground text-xs">
              {t(postAsHelp.effectKey)}
            </p>
            {postAsHelp.warningKey ? (
              <p
                className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-amber-800 text-xs dark:text-amber-300"
                role="status"
              >
                {t(postAsHelp.warningKey)}
              </p>
            ) : null}
          </div>
        </div>
        {wantsPicture ? (
          <div className="space-y-1">
            <Label htmlFor="feed-no-image">
              {t("posts.feeds.form.noImageFallback")}
            </Label>
            <select
              className={selectClass}
              id="feed-no-image"
              onChange={(event) =>
                onChange({
                  noImageFallback: socialPostFeedNoImageFallbacks.parse(
                    event.target.value,
                  ),
                })
              }
              value={draft.noImageFallback}
            >
              {socialPostFeedNoImageFallbacks.options.map((option) => (
                <option key={option} value={option}>
                  {t(FALLBACK_KEYS[option])}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {wantsPicture ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="feed-media-mode">
              {t("posts.feeds.form.mediaMode")}
            </Label>
            <select
              className={selectClass}
              id="feed-media-mode"
              onChange={(event) =>
                onChange({
                  mediaMode: socialPostFeedMediaModes.parse(event.target.value),
                })
              }
              value={draft.mediaMode}
            >
              {socialPostFeedMediaModes.options.map((option) => (
                <option key={option} value={option}>
                  {t(MODE_KEYS[option])}
                </option>
              ))}
            </select>
          </div>
          {draft.mediaMode === "field" ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="feed-media-field">
                  {t("posts.feeds.form.mediaField")}
                </Label>
                <FeedFieldMenu
                  fields={fields}
                  onInsert={(text) =>
                    onChange({ mediaField: `${draft.mediaField}${text}` })
                  }
                />
              </div>
              <Input
                className="font-mono text-sm"
                id="feed-media-field"
                onChange={(event) =>
                  onChange({ mediaField: event.target.value })
                }
                placeholder={FEED_MEDIA_FIELD_EXAMPLE}
                value={draft.mediaField}
              />
              <p className="text-muted-foreground text-xs">
                {t("posts.feeds.form.mediaFieldHelp", {
                  example: FEED_MEDIA_FIELD_EXAMPLE,
                })}
              </p>
            </div>
          ) : null}
          {draft.mediaMode === "none" ? null : (
            <label className="flex items-start gap-2 text-sm">
              <input
                checked={draft.fetchArticleImage}
                className="mt-1"
                onChange={(event) =>
                  onChange({ fetchArticleImage: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                {t("posts.feeds.form.fetchArticleImage")}
                <span className="block text-muted-foreground text-xs">
                  {t("posts.feeds.form.fetchArticleImageHelp")}
                </span>
              </span>
            </label>
          )}
          {draft.mediaMode === "none" ? null : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">
                    {t("posts.feeds.form.mediaLibrary")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t("posts.feeds.form.mediaLibraryHelp")}
                  </p>
                </div>
                <MediaLibraryTrigger
                  fileType="image"
                  multiple
                  onSelect={(file) => addPictures([file])}
                  onSelectMultiple={addPictures}
                  workspaceId={workspaceId}
                >
                  <Button size="sm" type="button" variant="outline">
                    <ImageIcon />
                    {t("posts.feeds.form.mediaLibraryAdd")}
                  </Button>
                </MediaLibraryTrigger>
              </div>
              {draft.mediaLibraryFileIds.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {draft.mediaLibraryFileIds.map((id) => (
                    <li className="relative" key={id}>
                      {thumbnails[id] ? (
                        // biome-ignore lint/performance/noImgElement: a library thumbnail of unknown size
                        <img
                          alt=""
                          className="size-14 rounded-md border object-cover"
                          height={56}
                          src={thumbnails[id]}
                          width={56}
                        />
                      ) : (
                        <span className="flex size-14 items-center justify-center rounded-md border bg-muted">
                          <ImageIcon className="size-5 text-muted-foreground" />
                        </span>
                      )}
                      <button
                        aria-label={t("posts.feeds.form.mediaRemove")}
                        className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-background"
                        onClick={() =>
                          onChange({
                            mediaLibraryFileIds:
                              draft.mediaLibraryFileIds.filter(
                                (entry) => entry !== id,
                              ),
                          })
                        }
                        type="button"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </fieldset>
  )
}
