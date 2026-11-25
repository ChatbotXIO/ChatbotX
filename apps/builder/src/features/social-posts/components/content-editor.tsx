"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import type { SocialProvider } from "@chatbotx.io/utils/social-account"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImagePlusIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { CharacterCounter } from "@/components/character-counter"
import {
  PostTopicBadges,
  PostTopicPicker,
} from "@/features/channel-posts/components/post-topic-picker"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { orpc } from "@/lib/orpc/query"
import {
  appendHashtag,
  applyTextPerProvider,
  type ComposerState,
  type ComposerTopic,
  fromLibraryFile,
  type LibraryFile,
} from "../lib/composer-state"
import { AiAssist } from "./ai-assist"
import { SnippetPicker } from "./snippet-picker"

/** The text, link, files and topics every destination shares. */
export const ContentEditor = ({
  destinationProviders,
  disabled,
  maxCharacters,
  maxMedia,
  onChange,
  signatureEnabled,
  state,
  workspaceId,
}: {
  /** The network of each selected destination, by destination id. */
  destinationProviders: ReadonlyMap<string, SocialProvider>
  disabled: boolean
  /** The largest file count among the selected content types; `null` = not known. */
  maxMedia: number | null
  /** The smallest text limit among the selected destinations; `null` = none known. */
  maxCharacters: number | null
  onChange: (changes: Partial<ComposerState>) => void
  /** A signature can be chosen: only when a new post is created. */
  signatureEnabled: boolean
  state: ComposerState
  workspaceId: string
}) => {
  const t = useTranslations()
  // The picker reports ids only; names come from the cached topic list.
  const topicList = useQuery(
    orpc.channelPostManagementAPIs.privateListPostTopicsAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  const knownTopics = new Map<string, ComposerTopic>(
    (topicList.data?.items ?? []).map((topic) => [topic.id, topic]),
  )
  const selectedTopics = state.topics.map(
    (topic) => knownTopics.get(topic.id) ?? topic,
  )
  const addMedia = (files: LibraryFile[]) => {
    const known = new Set(state.media.map((media) => media.id))
    const added = [
      ...state.media,
      ...files.filter((file) => !known.has(file.id)).map(fromLibraryFile),
    ]
    // The registry's largest file count among the destinations; the server still validates.
    onChange({
      media: maxMedia === null ? added : added.slice(0, maxMedia),
    })
  }
  const moveMedia = (from: number, to: number) => {
    const next = [...state.media]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) {
      return
    }
    next.splice(to, 0, moved)
    onChange({ media: next })
  }
  const mediaFull = maxMedia !== null && state.media.length >= maxMedia
  // Text from a snippet or the AI goes after what is written, on its own paragraph.
  const appendText = (text: string) =>
    onChange({
      text: state.text.trim() ? `${state.text.trimEnd()}\n\n${text}` : text,
    })

  return (
    <section aria-labelledby="composer-shared" className="space-y-3">
      <h2 className="font-semibold text-sm" id="composer-shared">
        {t("composer.sharedContent")}
      </h2>
      <div className="space-y-1">
        <Textarea
          aria-label={t("composer.text")}
          disabled={disabled}
          onChange={(event) => onChange({ text: event.target.value })}
          placeholder={t("composer.textPlaceholder")}
          rows={6}
          value={state.text}
        />
        {maxCharacters === null ? null : (
          <div className="flex justify-end">
            <CharacterCounter max={maxCharacters} value={state.text} />
          </div>
        )}
      </div>
      <Input
        aria-label={t("composer.link")}
        disabled={disabled}
        inputMode="url"
        onChange={(event) => onChange({ linkUrl: event.target.value })}
        placeholder={t("composer.linkPlaceholder")}
        value={state.linkUrl}
      />
      {state.media.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {state.media.map((media, index) => (
            <li
              className="relative size-20 overflow-hidden rounded-lg border bg-muted"
              key={media.id ?? media.url}
            >
              {media.kind === "video" ? (
                <video
                  className="size-full object-cover"
                  muted
                  preload="metadata"
                  src={media.url}
                />
              ) : (
                // biome-ignore lint/performance/noImgElement: workspace media thumbnail
                <img
                  alt={media.name}
                  className="size-full object-cover"
                  height={80}
                  src={media.url}
                  width={80}
                />
              )}
              <div className="absolute inset-x-1 bottom-1 flex justify-between">
                <button
                  aria-label={t("composer.moveMediaEarlier")}
                  className="flex size-5 items-center justify-center rounded-full bg-background/90 shadow outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  disabled={disabled || index === 0}
                  onClick={() => moveMedia(index, index - 1)}
                  type="button"
                >
                  <ArrowLeftIcon className="size-3" />
                </button>
                <button
                  aria-label={t("composer.moveMediaLater")}
                  className="flex size-5 items-center justify-center rounded-full bg-background/90 shadow outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                  disabled={disabled || index === state.media.length - 1}
                  onClick={() => moveMedia(index, index + 1)}
                  type="button"
                >
                  <ArrowRightIcon className="size-3" />
                </button>
              </div>
              <button
                aria-label={t("composer.removeMedia")}
                className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 shadow outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    media: state.media.filter((item) => item !== media),
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
      <div className="flex flex-wrap items-center gap-2">
        <MediaLibraryTrigger
          multiple
          onSelect={(file) => addMedia([file])}
          onSelectMultiple={addMedia}
          workspaceId={workspaceId}
        >
          <Button
            disabled={disabled || mediaFull}
            size="sm"
            type="button"
            variant="outline"
          >
            <ImagePlusIcon />
            {t("composer.addMedia")}
          </Button>
        </MediaLibraryTrigger>
        <PostTopicPicker
          disabled={disabled}
          onChange={(topicIds) =>
            onChange({
              topics: topicIds.map(
                (id) =>
                  knownTopics.get(id) ??
                  state.topics.find((topic) => topic.id === id) ?? {
                    color: null,
                    id,
                    name: "",
                  },
              ),
            })
          }
          selected={selectedTopics}
          workspaceId={workspaceId}
        />
        <PostTopicBadges topics={selectedTopics} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AiAssist
          destinationIds={state.targets.map((target) => target.destinationId)}
          disabled={disabled}
          onApplyToNetworks={(versions) =>
            onChange({
              targets: applyTextPerProvider(state, versions, (id) =>
                destinationProviders.get(id),
              ).targets,
            })
          }
          onHashtag={(tag) =>
            onChange({ text: appendHashtag(state.text, tag) })
          }
          onInsert={appendText}
          onReplace={(text) => onChange({ text })}
          postText={state.text}
          providers={[
            ...new Set(
              state.targets.flatMap((target) => {
                const provider = destinationProviders.get(target.destinationId)
                return provider ? [provider] : []
              }),
            ),
          ].sort()}
          workspaceId={workspaceId}
        />
        <SnippetPicker
          disabled={disabled}
          onInsert={appendText}
          onSignatureChange={(signatureId) => onChange({ signatureId })}
          signatureEnabled={signatureEnabled}
          signatureId={state.signatureId}
          workspaceId={workspaceId}
        />
      </div>
    </section>
  )
}
