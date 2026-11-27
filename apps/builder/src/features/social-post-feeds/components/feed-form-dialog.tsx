"use client"

import { socialPostFeedModes } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { checkTemplate } from "@chatbotx.io/utils/feed-template"
import { publishDestinationStates } from "@chatbotx.io/utils/publish-destination"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { ProviderNetworkIcon } from "@/features/social-accounts/components/provider-avatar"
import { AiModelPicker } from "@/features/social-posts/components/ai-model-picker"
import { DestinationProfileLink } from "@/features/social-posts/components/destination-profile-link"
import { DestinationStateBadge } from "@/features/social-posts/components/destination-state-badge"
import { usePublishDestinations } from "@/features/social-posts/hooks/use-publish-destinations"
import { PROVIDER_LABELS } from "@/features/social-posts/lib/composer-state"
import {
  flattenDestinations,
  isDestinationSelectable,
} from "@/features/social-posts/lib/publish-destination-options"
import type { AiModelChoice } from "@/features/social-posts-ai/model-choice"
import { orpc } from "@/lib/orpc/query"
import {
  contentSettingsOf,
  draftOfFeed,
  type Feed,
  type FeedDraft,
  templatesOfDraft,
} from "../lib/feed-draft"
import {
  FEED_INTERVAL_CHOICES,
  FEED_MAX_AI_INSTRUCTIONS_LENGTH,
  FEED_MAX_DAILY_CAP,
  FEED_MAX_NAME_LENGTH,
} from "../lib/feed-options"
import { useFeedDraftPreview } from "../lib/use-feed-draft-preview"
import {
  type FeedUrlProblem,
  useFeedErrorMessage,
} from "../lib/use-feed-error-message"
import { FeedContentFields } from "./feed-content-fields"
import { FeedFilterFields } from "./feed-filter-fields"
import { FeedMediaFields } from "./feed-media-fields"

type Draft = FeedDraft

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Create or edit a feed: address (with a preview), destinations, interval, mode and text. */
export const FeedFormDialog = ({
  feed,
  onOpenChange,
  open,
  workspaceId,
}: {
  /** The feed being edited; null creates one. */
  feed: Feed | null
  onOpenChange: (open: boolean) => void
  open: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const errorMessage = useFeedErrorMessage()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => draftOfFeed(feed))
  // Every state, so a destination the feed holds stays visible (and removable)
  // after its inbox is disconnected.
  const destinationList = usePublishDestinations(workspaceId, {
    states: publishDestinationStates.options,
  })
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.postFeedsAPIs.privateListPostFeedsAPI.key(),
    })
  const [urlProblem, setUrlProblem] = useState<FeedUrlProblem | null>(null)
  const onError = (error: Error) => {
    const problem = errorMessage.urlProblemOf(error)
    if (problem) {
      setUrlProblem(problem)
      return
    }
    toast.error(errorMessage(error))
  }
  const setFeedUrl = (feedUrl: string) => {
    setUrlProblem(null)
    setDraft({ ...draft, feedUrl })
  }
  const onSaved = async () => {
    await refresh()
    toast.success(t("posts.feeds.toast.saved"))
    onOpenChange(false)
  }
  const create = useMutation(
    orpc.postFeedsAPIs.privateCreatePostFeedAPI.mutationOptions({
      onError,
      onSuccess: onSaved,
    }),
  )
  const update = useMutation(
    orpc.postFeedsAPIs.privateUpdatePostFeedAPI.mutationOptions({
      onError,
      onSuccess: onSaved,
    }),
  )
  // The preview runs once the person asks for it (or when an existing feed is edited), then follows the form.
  const [previewOn, setPreviewOn] = useState(feed !== null)
  const preview = useFeedDraftPreview({
    active: previewOn,
    draft,
    onError,
    workspaceId,
  })
  const patchDraft = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  // Not-ready destinations stay listed, disabled, unless the feed already has them.
  // A disconnected inbox is listed only when the feed already holds it.
  const destinations = flattenDestinations(destinationList.data?.items ?? [])
    .filter(
      (destination) =>
        destination.state !== "inboxDisconnected" ||
        draft.destinationIds.includes(destination.id),
    )
    .map((destination) => ({
      id: destination.id,
      isSelectable:
        isDestinationSelectable(destination) ||
        draft.destinationIds.includes(destination.id),
      name: destination.name ?? "",
      network: PROVIDER_LABELS[destination.provider],
      provider: destination.provider,
      profileUrl: destination.profileUrl,
      state: destination.state,
    }))
  const isSaving = create.isPending || update.isPending
  const canSave =
    Boolean(draft.name.trim() && draft.feedUrl.trim()) &&
    draft.destinationIds.length > 0 &&
    Boolean(draft.textTemplate.trim()) &&
    !(draft.templateSyntax === "v2" && !checkTemplate(draft.textTemplate).ok) &&
    Object.values(templatesOfDraft(draft)).every(
      (template) => checkTemplate(template).ok,
    ) &&
    !isSaving
  // The picker reports the chosen model (null while none is chosen: the Inbox translation model is used).
  // The picker starts from the draft's current choice, so toggling AI writing off and on keeps what was picked.
  const draftAiChoice: AiModelChoice | null =
    draft.aiIntegrationId && draft.aiModel
      ? { integrationId: draft.aiIntegrationId, model: draft.aiModel }
      : null
  const setAiChoice = useCallback(
    (choice: AiModelChoice | null) =>
      setDraft((current) => ({
        ...current,
        aiIntegrationId: choice?.integrationId ?? null,
        aiModel: choice?.model ?? null,
      })),
    [],
  )
  const toggleDestination = (id: string) =>
    setDraft({
      ...draft,
      destinationIds: draft.destinationIds.includes(id)
        ? draft.destinationIds.filter((item) => item !== id)
        : [...draft.destinationIds, id],
    })
  const save = () => {
    const body = {
      ...contentSettingsOf(draft),
      aiInstructions: draft.aiWrite
        ? draft.aiInstructions.trim() || null
        : null,
      aiIntegrationId: draft.aiIntegrationId,
      aiModel: draft.aiModel,
      aiWrite: draft.aiWrite,
      dailyCap: draft.dailyCap,
      destinationIds: draft.destinationIds,
      feedUrl: draft.feedUrl.trim(),
      intervalMinutes: draft.intervalMinutes,
      mode: draft.mode,
      name: draft.name.trim(),
      postLatestOnFirstCheck: draft.postLatestOnFirstCheck,
      workspaceId,
    }
    if (feed) {
      update.mutate({ ...body, id: feed.id })
    } else {
      create.mutate(body)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {feed
              ? t("posts.feeds.form.editTitle")
              : t("posts.feeds.form.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSave) {
              save()
            }
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="feed-name">{t("posts.feeds.form.name")}</Label>
            <Input
              id="feed-name"
              maxLength={FEED_MAX_NAME_LENGTH}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              value={draft.name}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="feed-url">{t("posts.feeds.form.url")}</Label>
            <div className="flex gap-2">
              <Input
                aria-describedby={urlProblem ? "feed-url-problem" : undefined}
                aria-invalid={urlProblem ? true : undefined}
                id="feed-url"
                inputMode="url"
                onChange={(event) => setFeedUrl(event.target.value)}
                placeholder={t("posts.feeds.form.urlPlaceholder")}
                type="url"
                value={draft.feedUrl}
              />
              <Button
                disabled={!draft.feedUrl.trim() || preview.isPending}
                onClick={() => {
                  setPreviewOn(true)
                  preview.mutate({
                    ...contentSettingsOf(draft),
                    destinationIds: draft.destinationIds,
                    feedUrl: draft.feedUrl.trim(),
                    workspaceId,
                  })
                }}
                type="button"
                variant="outline"
              >
                {preview.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : null}
                {t("posts.feeds.form.preview")}
              </Button>
            </div>
            {urlProblem ? (
              <div
                className="space-y-1 text-destructive text-sm"
                id="feed-url-problem"
                role="alert"
              >
                <p>{urlProblem.message}</p>
                {urlProblem.suggestedUrl ? (
                  <p className="flex flex-wrap items-center gap-2 text-foreground">
                    <span className="min-w-0 break-all">
                      {t("posts.feeds.form.didYouMean", {
                        url: urlProblem.suggestedUrl,
                      })}
                    </span>
                    <Button
                      onClick={() => setFeedUrl(urlProblem.suggestedUrl ?? "")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("posts.feeds.form.useSuggestion")}
                    </Button>
                  </p>
                ) : null}
              </div>
            ) : null}
            {preview.data && !urlProblem && preview.data.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("posts.feeds.form.previewEmpty")}
              </p>
            ) : null}
          </div>
          <fieldset className="space-y-1">
            <legend className="font-medium text-sm">
              {t("posts.feeds.form.destinations")}
            </legend>
            {destinations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("posts.feeds.form.noDestinations")}
              </p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {destinations.map((destination) => (
                  <label
                    className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                    key={destination.id}
                  >
                    <input
                      checked={draft.destinationIds.includes(destination.id)}
                      disabled={!destination.isSelectable}
                      onChange={() => toggleDestination(destination.id)}
                      type="checkbox"
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <ProviderNetworkIcon
                        label={destination.network}
                        provider={destination.provider}
                      />
                      <DestinationProfileLink
                        name={destination.name}
                        network={destination.network}
                        profileUrl={destination.profileUrl}
                      />
                    </span>
                    {destination.state === "ready" ? null : (
                      <DestinationStateBadge state={destination.state} />
                    )}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="feed-interval">
                {t("posts.feeds.form.interval")}
              </Label>
              <select
                className={selectClass}
                id="feed-interval"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    intervalMinutes: Number(event.target.value),
                  })
                }
                value={draft.intervalMinutes}
              >
                {FEED_INTERVAL_CHOICES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t("posts.feeds.every", { minutes })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="feed-cap">{t("posts.feeds.form.dailyCap")}</Label>
              <Input
                id="feed-cap"
                max={FEED_MAX_DAILY_CAP}
                min={1}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    dailyCap: Number(event.target.value) || 1,
                  })
                }
                type="number"
                value={draft.dailyCap}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="feed-mode">{t("posts.feeds.form.mode")}</Label>
            <select
              className={selectClass}
              id="feed-mode"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  mode: socialPostFeedModes.parse(event.target.value),
                })
              }
              value={draft.mode}
            >
              {socialPostFeedModes.options.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`posts.feeds.mode.${mode}`)}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {draft.mode === "queue"
                ? t("posts.feeds.form.modeQueueHelp")
                : t("posts.feeds.form.modeDraftHelp")}
            </p>
          </div>
          <h3 className="font-medium text-sm">
            {t("posts.feeds.form.contentTitle")}
          </h3>
          <FeedContentFields
            draft={draft}
            isPreviewing={preview.isPending}
            onChange={patchDraft}
            preview={urlProblem ? null : (preview.data ?? null)}
          />
          <FeedMediaFields
            draft={draft}
            fields={preview.data?.items[0]?.fields ?? null}
            onChange={patchDraft}
            providers={destinations
              .filter((destination) =>
                draft.destinationIds.includes(destination.id),
              )
              .map((destination) => destination.provider)}
            workspaceId={workspaceId}
          />
          <FeedFilterFields draft={draft} onChange={patchDraft} />
          <fieldset className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={draft.aiWrite}
                onChange={(event) =>
                  setDraft({ ...draft, aiWrite: event.target.checked })
                }
                type="checkbox"
              />
              {t("posts.feeds.form.aiWrite")}
            </label>
            <p className="text-muted-foreground text-xs">
              {t("posts.feeds.form.aiWriteHelp")}
            </p>
            {draft.aiWrite ? (
              <div className="space-y-2">
                <AiModelPicker
                  initialChoice={draftAiChoice}
                  onChange={setAiChoice}
                  workspaceId={workspaceId}
                />
                <Label htmlFor="feed-ai-instructions">
                  {t("posts.feeds.form.aiInstructions")}
                </Label>
                <Textarea
                  id="feed-ai-instructions"
                  maxLength={FEED_MAX_AI_INSTRUCTIONS_LENGTH}
                  onChange={(event) =>
                    setDraft({ ...draft, aiInstructions: event.target.value })
                  }
                  rows={2}
                  value={draft.aiInstructions}
                />
                <p className="text-muted-foreground text-xs">
                  {t("posts.feeds.form.aiInstructionsHelp")}
                </p>
              </div>
            ) : null}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={draft.postLatestOnFirstCheck}
              className="mt-1"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  postLatestOnFirstCheck: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span>
              {t("posts.feeds.form.postLatestOnFirstCheck")}
              <span className="block text-muted-foreground text-xs">
                {t("posts.feeds.form.postLatestOnFirstCheckHelp")}
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("posts.feeds.form.cancel")}
            </Button>
            <Button disabled={!canSave} type="submit">
              {isSaving ? <Loader2Icon className="animate-spin" /> : null}
              {t("posts.feeds.form.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
