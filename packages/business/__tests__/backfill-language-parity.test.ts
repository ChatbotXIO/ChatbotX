import { expect, test } from "vitest"
import { SUPPORTED_LANGUAGES } from "../../database/scripts/backfill-contact-event-attributes.mjs"
import { supportedContactLanguages } from "../src/contact-locale/languages"

// The backfill script is plain JS in the database package and cannot import the
// business package, so it carries its own copy of the supported languages.
// This keeps old (backfilled) and new (live) contact events on the same rule.
test("the backfill script's supported languages match the live emitters'", () => {
  expect([...SUPPORTED_LANGUAGES].sort()).toEqual(
    [...supportedContactLanguages].sort(),
  )
})
