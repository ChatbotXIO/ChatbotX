import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"

/** What a workspace needs before a section is offered in the section select. */
type AnalyticsSectionRequirement = "always" | "google" | AdsEligibleChannelType

/**
 * One section of the Analytics select. Its label is resolved in the select
 * component, which keeps every translation key a static literal.
 */
type AnalyticsSectionDefinition = {
  id: string
  /** Path below `/space/<workspaceId>/dashboard`. */
  segment: string
  /**
   * Whether the section's server page reads the shared selection from the URL
   * (the Ads sections), so changing it must re-render that page. The other
   * sections sync the selection client-side and must not reload.
   */
  readsSelectionOnServer: boolean
  requires: AnalyticsSectionRequirement
}

/**
 * Every section of the Analytics dashboard, in the order the select lists
 * them. Client-safe (no server imports): the select renders it and the server
 * resolver filters it. A new section is one entry here.
 */
export const ANALYTICS_SECTIONS = [
  {
    id: "contacts",
    segment: "contacts",
    readsSelectionOnServer: false,
    requires: "always",
  },
  {
    id: "conversations",
    segment: "conversations",
    readsSelectionOnServer: false,
    requires: "always",
  },
  {
    id: "posts",
    segment: "posts",
    readsSelectionOnServer: false,
    requires: "always",
  },
  {
    id: "ads-whatsapp",
    segment: "ads/whatsapp",
    readsSelectionOnServer: true,
    requires: "whatsapp",
  },
  {
    id: "ads-messenger",
    segment: "ads/messenger",
    readsSelectionOnServer: true,
    requires: "messenger",
  },
  {
    id: "ads-instagram",
    segment: "ads/instagram",
    readsSelectionOnServer: true,
    requires: "instagram",
  },
  {
    id: "ads-google",
    segment: "ads/google",
    readsSelectionOnServer: true,
    requires: "google",
  },
] as const satisfies readonly AnalyticsSectionDefinition[]

export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number]
export type AnalyticsSectionId = AnalyticsSection["id"]

/** The plain, serializable shape a server page hands to the select. */
export type AnalyticsSectionOption = {
  id: AnalyticsSectionId
  segment: string
}

export type AnalyticsSectionFlags = {
  /** Ads-eligible channels the workspace has connected (see `resolveAdsDashboardChannels`). */
  adsChannels: readonly AdsEligibleChannelType[]
  /** Whether the Google Ads entry is listed (see `resolveGoogleAdsDashboardEntry`). */
  showGoogleAds: boolean
}

function toOption(section: AnalyticsSection): AnalyticsSectionOption {
  return {
    id: section.id,
    segment: section.segment,
  }
}

function isVisible(
  section: AnalyticsSection,
  flags: AnalyticsSectionFlags,
): boolean {
  if (section.requires === "always") {
    return true
  }
  if (section.requires === "google") {
    return flags.showGoogleAds
  }
  return flags.adsChannels.includes(section.requires)
}

/** The sections the select lists, in registry order. */
export function visibleAnalyticsSections(
  flags: AnalyticsSectionFlags,
): AnalyticsSectionOption[] {
  return ANALYTICS_SECTIONS.filter((section) => isVisible(section, flags)).map(
    toOption,
  )
}

/** One section by id, for a deep-linked page missing from the normal list. */
export function analyticsSectionOption(
  id: AnalyticsSectionId,
): AnalyticsSectionOption {
  const section = ANALYTICS_SECTIONS.find((candidate) => candidate.id === id)
  if (!section) {
    throw new Error(`Unknown analytics section: ${id}`)
  }
  return toOption(section)
}

/** Whether the section's server page must re-render when the shared selection changes. */
export function sectionReadsSelectionOnServer(id: AnalyticsSectionId): boolean {
  return ANALYTICS_SECTIONS.some(
    (section) => section.id === id && section.readsSelectionOnServer,
  )
}

const SECTION_PATH = /^(\/space\/[^/]+\/dashboard)\/(.+?)\/?$/

/** The dashboard base path and the section the pathname is on, if any. */
export function resolveActiveAnalyticsSection(
  pathname: string,
): { base: string; section: AnalyticsSectionOption } | null {
  const match = SECTION_PATH.exec(pathname)
  if (!match) {
    return null
  }
  const [, base = "", rest = ""] = match
  const section = ANALYTICS_SECTIONS.find(
    (candidate) =>
      rest === candidate.segment || rest.startsWith(`${candidate.segment}/`),
  )
  return section ? { base, section: toOption(section) } : null
}
