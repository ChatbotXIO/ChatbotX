// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  createPostFeedRequest,
  postFeedResource,
  previewPostFeedRequest,
  previewPostFeedResponse,
  updatePostFeedRequest,
} from "@/features/social-post-feeds/schema"

const create = {
  destinationIds: ["1"],
  feedUrl: "https://example.com/feed.xml",
  name: "Blog",
}

describe("templatesByProvider in the feed requests", () => {
  test("accepts the four networks, each optional, on create, update and preview", () => {
    const templatesByProvider = {
      facebook: "{{ title }}",
      instagram: "{{ title }} {{ categories | hashtags: 3 }}",
      threads: "{{ title }}",
      tiktok: "{{ title }}",
    }

    expect(
      createPostFeedRequest.safeParse({ ...create, templatesByProvider })
        .success,
    ).toBe(true)
    expect(
      createPostFeedRequest.safeParse({
        ...create,
        templatesByProvider: { threads: "x" },
      }).success,
    ).toBe(true)
    expect(
      updatePostFeedRequest.safeParse({ id: "1", templatesByProvider }).success,
    ).toBe(true)
    expect(
      previewPostFeedRequest.safeParse({
        feedUrl: create.feedUrl,
        templatesByProvider,
      }).success,
    ).toBe(true)
  })

  test("refuses a network that is not in the provider enum, an empty text and a text over 5000 characters", () => {
    for (const templatesByProvider of [
      { myspace: "{{ title }}" },
      { facebook: "" },
      { facebook: "x".repeat(5001) },
      { facebook: 3 },
    ]) {
      expect(
        createPostFeedRequest.safeParse({ ...create, templatesByProvider })
          .success,
      ).toBe(false)
    }
  })

  test("the resource always carries the record and the article-picture flag", () => {
    const resource = {
      aiInstructions: null,
      aiIntegrationId: null,
      aiModel: null,
      aiWrite: false,
      consecutiveFailures: 0,
      createdAt: new Date(),
      dailyCap: 10,
      destinationIds: [],
      feedUrl: "https://example.com/feed.xml",
      fetchArticleImage: false,
      filters: null,
      id: "1",
      intervalMinutes: 60,
      lastCheckedAt: null,
      lastErrorCode: null,
      lastRunSummary: null,
      maxItemsPerRun: 5,
      mediaField: null,
      mediaLibraryFileIds: [],
      mediaMode: "auto",
      mode: "draft",
      name: "Blog",
      nextCheckAt: new Date(),
      noImageFallback: "link",
      postAs: "photo",
      postLatestOnFirstCheck: false,
      primed: true,
      signatureId: null,
      startedAt: new Date(),
      status: "active",
      templateSyntax: "v2",
      templatesByProvider: { threads: "{{ title }}" },
      textTemplate: "{{ title }}",
    }

    expect(postFeedResource.safeParse(resource).success).toBe(true)
    expect(
      postFeedResource.safeParse({
        ...resource,
        templatesByProvider: undefined,
      }).success,
    ).toBe(false)
  })
})

describe("fetchArticleImage in the feed requests", () => {
  test("is an optional boolean on create, update and preview", () => {
    expect(
      createPostFeedRequest.safeParse({ ...create, fetchArticleImage: true })
        .success,
    ).toBe(true)
    expect(
      updatePostFeedRequest.safeParse({ fetchArticleImage: false, id: "1" })
        .success,
    ).toBe(true)
    expect(
      previewPostFeedRequest.safeParse({
        feedUrl: create.feedUrl,
        fetchArticleImage: true,
      }).success,
    ).toBe(true)
    expect(
      createPostFeedRequest.safeParse({ ...create, fetchArticleImage: "yes" })
        .success,
    ).toBe(false)
  })
})

describe("the preview response", () => {
  test("carries per-network text and provider tabs", () => {
    const parsed = previewPostFeedResponse.safeParse({
      fieldFormatVersion: 1,
      items: [
        {
          author: null,
          categories: [],
          fields: {},
          image: null,
          images: [],
          itemKey: "k",
          link: null,
          publishedAt: null,
          render: {
            articleImageWillBeTried: false,
            droppedDestinationIds: [],
            filteredBy: null,
            networks: [
              {
                characters: 3,
                issues: [],
                provider: "facebook",
                text: "abc",
                usesOwnTemplate: false,
              },
            ],
            pictures: [{ source: "article", url: "https://x.test/a.jpg" }],
            providerTexts: [
              { provider: "threads", templateProblem: null, text: "t" },
            ],
            shape: "photo",
            templateProblem: null,
            text: "abc",
          },
          summary: null,
          title: null,
        },
      ],
      variables: [],
    })

    expect(parsed.success).toBe(true)
  })
})
