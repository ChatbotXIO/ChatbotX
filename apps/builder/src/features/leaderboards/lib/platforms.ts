import {
  LEADERBOARD_FOLLOWER_CHECK_PLATFORMS,
  LEADERBOARD_POST_TRACKING_PLATFORMS,
  LEADERBOARD_RULES_BY_PLATFORM,
  type LeaderboardPlatform,
  type LeaderboardRuleKey,
  type LeaderboardStatus,
  leaderboardPlatforms,
} from "@chatbotx.io/database/partials"
import {
  SiInstagram,
  SiMessenger,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiZalo,
} from "@icons-pack/react-simple-icons"
import { Gamepad2Icon, MailIcon } from "lucide-react"
import type { ComponentType } from "react"

/** Every platform, in the order the wizard offers them. */
export const LEADERBOARD_PLATFORMS = leaderboardPlatforms.options

export const LEADERBOARD_PLATFORM_LABEL_KEY = {
  messenger: "leaderboards.platforms.messenger",
  instagram: "leaderboards.platforms.instagram",
  whatsapp: "leaderboards.platforms.whatsapp",
  zalo: "leaderboards.platforms.zalo",
  telegram: "leaderboards.platforms.telegram",
  tiktok: "leaderboards.platforms.tiktok",
  threads: "leaderboards.platforms.threads",
  email: "leaderboards.platforms.email",
  gamification: "leaderboards.platforms.gamification",
} as const satisfies Record<LeaderboardPlatform, string>

export const LEADERBOARD_PLATFORM_ICON: Record<
  LeaderboardPlatform,
  ComponentType<{ className?: string }>
> = {
  messenger: SiMessenger,
  instagram: SiInstagram,
  whatsapp: SiWhatsapp,
  zalo: SiZalo,
  telegram: SiTelegram,
  tiktok: SiTiktok,
  threads: SiThreads,
  email: MailIcon,
  gamification: Gamepad2Icon,
}

export const LEADERBOARD_STATUS_LABEL_KEY = {
  draft: "leaderboards.status.draft",
  active: "leaderboards.status.active",
  paused: "leaderboards.status.paused",
  finished: "leaderboards.status.finished",
} as const satisfies Record<LeaderboardStatus, string>

/** Badge colors from the spec: Active green, Pause amber, Finished silver, Draft neutral. */
export const LEADERBOARD_STATUS_CLASS_NAME: Record<LeaderboardStatus, string> =
  {
    draft: "border-border bg-muted text-muted-foreground",
    active:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    paused:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    finished:
      "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  }

export const LEADERBOARD_RULE_LABEL_KEY = {
  comments: "leaderboards.rules.comments.label",
  liveComments: "leaderboards.rules.liveComments.label",
  keywords: "leaderboards.rules.keywords.label",
  storyMention: "leaderboards.rules.storyMention.label",
  storyReaction: "leaderboards.rules.storyReaction.label",
  ctwaReactions: "leaderboards.rules.ctwaReactions.label",
  survey: "leaderboards.rules.survey.label",
  follow: "leaderboards.rules.follow.label",
  message: "leaderboards.rules.message.label",
  joinGroup: "leaderboards.rules.joinGroup.label",
  groupDiscussion: "leaderboards.rules.groupDiscussion.label",
  emailOpen: "leaderboards.rules.emailOpen.label",
  emailClick: "leaderboards.rules.emailClick.label",
  minigameWin: "leaderboards.rules.minigameWin.label",
  inGameShare: "leaderboards.rules.inGameShare.label",
  referral: "leaderboards.rules.referral.label",
} as const satisfies Record<LeaderboardRuleKey, string>

export const LEADERBOARD_RULE_DESCRIPTION_KEY = {
  comments: "leaderboards.rules.comments.description",
  liveComments: "leaderboards.rules.liveComments.description",
  keywords: "leaderboards.rules.keywords.description",
  storyMention: "leaderboards.rules.storyMention.description",
  storyReaction: "leaderboards.rules.storyReaction.description",
  ctwaReactions: "leaderboards.rules.ctwaReactions.description",
  survey: "leaderboards.rules.survey.description",
  follow: "leaderboards.rules.follow.description",
  message: "leaderboards.rules.message.description",
  joinGroup: "leaderboards.rules.joinGroup.description",
  groupDiscussion: "leaderboards.rules.groupDiscussion.description",
  emailOpen: "leaderboards.rules.emailOpen.description",
  emailClick: "leaderboards.rules.emailClick.description",
  minigameWin: "leaderboards.rules.minigameWin.description",
  inGameShare: "leaderboards.rules.inGameShare.description",
  referral: "leaderboards.rules.referral.description",
} as const satisfies Record<LeaderboardRuleKey, string>

/** "42 comments" style counters for the participants breakdown column. */
export const LEADERBOARD_BREAKDOWN_KEY = {
  comments: "leaderboards.breakdown.comments",
  liveComments: "leaderboards.breakdown.liveComments",
  keywords: "leaderboards.breakdown.keywords",
  storyMention: "leaderboards.breakdown.storyMention",
  storyReaction: "leaderboards.breakdown.storyReaction",
  ctwaReactions: "leaderboards.breakdown.ctwaReactions",
  survey: "leaderboards.breakdown.survey",
  follow: "leaderboards.breakdown.follow",
  message: "leaderboards.breakdown.message",
  joinGroup: "leaderboards.breakdown.joinGroup",
  groupDiscussion: "leaderboards.breakdown.groupDiscussion",
  emailOpen: "leaderboards.breakdown.emailOpen",
  emailClick: "leaderboards.breakdown.emailClick",
  minigameWin: "leaderboards.breakdown.minigameWin",
  inGameShare: "leaderboards.breakdown.inGameShare",
  referral: "leaderboards.breakdown.referral",
  flow: "leaderboards.breakdown.flow",
  manual: "leaderboards.breakdown.manual",
} as const satisfies Record<LeaderboardRuleKey | "flow" | "manual", string>

export const rulesForPlatform = (
  platform: LeaderboardPlatform,
): readonly LeaderboardRuleKey[] => LEADERBOARD_RULES_BY_PLATFORM[platform]

/** "Followers only" is offered only where the platform can check following. */
export const supportsFollowersOnly = (platform: LeaderboardPlatform) =>
  (
    LEADERBOARD_FOLLOWER_CHECK_PLATFORMS as readonly LeaderboardPlatform[]
  ).includes(platform)

/**
 * Only channels with tracked posts (Messenger, Instagram) can limit scoring
 * to specific posts and offer the golden-hour comment bonus.
 */
export const supportsPostScope = (platform: LeaderboardPlatform) =>
  (
    LEADERBOARD_POST_TRACKING_PLATFORMS as readonly LeaderboardPlatform[]
  ).includes(platform)
