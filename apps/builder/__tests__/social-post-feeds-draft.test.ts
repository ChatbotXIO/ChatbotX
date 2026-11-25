// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  contentSettingsOf,
  draftOfFeed,
  EMPTY_FEED_DRAFT,
  templatesOfDraft,
} from "@/features/social-post-feeds/lib/feed-draft"

const FEED_BASE = {
  consecutiveFailures: 0,
  createdAt: new Date(0),
  id: "1",
  lastCheckedAt: null,
  lastErrorCode: null,
  lastRunSummary: null,
  maxItemsPerRun: 5,
  nextCheckAt: new Date(0),
  primed: true,
  signatureId: null,
  startedAt: new Date(0),
  status: "active" as const,
}

describe("feed draft network texts", () => {
  test("blank network texts are not sent, the others are", () => {
    const draft = {
      ...EMPTY_FEED_DRAFT,
      templatesByProvider: { facebook: "  ", instagram: "{{ title }}" },
    }

    expect(templatesOfDraft(draft)).toEqual({ instagram: "{{ title }}" })
    expect(contentSettingsOf(draft).templatesByProvider).toEqual({
      instagram: "{{ title }}",
    })
  })

  test("a legacy draft sends none", () => {
    expect(
      templatesOfDraft({
        ...EMPTY_FEED_DRAFT,
        templateSyntax: "legacy",
        templatesByProvider: { instagram: "{{ title }}" },
      }),
    ).toEqual({})
  })

  test("the article-picture switch is part of the content settings and defaults off", () => {
    expect(EMPTY_FEED_DRAFT.fetchArticleImage).toBe(false)
    expect(
      contentSettingsOf({ ...EMPTY_FEED_DRAFT, fetchArticleImage: true })
        .fetchArticleImage,
    ).toBe(true)
  })

  test("editing a feed starts from its saved network texts", () => {
    const draft = draftOfFeed({
      ...FEED_BASE,
      aiInstructions: null,
      aiIntegrationId: null,
      aiModel: null,
      aiWrite: false,
      dailyCap: 10,
      destinationIds: [],
      feedUrl: "https://example.com/feed",
      fetchArticleImage: true,
      filters: null,
      intervalMinutes: 60,
      mediaField: null,
      mediaLibraryFileIds: [],
      mediaMode: "auto",
      mode: "draft",
      name: "n",
      noImageFallback: "link",
      postAs: "photo",
      postLatestOnFirstCheck: false,
      templateSyntax: "v2",
      templatesByProvider: { threads: "{{ link }}" },
      textTemplate: "{{ title }}",
    })

    expect(draft.templatesByProvider).toEqual({ threads: "{{ link }}" })
    expect(draft.fetchArticleImage).toBe(true)
  })
})
