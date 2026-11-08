// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  aiFileObjectPrefix,
  installObjectPrefixes,
  questionnaireImagePrefix,
  savedReplyImageOwnedPrefixes,
  savedReplyImagePrefix,
} from "../src/template/template-object-keys"

describe("template object keys", () => {
  test("each generation has its own prefixes, none a prefix of another's", () => {
    const first = installObjectPrefixes("w", "i", 1)
    const next = installObjectPrefixes("w", "i", 2)
    const tenth = installObjectPrefixes("w", "i", 10)
    for (const [a, b] of [
      [first, next],
      [first, tenth],
      [next, tenth],
      [tenth, first],
    ]) {
      for (const prefix of a) {
        expect(b.some((other) => other.startsWith(prefix))).toBe(false)
      }
    }
  })

  test("a sync attempt stages under the installation's generation, apart from other attempts", () => {
    const one = savedReplyImagePrefix("w", "i", {
      generation: 3,
      attemptKey: "s:1",
    })
    const two = savedReplyImagePrefix("w", "i", {
      generation: 3,
      attemptKey: "s:2",
    })
    expect(one).not.toBe(two)
    expect(
      one.startsWith(savedReplyImagePrefix("w", "i", { generation: 3 })),
    ).toBe(true)
    expect(aiFileObjectPrefix("w", "i", { generation: 3 })).toBe(
      "workspaces/w/ai-files/tpl-i/g3/",
    )
    expect(questionnaireImagePrefix("w", "i", { generation: 0 })).toBe(
      "public/space/w/questionnaire-images/tpl-i/g0/",
    )
  })

  test("everything a generation or sync staged is under the prefix an uninstall matches", () => {
    const owned = savedReplyImageOwnedPrefixes("w", "i")
    const staged = [
      `${savedReplyImagePrefix("w", "i", { generation: 0 })}abc`,
      `${savedReplyImagePrefix("w", "i", { generation: 4, attemptKey: "s:t" })}abc`,
      "public/space/w/media-library/tpl-i:s:t/abc",
    ]
    for (const path of staged) {
      expect(owned.some((prefix) => path.startsWith(prefix))).toBe(true)
    }
    expect(
      owned.some((prefix) =>
        "public/space/w/media-library/tpl-i2/g0/abc".startsWith(prefix),
      ),
    ).toBe(false)
  })
})
