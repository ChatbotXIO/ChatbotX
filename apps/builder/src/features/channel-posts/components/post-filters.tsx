"use client"

import {
  type ChannelPostManagementSort,
  channelPostManagementSorts,
} from "@chatbotx.io/database/partials"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { MultiSelect } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  isPostManagementChannel,
  POST_MANAGEMENT_CHANNELS,
} from "@chatbotx.io/utils/channel"
import { useQuery } from "@tanstack/react-query"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { type ReactNode, useState } from "react"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { orpc } from "@/lib/orpc/query"
import { channelsReportLive } from "../lib/post-capability"
import {
  buildAuthorOptions,
  buildInboxOptions,
} from "../lib/post-filter-options"
import { POST_TYPE_TILES } from "../lib/post-type-style"
import {
  availablePostTypeFilters,
  effectivePostType,
  type PostTypeOption,
  postsSearchParsers,
  type SwitchFilter,
} from "../lib/posts-search-params"

const Section = ({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) => (
  <section className="space-y-2 border-b px-5 py-4 last:border-b-0">
    <h2 className="font-medium text-muted-foreground text-xs">{title}</h2>
    {children}
  </section>
)

const CheckRow = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) => (
  <Label className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-1 font-normal text-sm hover:bg-muted/50">
    <Checkbox checked={checked} onCheckedChange={onChange} />
    {label}
  </Label>
)

/** A hidden / not-hidden pair: ticking one clears the other. */
const SwitchPair = ({
  label,
  notLabel,
  onChange,
  value,
}: {
  label: string
  notLabel: string
  onChange: (value: SwitchFilter | null) => void
  value: SwitchFilter | null
}) => (
  <>
    <CheckRow
      checked={value === "true"}
      label={label}
      onChange={(checked) => onChange(checked ? "true" : null)}
    />
    <CheckRow
      checked={value === "false"}
      label={notLabel}
      onChange={(checked) => onChange(checked ? "false" : null)}
    />
  </>
)

const SORT_OPTIONS: readonly ChannelPostManagementSort[] = [
  "newest",
  "mostComments",
  "fewestComments",
  "mostPhones",
  "fewestPhones",
]
const ENGAGEMENT_SORT_OPTIONS: readonly ChannelPostManagementSort[] = [
  "mostEngagement",
  "leastEngagement",
  "mostShares",
  "fewestShares",
]

/** One radio group of the single `sort` value; the other group shows nothing chosen. */
const SortGroup = ({
  onChange,
  options,
  value,
}: {
  onChange: (sort: ChannelPostManagementSort) => void
  options: readonly ChannelPostManagementSort[]
  value: ChannelPostManagementSort
}) => {
  const t = useTranslations()
  return (
    <RadioGroup
      onValueChange={(next) => {
        const sort = channelPostManagementSorts.safeParse(next)
        if (sort.success) {
          onChange(sort.data)
        }
      }}
      value={options.includes(value) ? value : ""}
    >
      {options.map((sort) => (
        <Label
          className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-1 font-normal text-sm hover:bg-muted/50"
          key={sort}
        >
          <RadioGroupItem value={sort} />
          {t(`posts.sort.${sort}`)}
        </Label>
      ))}
    </RadioGroup>
  )
}

export const PostFilters = ({
  scope = "channels",
  workspaceId,
}: {
  /** `composed` keeps only the channel and page filters: the rest describe synced channel posts. */
  scope?: "channels" | "composed"
  workspaceId: string
}) => {
  const isChannelScope = scope === "channels"
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [topicSearch, setTopicSearch] = useState("")
  const [filters, setFilters] = useQueryStates(postsSearchParsers, {
    clearOnDefault: true,
  })
  const inboxes = useInboxList().flatMap((inbox) =>
    isPostManagementChannel(inbox.channel)
      ? [{ channel: inbox.channel, id: inbox.id, name: inbox.name }]
      : [],
  )
  const liveSupported = channelsReportLive(
    inboxes.map((inbox) => inbox.channel),
  )
  const postTypeOptions: PostTypeOption[] = [
    "all",
    ...availablePostTypeFilters(liveSupported),
  ]
  const activePostType = effectivePostType(filters.postType, liveSupported)
  const authors = useQuery(
    orpc.channelPostManagementAPIs.privateListChannelPostAuthorsAPI.queryOptions(
      {
        input: {
          channels: filters.channels.length ? filters.channels : undefined,
          inboxIds: filters.inboxIds.length ? filters.inboxIds : undefined,
          workspaceId,
        },
      },
    ),
  )
  const topics = useQuery(
    orpc.channelPostManagementAPIs.privateListPostTopicsAPI.queryOptions({
      input: { workspaceId },
    }),
  )

  const channelOptions = POST_MANAGEMENT_CHANNELS.map((channel) => ({
    label: channelLabel(channel),
    value: channel,
  }))
  const inboxOptions = buildInboxOptions(inboxes, filters.channels)

  return (
    <aside className="w-full shrink-0 self-start overflow-hidden rounded-2xl border bg-card lg:w-80">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 font-medium text-sm lg:hidden"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {t("posts.filters.title")}
        <ChevronDownIcon
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div className={cn(open ? "block" : "hidden", "lg:block")}>
        <Section title={t("posts.filters.channel")}>
          <MultiSelect
            defaultValue={filters.channels}
            hideSelectAll
            maxCount={2}
            onValueChange={(value) =>
              setFilters({
                channels: POST_MANAGEMENT_CHANNELS.filter((channel) =>
                  value.includes(channel),
                ),
                inboxIds: [],
              })
            }
            options={channelOptions}
            placeholder={t("posts.filters.allChannels")}
          />
          <MultiSelect
            defaultValue={filters.inboxIds}
            hideSelectAll
            maxCount={2}
            onValueChange={(inboxIds) => setFilters({ inboxIds })}
            options={inboxOptions}
            placeholder={t("posts.filters.allInboxes")}
          />
        </Section>

        {isChannelScope ? (
          <>
            {authors.data && authors.data.items.length > 0 ? (
              <Section title={t("posts.filters.author")}>
                <MultiSelect
                  defaultValue={filters.authorIds}
                  hideSelectAll
                  maxCount={2}
                  onValueChange={(authorIds) => setFilters({ authorIds })}
                  options={buildAuthorOptions(authors.data.items)}
                  placeholder={t("posts.filters.allAuthors")}
                />
              </Section>
            ) : null}

            <Section title={t("posts.filters.postType")}>
              <ul className="space-y-1">
                {postTypeOptions.map((type) => {
                  const { icon: TypeIcon, tone } = POST_TYPE_TILES[type]
                  const selected = (activePostType ?? "all") === type
                  return (
                    <li key={type}>
                      <button
                        aria-pressed={selected}
                        className={cn(
                          "flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-start text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                          selected && "bg-primary/10 font-medium text-primary",
                        )}
                        onClick={() =>
                          setFilters({ postType: type === "all" ? null : type })
                        }
                        type="button"
                      >
                        <span
                          className={cn(
                            "flex size-7 items-center justify-center rounded-md text-white",
                            tone,
                          )}
                        >
                          <TypeIcon className="size-4" />
                        </span>
                        {t(`posts.postType.${type}`)}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Section>

            <Section title={t("posts.filters.commentSettings")}>
              <SwitchPair
                label={t("posts.filters.hidden")}
                notLabel={t("posts.filters.notHidden")}
                onChange={(hideComments) => setFilters({ hideComments })}
                value={filters.hideComments}
              />
              <SwitchPair
                label={t("posts.filters.phoneHidden")}
                notLabel={t("posts.filters.phoneNotHidden")}
                onChange={(hidePhoneComments) =>
                  setFilters({ hidePhoneComments })
                }
                value={filters.hidePhoneComments}
              />
              <SwitchPair
                label={t("posts.filters.skipped")}
                notLabel={t("posts.filters.notSkipped")}
                onChange={(skipComments) => setFilters({ skipComments })}
                value={filters.skipComments}
              />
              <CheckRow
                checked={filters.allPosts}
                label={t("posts.showAllPosts")}
                onChange={(allPosts) => setFilters({ allPosts })}
              />
            </Section>

            <Section title={t("posts.filters.sort")}>
              <SortGroup
                onChange={(sort) => setFilters({ sort })}
                options={SORT_OPTIONS}
                value={filters.sort}
              />
            </Section>

            <Section title={t("posts.filters.engagement")}>
              <SortGroup
                onChange={(sort) => setFilters({ sort })}
                options={ENGAGEMENT_SORT_OPTIONS}
                value={filters.sort}
              />
            </Section>

            {topics.data && topics.data.items.length > 0 ? (
              <Section title={t("posts.filters.topics")}>
                <Input
                  className="h-9"
                  onChange={(event) => setTopicSearch(event.target.value)}
                  placeholder={t("posts.filters.topicSearch")}
                  value={topicSearch}
                />
                {topics.data.items
                  .filter((topic) =>
                    topic.name
                      .toLowerCase()
                      .includes(topicSearch.trim().toLowerCase()),
                  )
                  .map((topic) => (
                    <CheckRow
                      checked={filters.topicIds.includes(topic.id)}
                      key={topic.id}
                      label={topic.name}
                      onChange={(checked) =>
                        setFilters({
                          topicIds: checked
                            ? [...filters.topicIds, topic.id]
                            : filters.topicIds.filter((id) => id !== topic.id),
                        })
                      }
                    />
                  ))}
              </Section>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  )
}
