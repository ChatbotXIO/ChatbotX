"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useTranslations } from "next-intl"
import type { z } from "zod"
import { PROVIDER_LABELS } from "@/features/social-posts/lib/composer-state"
import {
  FEED_IMAGE_SOURCE_MESSAGES,
  FEED_REASON_MESSAGES,
} from "../lib/feed-labels"
import { warnsTextOnlyOnFacebook } from "../lib/post-as-help"
import type { previewPostFeedResponse } from "../schema"

type PreviewItem = z.infer<typeof previewPostFeedResponse>["items"][number]
type PreviewNetwork = NonNullable<PreviewItem["render"]>["networks"][number]

/**
 * One entry per network: several destinations of one network (two Facebook
 * Pages) get the same text, so they share one badge. It shows the longest text
 * and every distinct problem.
 */
const groupByNetwork = (networks: PreviewNetwork[]): PreviewNetwork[] => {
  const grouped = new Map<string, PreviewNetwork>()
  for (const network of networks) {
    const known = grouped.get(network.provider)
    if (!known) {
      grouped.set(network.provider, { ...network, issues: [...network.issues] })
      continue
    }
    known.characters = Math.max(known.characters, network.characters)
    for (const issue of network.issues) {
      if (!known.issues.some((existing) => existing.code === issue.code)) {
        known.issues.push(issue)
      }
    }
  }
  return [...grouped.values()]
}

const SHAPE_LABEL_KEYS = {
  link: "posts.feeds.form.postAsLink",
  photo: "posts.feeds.form.postAsPhoto",
  text: "posts.feeds.form.postAsText",
} as const

const reasonMessage = (
  reason: string,
): (typeof FEED_REASON_MESSAGES)[keyof typeof FEED_REASON_MESSAGES] =>
  Object.hasOwn(FEED_REASON_MESSAGES, reason)
    ? FEED_REASON_MESSAGES[reason as keyof typeof FEED_REASON_MESSAGES]
    : FEED_REASON_MESSAGES.other

const providerLabel = (provider: string): string =>
  Object.hasOwn(PROVIDER_LABELS, provider)
    ? PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS]
    : provider

/** What the draft would do with one item: its text, picture, networks and warnings (advisory). */
export const FeedPreviewPanel = ({
  isLegacy,
  item,
}: {
  isLegacy: boolean
  item: PreviewItem | null
}) => {
  const t = useTranslations()
  const render = item?.render ?? null
  const networks = render ? groupByNetwork(render.networks) : []
  if (!item) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("posts.feeds.form.previewHint")}
      </p>
    )
  }
  if (isLegacy || !render) {
    return (
      <p className="whitespace-pre-wrap break-words text-sm">
        {item.title}
        {item.link ? `\n${item.link}` : ""}
      </p>
    )
  }
  const [picture] = render.pictures
  return (
    <div className="space-y-2">
      {render.templateProblem ? (
        <p className="text-destructive text-xs" role="alert">
          {t("posts.feeds.form.templateProblem", {
            column: render.templateProblem.column,
            line: render.templateProblem.line,
            message: render.templateProblem.message,
          })}
        </p>
      ) : (
        <div className="flex gap-3">
          {picture && render.shape === "photo" ? (
            <div className="flex shrink-0 flex-col gap-1">
              {/* biome-ignore lint/performance/noImgElement: a remote, unknown-size sample picture */}
              <img
                alt=""
                className="size-20 rounded-md border object-cover"
                height={80}
                referrerPolicy="no-referrer"
                src={picture.url}
                width={80}
              />
              <span className="max-w-20 truncate text-muted-foreground text-xs">
                {t(FEED_IMAGE_SOURCE_MESSAGES[picture.source])}
              </span>
            </div>
          ) : null}
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">
            {render.text}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {render.shape === "skip" ? null : (
          <Badge variant="secondary">{t(SHAPE_LABEL_KEYS[render.shape])}</Badge>
        )}
        {render.shape === "photo" && render.pictures.length === 0 ? (
          <Badge variant="outline">
            {render.articleImageWillBeTried
              ? t("posts.feeds.form.previewArticlePicture")
              : t("posts.feeds.form.previewNoPicture")}
          </Badge>
        ) : null}
        {networks.map((network) => (
          <Badge
            key={network.provider}
            variant={network.issues.length > 0 ? "destructive" : "outline"}
          >
            {t("posts.feeds.form.previewCharacters", {
              count: network.characters,
              network: providerLabel(network.provider),
            })}
          </Badge>
        ))}
      </div>
      {networks.flatMap((network) =>
        network.issues.map((issue) => (
          <p
            className="text-destructive text-xs"
            key={`${network.provider}-${issue.code}`}
          >
            {providerLabel(network.provider)}: {issue.message}
          </p>
        )),
      )}
      {warnsTextOnlyOnFacebook(
        render.shape === "text" ? "text" : "link",
        networks.map((network) => network.provider),
      ) ? (
        <p className="text-muted-foreground text-xs">
          {t("posts.feeds.form.postAsTextFacebookWarning")}
        </p>
      ) : null}
      {render.droppedDestinationIds.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("posts.feeds.form.previewDropped", {
            count: render.droppedDestinationIds.length,
          })}
        </p>
      ) : null}
      {render.shape === "skip" ? (
        <p className="text-muted-foreground text-xs">
          {t("posts.feeds.form.previewSkipped")}
        </p>
      ) : null}
      {render.filteredBy ? (
        <p className="text-muted-foreground text-xs">
          {t("posts.feeds.form.previewFiltered", {
            reason: t(reasonMessage(render.filteredBy)),
          })}
        </p>
      ) : null}
    </div>
  )
}
