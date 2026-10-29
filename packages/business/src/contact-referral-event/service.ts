import {
  type DatabaseClient,
  db,
  isStatementTimeoutError,
} from "@chatbotx.io/database/client"
import { CONTACT_AD_IDS_LIMIT } from "@chatbotx.io/database/partials"
import {
  type AdStatsRange,
  contactReferralEventRepository,
  type RecentAd,
} from "@chatbotx.io/database/repositories"
import type {
  ContactInboxReferral,
  ContactReferralEventProvider,
} from "@chatbotx.io/database/schema"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import {
  getDefaultAdsAnalyticsRange,
  parseAnalyticsDateRange,
  resolveTimezone,
} from "../ads-analytics/date-range"
import { contactActivityService } from "../contact-activity"
import { reportTimeoutException } from "../errors"
import type { IdLabel } from "../select-labels-by-ids"
import {
  type ReferralOccurrence,
  toAdClickActivityEntries,
  toAdTouches,
} from "./ad-touch"

/** An ad report scans every touch in its range, so it is cut off at this. */
const AD_STATS_STATEMENT_TIMEOUT = "15s"

/** One export page of ad id lists is a quick indexed read; cut it off at this. */
const AD_IDS_PAGE_STATEMENT_TIMEOUT = "15s"

export type AdStats = {
  adId: string
  title: string | null
  /** Contacts that came from this ad at least once in the range. */
  anyTouchContacts: number
  /** Contacts whose first ad in the range was this one. */
  firstTouchContacts: number
  leads: number
  purchases: number
  /** Value of the conversions credited to this ad, per currency. */
  revenue: { currency: string | null; amount: string }[]
}

/** "Headline (id)" when the ad has a known headline, else the bare id. */
export const formatAdLabel = (ad: RecentAd): string =>
  ad.title ? `${ad.title} (${ad.adId})` : ad.adId

class ContactReferralEventService {
  /**
   * Appends every ad touch `referral` carries, and marks the contact as having
   * clicked each ad for the "Clicked ad" filter. Idempotent per touch (webhook
   * retry, repeat profile lookup). A failure throws; `updateTracking` contains
   * it so the message carrying the referral is never failed by this log.
   */
  async recordAdTouches(
    input: {
      workspaceId: string
      contactId: string
      contactInboxId: string
      channel: string
      referral: ContactInboxReferral | null | undefined
      occurrence: ReferralOccurrence
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const touches = toAdTouches(input.referral, input.occurrence)

    for (const touch of touches) {
      await contactReferralEventRepository.insertIgnoreDuplicate(
        {
          ...touch,
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          contactInboxId: input.contactInboxId,
          channel: input.channel,
          type: "ad",
        },
        tx,
      )
    }

    await contactActivityService.record({
      entries: toAdClickActivityEntries(touches, input.contactId),
      tx,
      workspaceId: input.workspaceId,
    })
  }

  /**
   * Ads the workspace's contacts came from lately, newest first. Bounded: only
   * the newest touches are looked at (see `RECENT_AD_TOUCH_SCAN_LIMIT`).
   */
  async listRecentAds(
    input: { workspaceId: string; limit: number; search?: string },
    tx: DatabaseClient = db,
  ): Promise<RecentAd[]> {
    return await contactReferralEventRepository.listRecentAds(input, tx)
  }

  /**
   * A name for each ad id a filter references. An ad that is no longer among
   * the recent ones is still a valid reference, so it is named by its id
   * rather than reported missing.
   */
  async listLabelsByIds(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<IdLabel[]> {
    if (input.ids.length === 0) {
      return []
    }

    const recent = await contactReferralEventRepository.listRecentAds(
      {
        workspaceId: input.workspaceId,
        adIds: input.ids,
        limit: input.ids.length,
      },
      tx,
    )
    const titleByAdId = new Map(recent.map((ad) => [ad.adId, ad.title]))
    return input.ids.map((id) => ({
      id,
      name: formatAdLabel({ adId: id, title: titleByAdId.get(id) ?? null }),
    }))
  }

  /**
   * Per-ad report over a date range: contacts reached, first-touch contacts and
   * the conversions credited to the ad's touches. `from`/`to` are day keys in
   * the viewer's `tz`, resolved and capped like every other Ads report.
   * Conversions are the Meta ones linked to a touch
   * (`AdsConversionEvent.referralEventId`), so a conversion recorded before
   * touches were logged is not counted here.
   */
  async getAdStats(input: {
    workspaceId: string
    /** Day key; defaults to the last 7 days ending today in `tz`. */
    from?: string
    to?: string
    tz?: string
    channel?: string
    limit: number
  }): Promise<AdStats[]> {
    const tz = resolveTimezone(input.tz ?? "")
    const defaults = getDefaultAdsAnalyticsRange(new Date(), tz)
    const { since, until } = parseAnalyticsDateRange({
      from: input.from ?? defaults.from,
      to: input.to ?? defaults.to,
      tz,
    })
    const range = {
      workspaceId: input.workspaceId,
      since,
      until,
      channel: input.channel,
      limit: input.limit,
    }

    try {
      return await db.transaction(async (tx) => {
        await setLocalStatementTimeout(tx, AD_STATS_STATEMENT_TIMEOUT)
        return await this.buildAdStats(range, tx)
      })
    } catch (error) {
      throw isStatementTimeoutError(error) ? reportTimeoutException() : error
    }
  }

  private async buildAdStats(
    input: AdStatsRange & { limit: number },
    tx: DatabaseClient,
  ): Promise<AdStats[]> {
    const touchStats =
      await contactReferralEventRepository.aggregateAdTouchStats(input, tx)
    const conversions =
      await contactReferralEventRepository.aggregateMetaLinkedConversions(
        { ...input, adIds: touchStats.map((row) => row.adId) },
        tx,
      )
    const conversionsByAd = Map.groupBy(conversions, (item) => item.adId)

    return touchStats.map((row) => {
      const credited = { leads: 0, purchases: 0 }
      const revenue: AdStats["revenue"] = []
      for (const item of conversionsByAd.get(row.adId) ?? []) {
        if (item.eventType === "lead") {
          credited.leads += item.count
          continue
        }
        credited.purchases += item.count
        if (item.amount !== "0") {
          revenue.push({ currency: item.currency, amount: item.amount })
        }
      }
      return {
        adId: row.adId,
        title: row.title,
        anyTouchContacts: row.anyTouchContacts,
        firstTouchContacts: row.firstTouchContacts,
        ...credited,
        revenue,
      }
    })
  }

  /**
   * Distinct ad ids (across inboxes, oldest touch first, at most
   * `CONTACT_AD_IDS_LIMIT` each) for a page of contacts in one query. A contact
   * with no ad touch is absent from the map. The query aggregates every touch
   * of those contacts before the cap applies, so it runs under a statement
   * timeout: a runaway page fails the caller (the export job) instead of
   * holding a connection.
   */
  async listAdIdsByContacts(input: {
    workspaceId: string
    contactIds: string[]
  }): Promise<Map<string, string[]>> {
    return await db.transaction(async (tx) => {
      await setLocalStatementTimeout(tx, AD_IDS_PAGE_STATEMENT_TIMEOUT)
      return await contactReferralEventRepository.listAdIdsByContacts(
        { ...input, limitPerContact: CONTACT_AD_IDS_LIMIT },
        tx,
      )
    })
  }

  /** Distinct ad ids of a contact (across its inboxes), oldest touch first. */
  async listAdIds(
    input: { workspaceId: string; contactId: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    return await contactReferralEventRepository.listAdIdsByContact(input, tx)
  }

  /**
   * The id of the ad touch a conversion is credited to, to link it for
   * reporting. Attribution itself is unchanged: this only names the touch.
   */
  async findAttributedTouchId(
    input: {
      workspaceId: string
      contactInboxId: string | null | undefined
      provider: ContactReferralEventProvider
      clickId?: string | null
      adId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    if (!input.contactInboxId) {
      return null
    }

    return await contactReferralEventRepository.findLatestAdTouchId(
      { ...input, contactInboxId: input.contactInboxId },
      tx,
    )
  }
}

export const contactReferralEventService = new ContactReferralEventService()
