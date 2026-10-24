export type MarketingMessageErrorClass =
  | "dailyBudget"
  | "lifetimeBudget"
  | "notReady"
  | "transient"
  | "recipientTiming"
  | "recipientPermanent"
  | "campaignBlocker"
  | "campaignInactive"
  | "contentInvalid"
  | "unknown"

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

const CODE_CLASSES: [MarketingMessageErrorClass, number[]][] = [
  ["dailyBudget", [2_300_054]],
  ["lifetimeBudget", [2_300_053, 2_300_015]],
  ["notReady", [2_300_012, 2_300_041, 2_300_033]],
  [
    "transient",
    [
      2_300_055, 2_300_057, 2_300_060, 2_300_061, 2_300_062, 2_300_063,
      2_300_068, 2_300_078, 2_300_080, 2_300_081, 2_300_082, 2_300_083,
      2_300_008,
      // Generic Graph throttling (app/user/page/API-specific rate limits).
      4, 17, 32, 613,
    ],
  ],
  [
    "recipientTiming",
    [2_300_035, 2_300_036, 2_300_042, 2_300_043, 2_300_044, 2_300_052],
  ],
  [
    "recipientPermanent",
    [2_300_004, 2_300_005, 2_300_032, 2_300_034, 2_300_037],
  ],
  ["campaignInactive", [2_300_000, 2_300_002, 2_300_003]],
  [
    "campaignBlocker",
    [
      2_300_001,
      2_300_006,
      2_300_007,
      2_300_009,
      2_300_011,
      2_300_013,
      2_300_014,
      2_300_016,
      2_300_017,
      2_300_019,
      2_300_020,
      2_300_030,
      2_300_031,
      2_300_039,
      2_300_040,
      2_300_056,
      2_300_058,
      2_300_059,
      2_300_065,
      2_300_066,
      2_300_067,
      2_300_069,
      2_300_070,
      2_300_076,
      2_300_091,
      2_300_092,
      2_300_093,
      190,
      // Generic Graph permission (10, 200–299) and policy (368) errors.
      10,
      ...range(200, 299),
      368,
    ],
  ],
  [
    "contentInvalid",
    [
      2_300_010,
      2_300_018,
      ...range(2_300_021, 2_300_027),
      2_300_038,
      2_300_046,
      2_300_047,
      2_300_048,
      2_300_064,
      ...range(2_300_071, 2_300_075),
      2_300_077,
      2_300_090,
    ],
  ],
]

const CLASS_BY_CODE = new Map<number, MarketingMessageErrorClass>(
  CODE_CLASSES.flatMap(([cls, codes]) =>
    codes.map((code): [number, MarketingMessageErrorClass] => [code, cls]),
  ),
)

const HTTP_TOO_MANY_REQUESTS = 429

/**
 * Maps a Meta Graph error code from a Marketing Messages send to a handling
 * class. Without a Graph code, an HTTP 429 is throttling (`transient`).
 */
export function classifyMarketingMessageError(
  code: number | null,
  httpStatus?: number | null,
): MarketingMessageErrorClass {
  if (code === null) {
    return httpStatus === HTTP_TOO_MANY_REQUESTS ? "transient" : "unknown"
  }
  return CLASS_BY_CODE.get(code) ?? "unknown"
}
