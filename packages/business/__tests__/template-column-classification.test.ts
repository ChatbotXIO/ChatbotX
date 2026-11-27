import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  REFERENCE_ARRAY_FIELD_ENTITY_KIND,
  REFERENCE_FIELD_ENTITY_KIND,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { DISCOUNT_CODE_COLUMNS } from "../src/template/adapters/discount-codes"
import { DYNAMIC_IMAGE_COLUMNS } from "../src/template/adapters/dynamic-images"
import { LEADERBOARD_COLUMNS } from "../src/template/adapters/leaderboards"
import { MAGIC_LINK_COLUMNS } from "../src/template/adapters/magic-links"
import { MINI_APP_COLUMNS } from "../src/template/adapters/mini-apps"
import { MINIGAME_COLUMNS } from "../src/template/adapters/minigames"
import { OPEN_HOURS_COLUMNS } from "../src/template/adapters/open-hours"
import { PLACE_LOCATION_COLUMNS } from "../src/template/adapters/place-locations"
import {
  POLL_CANDIDATE_COLUMNS,
  POLL_COLUMNS,
} from "../src/template/adapters/polls"
import { STORE_SETTINGS_COLUMNS } from "../src/template/adapters/store-settings"
import { VENDOR_COLUMNS } from "../src/template/adapters/vendors"

/**
 * The real guard is the compile error each map raises when a column is added
 * without a decision. This only checks the maps exist, say something, and that
 * every column an adapter rebinds or references is actually handled in its source.
 */
type Classification = "copy" | "reset" | "drop" | "rebind" | "reference"

const ADAPTERS: readonly {
  file: string
  columns: Readonly<Record<string, Classification>>
  /** Columns classified `rebind`/`reference` that the adapter source does not name (and why). */
  unnamedInSource?: Readonly<Record<string, string>>
}[] = [
  { file: "magic-links", columns: MAGIC_LINK_COLUMNS },
  { file: "polls", columns: POLL_COLUMNS },
  {
    file: "polls",
    columns: POLL_CANDIDATE_COLUMNS,
    unnamedInSource: { pollId: "set by pollRepository.insertWithCandidates" },
  },
  { file: "dynamic-images", columns: DYNAMIC_IMAGE_COLUMNS },
  { file: "place-locations", columns: PLACE_LOCATION_COLUMNS },
  { file: "mini-apps", columns: MINI_APP_COLUMNS },
  { file: "minigames", columns: MINIGAME_COLUMNS },
  { file: "leaderboards", columns: LEADERBOARD_COLUMNS },
  { file: "open-hours", columns: OPEN_HOURS_COLUMNS },
  { file: "vendors", columns: VENDOR_COLUMNS },
  { file: "discount-codes", columns: DISCOUNT_CODE_COLUMNS },
  { file: "store-settings", columns: STORE_SETTINGS_COLUMNS },
]

/**
 * ID keys nested inside an adapter's JSON columns that the adapter remaps, each
 * either a registered flow-step reference key or listed with the reason it is not.
 */
const NESTED_REFERENCE_KEYS: Readonly<Record<string, readonly string[]>> = {
  minigames: [
    "sharingFlowId",
    "prizeNameCustomFieldId",
    "openerTagIds",
    "playerTagIds",
    "newFriendTagIds",
  ],
  leaderboards: ["referralWelcomeFlowId", "minigameId"],
}
const NOT_A_STEP_KEY: Readonly<Record<string, string>> = {
  // Only the flow steps' own `minigameId`/`referralWelcomeFlowId` are registered;
  // the Leaderboard column of the same name is a table column.
}

const source = (file: string): string =>
  readFileSync(
    resolve(import.meta.dirname, `../src/template/adapters/${file}.ts`),
    "utf8",
  )

/** The adapter source without its column maps, so a column must be named in real code. */
const withoutMaps = (text: string): string =>
  text.replace(
    /export const \w+_COLUMNS = \{[\s\S]*?\n\} as const[^\n]*\n[\s\S]*?\n>\n/g,
    "",
  )

describe("template column classification", () => {
  test("every adapter map classifies its columns", () => {
    for (const { columns } of ADAPTERS) {
      expect(Object.keys(columns).length).toBeGreaterThan(4)
      expect(columns.id).toBe("reset")
    }
  })

  test("every rebound or referenced column is handled in its adapter", () => {
    const unhandled = ADAPTERS.flatMap(({ file, columns, unnamedInSource }) => {
      const code = withoutMaps(source(file))
      return Object.entries(columns)
        .filter(([, kind]) => kind === "rebind" || kind === "reference")
        .map(([column]) => column)
        .filter(
          (column) =>
            !(
              column in (unnamedInSource ?? {}) ||
              new RegExp(`\\b${column}\\b`).test(code)
            ),
        )
        .map((column) => `${file}.${column}`)
    })

    expect(unhandled).toEqual([])
  })

  test("nested reference keys are registered flow-step keys or exempt", () => {
    const registered = new Set([
      ...Object.keys(REFERENCE_FIELD_ENTITY_KIND),
      ...Object.keys(REFERENCE_ARRAY_FIELD_ENTITY_KIND),
    ])
    const unknown = Object.entries(NESTED_REFERENCE_KEYS).flatMap(
      ([file, keys]) =>
        keys
          .filter((key) => !(registered.has(key) || key in NOT_A_STEP_KEY))
          .filter((key) => !new RegExp(`\\b${key}\\b`).test(source(file)))
          .map((key) => `${file}.${key}`),
    )

    expect(unknown).toEqual([])
  })
})
