import {
  orderAnalyticsRepository,
  type SalesScope,
} from "@chatbotx.io/database/repositories"
import { roundMoney } from "@chatbotx.io/utils/money"
import { formatInTimeZone } from "date-fns-tz"
import { parseAnalyticsDateRange } from "../ads-analytics/date-range"
import { BaseService } from "../base.service"
import { ecommerceSettingsService } from "../ecommerce-settings/service"
import { workspaceService } from "../workspace/service"

const TOP_LIMIT = 10
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * The change from the previous period, in percent with one decimal. Null
 * when the previous period had nothing to compare with.
 */
export const percentChange = (current: number, previous: number) => {
  if (previous === 0) {
    return current === 0 ? 0 : null
  }
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** Every bucket key of the range, so a chart shows the hours or days without orders. */
export const rangeBucketKeys = (input: {
  from: string
  to: string
  granularity: "hour" | "day"
}): string[] => {
  if (input.granularity === "hour") {
    return Array.from(
      { length: 24 },
      (_, hour) => `${input.from}T${String(hour).padStart(2, "0")}`,
    )
  }
  const keys: string[] = []
  const end = Date.parse(`${input.to}T00:00:00.000Z`)
  for (
    let day = Date.parse(`${input.from}T00:00:00.000Z`);
    day <= end;
    day += MS_PER_DAY
  ) {
    keys.push(new Date(day).toISOString().slice(0, 10))
  }
  return keys
}

/**
 * The store's sales dashboard (spec image 27): lifetime sales, the period's
 * sales, orders and items sold against the period just before it, sales and
 * orders by hour (one day) or day, and the top products and vendors.
 * Cancelled orders never count; amounts are in the store currency, days in
 * the workspace timezone.
 */
class EcommerceAnalyticsService extends BaseService {
  /** `from`/`to` are `YYYY-MM-DD` days of the workspace timezone; both default to today. */
  async getDashboard(input: {
    workspaceId: string
    from?: string | null
    to?: string | null
  }) {
    const [settings, workspace] = await Promise.all([
      ecommerceSettingsService.get(input.workspaceId),
      workspaceService.findById({ id: input.workspaceId }),
    ])
    const today = formatInTimeZone(new Date(), workspace.timezone, "yyyy-MM-dd")
    const range = parseAnalyticsDateRange({
      from: input.from ?? today,
      to: input.to ?? input.from ?? today,
      tz: workspace.timezone,
    })
    const currency = settings.payments.currency
    const scope: SalesScope = {
      workspaceId: input.workspaceId,
      currency,
      since: range.since,
      until: range.until,
    }
    const length = range.until.getTime() - range.since.getTime() + 1
    const previousScope: SalesScope = {
      ...scope,
      since: new Date(range.since.getTime() - length),
      until: new Date(range.since.getTime() - 1),
    }
    const granularity: "hour" | "day" = range.from === range.to ? "hour" : "day"

    const [
      lifetime,
      untilPeriodEnd,
      current,
      previous,
      series,
      topProducts,
      topVendors,
    ] = await Promise.all([
      orderAnalyticsRepository.summary({
        workspaceId: input.workspaceId,
        currency,
      }),
      // Sales up to the end of the period viewed, for the lifetime change:
      // a past period must not count the sales made after it.
      orderAnalyticsRepository.summary({
        workspaceId: input.workspaceId,
        currency,
        until: range.until,
      }),
      orderAnalyticsRepository.summary(scope),
      orderAnalyticsRepository.summary(previousScope),
      orderAnalyticsRepository.series({
        ...scope,
        since: range.since,
        until: range.until,
        timezone: range.timezone,
        granularity,
      }),
      orderAnalyticsRepository.topProducts({ ...scope, limit: TOP_LIMIT }),
      orderAnalyticsRepository.topVendors({ ...scope, limit: TOP_LIMIT }),
    ])

    const byKey = new Map(series.map((point) => [point.key, point]))
    const money = (amount: number) => roundMoney(amount, currency)
    return {
      currency,
      from: range.from,
      to: range.to,
      timezone: range.timezone,
      granularity,
      lifetime: {
        value: money(lifetime.sales),
        // What this period added to what was sold before it.
        change: percentChange(
          untilPeriodEnd.sales,
          untilPeriodEnd.sales - current.sales,
        ),
      },
      sales: {
        value: money(current.sales),
        change: percentChange(current.sales, previous.sales),
      },
      orders: {
        value: current.orders,
        change: percentChange(current.orders, previous.orders),
      },
      products: {
        value: current.products,
        change: percentChange(current.products, previous.products),
      },
      series: rangeBucketKeys({ ...range, granularity }).map((key) => ({
        key,
        sales: money(byKey.get(key)?.sales ?? 0),
        orders: byKey.get(key)?.orders ?? 0,
      })),
      topProducts: topProducts.map((row) => ({
        ...row,
        sales: money(row.sales),
      })),
      topVendors: topVendors.map((row) => ({
        ...row,
        sales: money(row.sales),
      })),
    }
  }
}

export const ecommerceAnalyticsService = new EcommerceAnalyticsService()
