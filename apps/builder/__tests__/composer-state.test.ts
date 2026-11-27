import { publishDestinationStates } from "@chatbotx.io/utils/publish-destination"
import { expect, test } from "vitest"
import { outcomeOf } from "@/features/social-posts/hooks/use-composer-submit"
import {
  areTargetTimesValid,
  buildContent,
  canSaveComposer,
  EMPTY_COMPOSER_STATE,
  everyTargetTimed,
  hasTargetTimes,
  isLinkValid,
  issuesOfDestination,
  isTargetTimeValid,
  preselectSingleDestination,
  stateFromPost,
  strictestMaxCharacters,
  toggleDestination,
  updateTarget,
  withoutTargetTimes,
} from "@/features/social-posts/lib/composer-state"
import {
  flattenDestinations,
  isDestinationSelectable,
  type PublishDestinationGroup,
  type PublishDestinationOption,
  providersWithDestinations,
  selectableDestinations,
} from "@/features/social-posts/lib/publish-destination-options"

test("toggling a destination adds it, then removes it, without mutating", () => {
  const added = toggleDestination(EMPTY_COMPOSER_STATE, "d1")
  expect(added.targets.map((target) => target.destinationId)).toEqual(["d1"])
  expect(EMPTY_COMPOSER_STATE.targets).toEqual([])
  expect(toggleDestination(added, "d1").targets).toEqual([])
})

test("a target follows the shared content until it is customised", () => {
  const state = {
    ...toggleDestination(EMPTY_COMPOSER_STATE, "d1"),
    text: "hello",
  }
  const [plain] = buildContent(state).targets
  expect(plain).toMatchObject({ contentType: undefined, text: null })

  const customised = updateTarget(state, "d1", {
    contentType: "reel",
    customised: true,
    options: { shareToFeed: false },
    text: "own",
  })
  const [own] = buildContent(customised).targets
  expect(own).toMatchObject({
    contentType: "reel",
    options: { shareToFeed: false },
    text: "own",
  })
})

test("empty text and link are sent as null", () => {
  expect(buildContent(EMPTY_COMPOSER_STATE)).toMatchObject({
    linkUrl: null,
    text: null,
  })
})

test("a file known by library id is sent by id, otherwise by url", () => {
  const media = [
    { id: "9", kind: "image", mimeType: "image/png", name: "a", url: "u1" },
    { id: null, kind: "image", mimeType: "image/png", name: "b", url: "u2" },
  ] as const
  expect(
    buildContent({ ...EMPTY_COMPOSER_STATE, media: [...media] }).media,
  ).toEqual([{ mediaLibraryFileId: "9" }, { url: "u2" }])
})

test("only absolute http(s) links are valid; empty is fine", () => {
  expect(isLinkValid("")).toBe(true)
  expect(isLinkValid("https://example.com/a")).toBe(true)
  expect(isLinkValid("htt")).toBe(false)
  expect(isLinkValid("javascript:alert(1)")).toBe(false)
})

test("the strictest limit is the smallest known one", () => {
  const item = (maxCharacters: number | null) =>
    ({ maxCharacters }) as Parameters<typeof strictestMaxCharacters>[0][number]
  expect(strictestMaxCharacters([item(500), item(null), item(280)])).toBe(280)
  expect(strictestMaxCharacters([item(null)])).toBeNull()
})

test("issues are picked per destination", () => {
  const issues = [
    {
      code: "textTooLong",
      destinationId: "a",
      field: "text",
      message: "",
      targetIndex: 0,
    },
    {
      code: "textRequired",
      destinationId: "b",
      field: "text",
      message: "",
      targetIndex: 1,
    },
  ] as const
  expect(issuesOfDestination(issues, "b")).toHaveLength(1)
})

const option = (
  id: string,
  state: PublishDestinationOption["state"] = "ready",
): PublishDestinationOption => ({
  avatar: null,
  contentTypes: [],
  externalId: null,
  id,
  inboxId: `inbox-${id}`,
  integrationId: null,
  missingScopes: [],
  name: id,
  pausedUntil: null,
  pauseReason: null,
  profileUrl: null,
  provider: "facebook",
  socialAccountId: null,
  state,
  viaFacebook: false,
})

const group = (
  destinations: PublishDestinationOption[],
  provider: PublishDestinationGroup["provider"] = "facebook",
): PublishDestinationGroup => ({ destinations, provider, truncated: false })

test("a single ready destination is preselected; not-ready ones never are", () => {
  const one = preselectSingleDestination([
    group([option("x"), option("y", "needsReconnect")]),
    group([option("z", "permissionMissing")], "instagram"),
  ])
  expect(one.targets.map((target) => target.destinationId)).toEqual(["x"])
  const two = preselectSingleDestination([group([option("x"), option("y")])])
  expect(two.targets).toEqual([])
  const none = preselectSingleDestination([
    group([option("x", "inboxDisconnected")]),
  ])
  expect(none.targets).toEqual([])
})

test("only a ready destination is selectable", () => {
  expect(isDestinationSelectable(option("a"))).toBe(true)
  for (const state of publishDestinationStates.options) {
    expect(isDestinationSelectable(option("a", state))).toBe(state === "ready")
  }
})

test("selectable destinations span networks and skip not-ready ones", () => {
  const groups = [
    group([option("a"), option("b", "needsReconnect")]),
    group([option("c")], "threads"),
  ]
  expect(selectableDestinations(groups).map((item) => item.id)).toEqual([
    "a",
    "c",
  ])
  expect(flattenDestinations(groups)).toHaveLength(3)
})

test("networks without destinations are not offered", () => {
  expect(
    providersWithDestinations([
      group([option("a")]),
      group([], "tiktok"),
      group([option("c")], "threads"),
    ]),
  ).toEqual(["facebook", "threads"])
})

test("parts and the first comment are sent whether or not the target is customised; an empty comment is null", () => {
  const state = updateTarget(
    toggleDestination(EMPTY_COMPOSER_STATE, "d1"),
    "d1",
    { firstComment: "  see link  ", parts: ["two", "three"] },
  )
  const [plain] = buildContent(state).targets
  expect(plain).toMatchObject({
    firstComment: { text: "see link" },
    parts: [{ text: "two" }, { text: "three" }],
  })

  const [empty] = buildContent(
    toggleDestination(EMPTY_COMPOSER_STATE, "d1"),
  ).targets
  expect(empty).toMatchObject({ firstComment: null, parts: [] })
})

test("a saved post's parts and first comment come back into the editor in order", () => {
  const state = stateFromPost({
    linkUrl: null,
    media: [],
    targets: [
      {
        contentType: "text",
        destination: { id: "d1" },
        media: [],
        options: {},
        overridesMedia: false,
        parts: [
          { kind: "threadPart", position: 1, text: "two" },
          { kind: "threadPart", position: 2, text: "three" },
          { kind: "firstComment", position: 3, text: "c" },
        ],
        textOverride: null,
      },
    ],
    text: "one",
    topics: [],
  } as never)
  expect(state.targets[0]).toMatchObject({
    firstComment: "c",
    parts: ["two", "three"],
  })
})

const savedPost = (
  target: Record<string, unknown>,
  media: Record<string, unknown>[] = [],
) =>
  ({
    linkUrl: null,
    media,
    targets: [
      {
        destination: { id: "d1" },
        media,
        options: {},
        overridesMedia: false,
        parts: [],
        provider: "instagram",
        textOverride: null,
        ...target,
      },
    ],
    text: "caption",
    topics: [],
  }) as never

const image = {
  kind: "image",
  mediaLibraryFileId: "m1",
  mimeType: "image/png",
  url: "https://x/a.png",
}

test("TikTok settings chosen on a target that is not customised still reach the request", () => {
  const state = updateTarget(
    toggleDestination(EMPTY_COMPOSER_STATE, "d1"),
    "d1",
    { options: { privacyLevel: "PUBLIC_TO_EVERYONE" } },
  )
  const [target] = buildContent(state).targets
  expect(target?.options).toEqual({ privacyLevel: "PUBLIC_TO_EVERYONE" })
})

test("a saved Story keeps its content type through reopen and save", () => {
  const state = stateFromPost(savedPost({ contentType: "story" }, [image]))
  const [target] = buildContent(state).targets
  expect(target?.contentType).toBe("story")
})

test("a saved Facebook Reel keeps its content type through reopen and save", () => {
  const video = { ...image, kind: "video", mimeType: "video/mp4" }
  const [target] = buildContent(
    stateFromPost(
      savedPost({ contentType: "reel", provider: "facebook" }, [video]),
    ),
  ).targets
  expect(target?.contentType).toBe("reel")
})

test("a saved carousel follows its files, which the server infers again", () => {
  const state = stateFromPost(
    savedPost({ contentType: "carousel" }, [image, image]),
  )
  expect(buildContent(state).targets[0]?.contentType).toBeUndefined()
})

test("a saved post whose type follows its files stays unpinned, so adding a file can change it", () => {
  const state = stateFromPost(savedPost({ contentType: "text" }))
  expect(state.targets[0]).toMatchObject({
    contentType: null,
    customised: false,
  })
  expect(buildContent(state).targets[0]?.contentType).toBeUndefined()
})

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

test("a destination's own time is sent as an ISO instant, and only when it has one", () => {
  const at = new Date("2030-01-02T03:04:00.000Z")
  const state = updateTarget(
    toggleDestination(toggleDestination(EMPTY_COMPOSER_STATE, "d1"), "d2"),
    "d1",
    { scheduledAt: at },
  )
  const [own, shared] = buildContent(state).targets ?? []
  expect(own?.scheduledAt).toBe("2030-01-02T03:04:00.000Z")
  expect(shared?.scheduledAt).toBeUndefined()
  expect(hasTargetTimes(state)).toBe(true)
  expect(hasTargetTimes(EMPTY_COMPOSER_STATE)).toBe(false)
})

test("a destination's own time must be 2 minutes to one year ahead", () => {
  const now = Date.UTC(2030, 0, 1)
  expect(isTargetTimeValid(new Date(now + MINUTE_MS), now)).toBe(false)
  expect(isTargetTimeValid(new Date(now + 2 * MINUTE_MS), now)).toBe(true)
  expect(isTargetTimeValid(new Date(now + 365 * DAY_MS), now)).toBe(true)
  expect(isTargetTimeValid(new Date(now + 366 * DAY_MS), now)).toBe(false)
})

test("a post with a past time of its own cannot be saved", () => {
  const withTime = (scheduledAt: Date) =>
    updateTarget(toggleDestination(EMPTY_COMPOSER_STATE, "d1"), "d1", {
      scheduledAt,
    })
  const past = withTime(new Date(Date.now() - DAY_MS))
  expect(areTargetTimesValid(past)).toBe(false)
  expect(canSaveComposer(past)).toBe(false)
  const future = withTime(new Date(Date.now() + DAY_MS))
  expect(canSaveComposer(future)).toBe(true)
})

test("a draft keeps no per-destination times", () => {
  const state = updateTarget(
    toggleDestination(EMPTY_COMPOSER_STATE, "d1"),
    "d1",
    { scheduledAt: new Date(Date.now() + DAY_MS) },
  )
  const [target] = withoutTargetTimes(buildContent(state)).targets ?? []
  expect(target).not.toHaveProperty("scheduledAt")
})

test("a destination's own files are sent as given; an empty list means no files", () => {
  const state = toggleDestination(EMPTY_COMPOSER_STATE, "d1")
  expect(buildContent(state).targets?.[0]?.media).toBeNull()
  const none = updateTarget(state, "d1", { media: [] })
  expect(buildContent(none).targets?.[0]?.media).toEqual([])
  const own = updateTarget(state, "d1", {
    media: [
      {
        id: "f1",
        kind: "image",
        mimeType: "image/png",
        name: "a.png",
        url: "https://x/a.png",
      },
    ],
  })
  expect(buildContent(own).targets?.[0]?.media).toEqual([
    { mediaLibraryFileId: "f1" },
  ])
})

test("scheduling without a shared time needs every destination to have its own time", () => {
  const at = "2030-01-01T10:00:00.000Z"
  expect(everyTargetTimed({ targets: [] } as never)).toBe(false)
  expect(
    everyTargetTimed({
      targets: [{ destinationId: "1", scheduledAt: at }],
    } as never),
  ).toBe(true)
  expect(
    everyTargetTimed({
      targets: [
        { destinationId: "1", scheduledAt: at },
        { destinationId: "2" },
      ],
    } as never),
  ).toBe(false)
})

test("a post scheduled only by destination times lands as scheduled, never as a draft", () => {
  const at = "2030-01-01T10:00:00.000Z"
  expect(
    outcomeOf({ targets: [{ scheduledAt: at }, { scheduledAt: at }] }),
  ).toBe("scheduled")
  expect(outcomeOf({ scheduledAt: at })).toBe("scheduled")
  expect(outcomeOf({ queue: "next" })).toBe("scheduled")
  expect(outcomeOf({ publish: "now", targets: [{}] })).toBe("now")
  expect(outcomeOf({ publish: "draft", targets: [{}] })).toBe("draft")
})
