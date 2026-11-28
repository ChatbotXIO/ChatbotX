import { channelTypes } from "@chatbotx.io/utils/channel"
import { channelPostContentTypes } from "@chatbotx.io/utils/channel-post"
import { describe, expect, test } from "vitest"
import {
  type ChannelPostShareCapability,
  getChannelPostShareability,
} from "../src/channel-rules/channel-post-share-rules"
import { resolveStepValidator } from "../src/channel-rules/channel-validator"
import {
  CHANNEL_FLOW_POLICIES,
  channelDeliverableStepTypes,
  stepSupport,
} from "../src/channel-rules/policies"
import { channelAwareStepValidators } from "../src/channel-rules/validators"
import {
  sendChannelPostStepDefaultFn,
  sendChannelPostStepSchema,
} from "../src/steps/send-channel-post"
import { stepTypes } from "../src/steps/step-action"
import { flowValidationCodes } from "../src/validation-codes"

const types = channelPostContentTypes.enum
const instagram = CHANNEL_FLOW_POLICIES[channelTypes.enum.instagram]
const messenger = CHANNEL_FLOW_POLICIES[channelTypes.enum.messenger]
const LINK = "https://www.instagram.com/p/abc/"

describe("getChannelPostShareability", () => {
  test("a native-media channel needs no link", () => {
    expect(
      getChannelPostShareability(instagram, {
        contentType: types.photo,
        permalink: null,
      }),
    ).toEqual({ shareable: true, mode: "nativeMedia" })
  })

  test("a text-link channel needs the link", () => {
    expect(
      getChannelPostShareability(messenger, {
        contentType: types.photo,
        permalink: LINK,
      }),
    ).toEqual({ shareable: true, mode: "textLink" })
    for (const permalink of [null, "", "   "]) {
      expect(
        getChannelPostShareability(messenger, {
          contentType: types.photo,
          permalink,
        }),
      ).toEqual({ shareable: false, reason: "linkUnavailable" })
    }
  })

  test("a link longer than the text limit is refused, one at the limit is not", () => {
    const atLimit = `https://x.test/${"a".repeat(messenger.limits.text - 15)}`
    expect(
      getChannelPostShareability(messenger, {
        contentType: types.photo,
        permalink: atLimit,
      }).shareable,
    ).toBe(true)
    expect(
      getChannelPostShareability(messenger, {
        contentType: types.photo,
        permalink: `${atLimit}a`,
      }),
    ).toEqual({ shareable: false, reason: "linkTooLong" })
  })

  test("a kind the channel does not take, or an unknown one, is refused", () => {
    for (const contentType of [types.story, types.live, types.text, null]) {
      expect(
        getChannelPostShareability(instagram, { contentType, permalink: LINK }),
      ).toEqual({ shareable: false, reason: "typeNotShareable" })
    }
    for (const contentType of [types.story, types.live, types.audio, null]) {
      expect(
        getChannelPostShareability(messenger, { contentType, permalink: LINK }),
      ).toEqual({ shareable: false, reason: "typeNotShareable" })
    }
  })

  test("a channel with no capability cannot send posts", () => {
    expect(
      getChannelPostShareability(CHANNEL_FLOW_POLICIES.whatsapp, {
        contentType: types.photo,
        permalink: LINK,
      }),
    ).toEqual({ shareable: false, reason: "shareUnsupported" })
  })

  test("a capability's mode alone decides the link rule (a new channel is data)", () => {
    const capability: ChannelPostShareCapability = {
      mode: "textLink",
      contentTypes: [types.photo],
    }
    expect(
      getChannelPostShareability(
        { limits: { text: 100 }, channelPostShare: capability },
        { contentType: types.photo, permalink: null },
      ),
    ).toEqual({ shareable: false, reason: "linkUnavailable" })
  })
})

describe("channel policy contract for sendChannelPost", () => {
  test("a channel supports the step if and only if it declares channelPostShare", () => {
    for (const [channel, policy] of Object.entries(CHANNEL_FLOW_POLICIES)) {
      expect({
        channel,
        supported: policy.steps.sendChannelPost !== stepSupport.unsupported,
      }).toEqual({ channel, supported: Boolean(policy.channelPostShare) })
    }
  })

  test("only instagram (native) and messenger (text link) declare it in v1", () => {
    const declared = Object.entries(CHANNEL_FLOW_POLICIES)
      .filter(([, policy]) => policy.channelPostShare)
      .map(([channel, policy]) => [channel, policy.channelPostShare?.mode])
    expect(declared).toEqual([
      ["instagram", "nativeMedia"],
      ["messenger", "textLink"],
    ])
  })

  test("it is a channel step that omnichannel does not inherit", () => {
    expect(channelDeliverableStepTypes).toContain(
      stepTypes.enum.sendChannelPost,
    )
    expect(
      CHANNEL_FLOW_POLICIES[channelTypes.enum.omnichannel].steps
        .sendChannelPost,
    ).toBe(stepSupport.unsupported)
  })
})

describe("sendChannelPost step", () => {
  const validator = channelAwareStepValidators[stepTypes.enum.sendChannelPost]
  const issueCodes = (channel: string, channelPostId: string): string[] => {
    if (!validator) {
      throw new Error("sendChannelPost validator is not registered")
    }
    const result = resolveStepValidator(validator, channel).safeParse(
      sendChannelPostStepDefaultFn({ channelPostId }),
    )
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.message)
  }

  test("a new step is empty and still parses, so a template can leave it blank", () => {
    const step = sendChannelPostStepDefaultFn()
    expect(step.channelPostId).toBe("")
    expect(sendChannelPostStepSchema.safeParse(step).success).toBe(true)
  })

  test("publish rejects an empty step on every channel and accepts a picked one", () => {
    for (const channel of ["instagram", "messenger", "omnichannel"]) {
      expect(issueCodes(channel, "")).toEqual([
        flowValidationCodes.sendChannelPostPostRequired,
      ])
      expect(issueCodes(channel, "  ")).toEqual([
        flowValidationCodes.sendChannelPostPostRequired,
      ])
      expect(issueCodes(channel, "123")).toEqual([])
      expect(issueCodes(channel, "9223372036854775807")).toEqual([])
    }
  })

  test("publish rejects a malformed or overflowing post id", () => {
    for (const channelPostId of [
      "abc",
      "12a",
      " 123",
      "123 ",
      "-1",
      "1.5",
      "9223372036854775808",
      "99999999999999999999",
    ]) {
      expect(issueCodes("messenger", channelPostId)).toEqual([
        flowValidationCodes.sendChannelPostPostRequired,
      ])
    }
  })
})
