"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTimeZone, useTranslations } from "next-intl"
import { useState } from "react"
import { useDebounce } from "use-debounce"
import {
  instantToWallClock,
  wallClockToInstant,
} from "@/components/calendar/calendar-grid"
import { SocialPostPerformance } from "@/features/post-analytics/components/social-post-performance"
import { connectTabPath } from "@/features/social-accounts/lib/connect-route"
import { orpc } from "@/lib/orpc/query"
import { useComposerSubmit } from "../hooks/use-composer-submit"
import { allHaveFreeSlots, useFreeSlots } from "../hooks/use-free-slots"
import { usePublishDestinations } from "../hooks/use-publish-destinations"
import { MIN_SCHEDULE_LEAD_MS, plannedAtOf } from "../lib/calendar-items"
import {
  buildContent,
  type ComposerPost,
  type ComposerState,
  canSaveComposer,
  everyTargetTimed,
  isLinkValid,
  issuesOfDestination,
  largestMaxMedia,
  preselectSingleDestination,
  resolveComposerLocks,
  stateFromPost,
  strictestMaxCharacters,
  toggleDestination,
  updateTarget,
} from "../lib/composer-state"
import {
  flattenDestinations,
  type PublishDestinationGroup,
} from "../lib/publish-destination-options"
import { ComposerPreviewAside } from "./composer-preview-aside"
import { ComposerScheduleSection } from "./composer-schedule-section"
import { ContentEditor } from "./content-editor"
import { DestinationPicker } from "./destination-picker"
import { PublishNowButton } from "./publish-now-button"
import type { ScheduleMode } from "./queue-control"
import { initialRepeat, isRepeatValid } from "./repeat-control"
import { TargetCard, type TargetDestination } from "./target-card"
import { TargetStatusList } from "./target-status"

const PREVIEW_DEBOUNCE_MS = 500
const EDITABLE_STATUSES: ReadonlySet<ComposerPost["status"]> = new Set([
  "draft",
  "scheduled",
])

const destinationMap = (
  groups: PublishDestinationGroup[],
  post: ComposerPost | undefined,
): Map<string, TargetDestination> => {
  const map = new Map<string, TargetDestination>()
  for (const target of post?.targets ?? []) {
    map.set(target.destination.id, {
      avatar: target.destination.avatar,
      name: target.destination.name,
      provider: target.provider,
      socialAccountId: target.destination.socialAccountId,
      viaFacebook: false,
    })
  }
  for (const destination of flattenDestinations(groups)) {
    map.set(destination.id, {
      avatar: destination.avatar,
      name: destination.name ?? "",
      provider: destination.provider,
      socialAccountId: destination.socialAccountId,
      viaFacebook: destination.viaFacebook,
    })
  }
  return map
}

/** The time `?at=<ISO>` asks for, as the zone's wall clock; `undefined` when absent or unreadable. */
const scheduleFromSearch = (
  at: string | null,
  timezone: string,
): Date | undefined => {
  const instant = at ? new Date(at) : null
  return instant && !Number.isNaN(instant.getTime())
    ? instantToWallClock(instant, timezone)
    : undefined
}

/** The time a saved draft was planned for, as the zone's wall clock; scheduled posts show their own schedule. */
const plannedFromPost = (
  post: ComposerPost | undefined,
  timezone: string,
): Date | undefined => {
  const planned = post?.status === "draft" ? plannedAtOf(post) : null
  return planned ? instantToWallClock(planned, timezone) : undefined
}

const FREE_SLOT_PREVIEW_COUNT = 3

const ComposerForm = ({
  actionsDisabled,
  groups,
  initial,
  readOnly,
  socialPost,
  workspaceId,
}: {
  /** The workspace is blocked: the per-target actions stay disabled. */
  actionsDisabled: boolean
  groups: PublishDestinationGroup[]
  initial: ComposerState
  readOnly: boolean
  socialPost: ComposerPost | undefined
  workspaceId: string
}) => {
  const t = useTranslations()
  const timezone = useTimeZone() ?? "UTC"
  const searchParams = useSearchParams()
  const [scheduleAt, setScheduleAt] = useState<Date | undefined>(
    () =>
      scheduleFromSearch(searchParams.get("at"), timezone) ??
      plannedFromPost(socialPost, timezone),
  )
  const [state, setState] = useState<ComposerState>(initial)
  // The repeat rule of a series; the post is then a template, never scheduled itself.
  const [repeat, setRepeat] = useState<RecurrenceRule | null>(() =>
    initialRepeat(socialPost),
  )
  const [mode, setMode] = useState<ScheduleMode>("time")
  const {
    clearRefusedIssues,
    enqueue,
    isSaving,
    refusedIssues,
    save,
    schedule,
  } = useComposerSubmit({
    content: buildContent(state),
    repeat,
    signatureId: state.signatureId,
    socialPost,
    workspaceId,
  })
  const edit = (change: (current: ComposerState) => ComposerState) => {
    clearRefusedIssues()
    setState(change)
  }
  const [debounced] = useDebounce(state, PREVIEW_DEBOUNCE_MS)
  const base = `/space/${workspaceId}/posts`

  const linkIsValid = isLinkValid(state.linkUrl)
  const contentTypes = useQuery(
    orpc.socialPostsAPIs.privateListSocialPostContentTypesAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  // The preview carries each destination's normalised text, limit and issues,
  // so one debounced call feeds the counters, the issue lists and the preview.
  const preview = useQuery(
    orpc.socialPostsAPIs.privatePreviewSocialPostAPI.queryOptions({
      enabled: debounced.targets.length > 0,
      input: {
        ...buildContent({
          ...debounced,
          linkUrl: isLinkValid(debounced.linkUrl) ? debounced.linkUrl : "",
        }),
        workspaceId,
      },
      placeholderData: keepPreviousData,
    }),
  )
  const items = state.targets.length > 0 ? (preview.data?.items ?? []) : []
  const previewIssues = items.flatMap((item) => item.issues)

  const issues = refusedIssues.length > 0 ? refusedIssues : previewIssues
  const scheduleInstant = scheduleAt
    ? wallClockToInstant(scheduleAt, timezone)
    : undefined
  const isTooSoon =
    scheduleInstant !== undefined &&
    scheduleInstant.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS
  // Every destination has a time of its own, so no shared time is needed.
  const isTimedPerDestination = everyTargetTimed(buildContent(state))
  const hasProgress =
    socialPost?.targets.some((target) => target.status !== "pending") ?? false
  const locked = readOnly || isSaving
  const canSave =
    canSaveComposer(state) && linkIsValid && isRepeatValid(repeat) && !locked
  const destinations = destinationMap(groups, socialPost)
  const selectedIds = new Set(
    state.targets.map((target) => target.destinationId),
  )
  const isQueueing = mode !== "time" && repeat === null
  const freeSlots = useFreeSlots({
    destinationIds: [...selectedIds],
    enabled: isQueueing,
    limit: FREE_SLOT_PREVIEW_COUNT,
    workspaceId,
  })
  const destinationNames = new Map(
    [...destinations].map(([id, destination]) => [id, destination.name]),
  )
  const canQueue = isQueueing && allHaveFreeSlots(freeSlots)

  return (
    <div className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <DestinationPicker
            disabled={locked}
            groups={groups}
            onToggle={(id) => edit((current) => toggleDestination(current, id))}
            selectedIds={selectedIds}
            workspaceId={workspaceId}
          />
          <ContentEditor
            destinationProviders={
              new Map(
                [...destinations].flatMap(([id, destination]) =>
                  destination.provider
                    ? [[id, destination.provider] as const]
                    : [],
                ),
              )
            }
            disabled={locked}
            maxCharacters={strictestMaxCharacters(items)}
            maxMedia={largestMaxMedia(
              state.targets.map((target) => {
                const provider = destinations.get(
                  target.destinationId,
                )?.provider
                const type =
                  target.contentType ??
                  items.find(
                    (item) => item.destinationId === target.destinationId,
                  )?.contentType
                return contentTypes.data?.items
                  .find((item) => item.provider === provider)
                  ?.contentTypes.find((rule) => rule.contentType === type)
                  ?.maxMedia
              }),
            )}
            onChange={(changes) =>
              edit((current) => ({ ...current, ...changes }))
            }
            signatureEnabled={!socialPost}
            state={state}
            workspaceId={workspaceId}
          />
          {linkIsValid ? null : (
            <p className="text-destructive text-sm">
              {t("composer.linkInvalid")}
            </p>
          )}
          {contentTypes.isError ? (
            <p className="text-destructive text-sm">
              {t("messages.errorLoadingData")}
            </p>
          ) : null}
          {state.targets.length > 0 ? (
            <ul className="space-y-3">
              {state.targets.map((target) => {
                const destination = destinations.get(target.destinationId)
                const provider = destination?.provider
                const rules =
                  contentTypes.data?.items.find(
                    (item) => item.provider === provider,
                  )?.contentTypes ?? []
                return destination ? (
                  <TargetCard
                    destination={destination}
                    disabled={locked}
                    hasLink={linkIsValid && state.linkUrl.trim() !== ""}
                    issues={issuesOfDestination(issues, target.destinationId)}
                    key={target.destinationId}
                    onChange={(changes) =>
                      edit((current) =>
                        updateTarget(current, target.destinationId, changes),
                      )
                    }
                    onRemove={() =>
                      edit((current) =>
                        toggleDestination(current, target.destinationId),
                      )
                    }
                    partsRule={
                      contentTypes.data?.items.find(
                        (item) => item.provider === provider,
                      )?.parts ?? null
                    }
                    preview={items.find(
                      (item) => item.destinationId === target.destinationId,
                    )}
                    rules={rules}
                    target={target}
                    timezone={timezone}
                    workspaceId={workspaceId}
                  />
                ) : null
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-center text-muted-foreground text-sm">
              {t("composer.noTargets")}
            </p>
          )}
        </div>

        <ComposerPreviewAside
          destinations={destinations}
          hasError={preview.isError}
          isLoading={preview.isFetching}
          items={items}
          media={state.media}
          targets={state.targets}
        />
      </div>

      {socialPost && hasProgress ? (
        <TargetStatusList
          disabled={actionsDisabled}
          post={socialPost}
          workspaceId={workspaceId}
        />
      ) : null}

      {socialPost?.targets.some((target) => target.status === "published") ? (
        <section
          aria-labelledby="composer-performance"
          className="space-y-2 rounded-xl border p-3"
        >
          <h2 className="font-semibold text-sm" id="composer-performance">
            {t("posts.analytics.perPost.title")}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t("posts.analytics.perPost.description")}
          </p>
          <SocialPostPerformance
            socialPostId={socialPost.id}
            workspaceId={workspaceId}
          />
        </section>
      ) : null}

      <ComposerScheduleSection
        destinationNames={destinationNames}
        disabled={locked}
        freeSlots={freeSlots}
        isTooSoon={isTooSoon}
        mode={mode}
        onModeChange={setMode}
        onRepeatChange={setRepeat}
        onScheduleChange={setScheduleAt}
        repeat={repeat}
        scheduleAt={scheduleAt}
        socialPost={socialPost}
        timezone={timezone}
        workspaceId={workspaceId}
      />

      <footer className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card p-3">
        {issues.length > 0 ? (
          <p className="me-auto text-destructive text-sm">
            {t("composer.issueCount", { count: issues.length })}
          </p>
        ) : null}
        <Link className={buttonVariants({ variant: "ghost" })} href={base}>
          {t("actions.cancel")}
        </Link>
        <Button
          disabled={!canSave}
          onClick={() => save("draft", scheduleInstant ?? null)}
          type="button"
          variant="outline"
        >
          {isSaving ? <Loader2Icon className="animate-spin" /> : null}
          {t("composer.saveDraft")}
        </Button>
        <Button
          disabled={
            repeat !== null ||
            !canSave ||
            (isQueueing
              ? !canQueue
              : !(scheduleInstant || isTimedPerDestination) || isTooSoon) ||
            previewIssues.length > 0 ||
            preview.isFetching
          }
          onClick={() =>
            mode === "time"
              ? schedule(scheduleInstant, timezone)
              : enqueue(mode)
          }
          type="button"
          variant="outline"
        >
          {t("composer.schedule")}
        </Button>
        <PublishNowButton
          disabled={
            repeat !== null ||
            !canSave ||
            previewIssues.length > 0 ||
            preview.isFetching
          }
          isPending={isSaving}
          onPublish={() => save("now")}
        />
      </footer>
    </div>
  )
}

const ComposerSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-10 w-2/3" />
    <Skeleton className="h-40 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>
)

const ComposerError = ({ onRetry }: { onRetry: () => void }) => {
  const t = useTranslations()
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <p className="text-destructive text-sm">
        {t("messages.errorLoadingData")}
      </p>
      <Button onClick={onRetry} size="sm" variant="outline">
        {t("composer.retry")}
      </Button>
    </div>
  )
}

type FeedPrefill = {
  imageUrl: string | null
  linkUrl: string | null
  text: string
}

/** The state with a feed item's text, link and picture filled in (the picture is imported by URL on save). */
const withFeedPrefill = (
  state: ComposerState,
  prefill: FeedPrefill | undefined,
): ComposerState =>
  prefill
    ? {
        ...state,
        linkUrl: prefill.linkUrl ?? "",
        media: prefill.imageUrl
          ? [
              {
                id: null,
                kind: "image",
                mimeType: "image/jpeg",
                name: prefill.imageUrl.split("/").pop() ?? prefill.imageUrl,
                url: prefill.imageUrl,
              },
            ]
          : [],
        text: prefill.text,
      }
    : state

/**
 * The composer page: loads the publish destinations (and the post, when
 * editing), then hands a ready state to the form.
 */
export const ComposerView = ({
  readOnly,
  socialPostId,
  workspaceId,
}: {
  /** The workspace is blocked (trial or limit): look, do not change. */
  readOnly: boolean
  socialPostId?: string
  workspaceId: string
}) => {
  const t = useTranslations()
  const destinations = usePublishDestinations(workspaceId)
  const post = useQuery(
    orpc.socialPostsAPIs.privateGetSocialPostAPI.queryOptions({
      enabled: Boolean(socialPostId),
      input: { id: socialPostId ?? "", workspaceId },
    }),
  )
  const accountsHref = connectTabPath(workspaceId)
  // "Create post from this item" (Posts > Feeds > Items): resolved server side
  // from the ids, so no content travels in the address.
  const searchParams = useSearchParams()
  const feedId = socialPostId ? null : searchParams.get("fromFeed")
  const feedItemId = socialPostId ? null : searchParams.get("fromFeedItem")
  const feedPrefill = useQuery(
    orpc.postFeedsAPIs.privatePostFeedItemDraftContentAPI.queryOptions({
      enabled: Boolean(feedId && feedItemId),
      input: { id: feedId ?? "", itemId: feedItemId ?? "", workspaceId },
    }),
  )

  if (
    destinations.isPending ||
    (socialPostId && post.isPending) ||
    (feedId && feedItemId && feedPrefill.isPending)
  ) {
    return <ComposerSkeleton />
  }
  if (destinations.isError || post.isError) {
    return (
      <ComposerError
        onRetry={() => {
          destinations.refetch()
          post.refetch()
        }}
      />
    )
  }
  const groups = destinations.data.items
  if (flattenDestinations(groups).length === 0 && !post.data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">{t("composer.noAccountsTitle")}</p>
        <p className="text-muted-foreground text-sm">
          {t("composer.noAccountsHint")}
        </p>
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={accountsHref}
        >
          {t("composer.goToAccounts")}
        </Link>
      </div>
    )
  }
  const editable = !post.data || EDITABLE_STATUSES.has(post.data.status)
  const locks = resolveComposerLocks({ editable, workspaceReadOnly: readOnly })

  return (
    <div className="space-y-4">
      {editable ? null : (
        <p className="rounded-xl border p-3 text-muted-foreground text-sm">
          {t("composer.notEditable")}
        </p>
      )}
      <ComposerForm
        actionsDisabled={locks.actionsDisabled}
        groups={groups}
        initial={
          post.data
            ? stateFromPost(post.data)
            : withFeedPrefill(
                preselectSingleDestination(groups),
                feedPrefill.data,
              )
        }
        key={post.data?.id ?? `new-${feedItemId ?? ""}`}
        readOnly={locks.contentReadOnly}
        socialPost={post.data}
        workspaceId={workspaceId}
      />
    </div>
  )
}
