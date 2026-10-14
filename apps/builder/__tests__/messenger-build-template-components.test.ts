// @vitest-environment node
import { describe, expect, test } from "vitest"
import { buildMessengerMessageTemplateComponents } from "@/features/integration-messenger/message-templates/lib/build-template-components"
import {
  type CreateMessengerMessageTemplateRequest,
  createMessengerMessageTemplateRequest,
} from "@/features/integration-messenger/message-templates/schema/mutation"

const baseInput: CreateMessengerMessageTemplateRequest = {
  name: "test_utility",
  language: "vi",
  headerType: "none",
  headerText: "",
  headerVariables: [],
  body: "Hello {{1}}",
  bodyVariables: [{ key: "{{1}}", example: "Hung" }],
  buttons: [],
}

describe("buildMessengerMessageTemplateComponents", () => {
  test("builds body with double-wrapped examples and no buttons component", () => {
    expect(buildMessengerMessageTemplateComponents(baseInput)).toEqual([
      {
        type: "BODY",
        text: "Hello {{1}}",
        example: {
          body_text: [["Hung"]],
        },
      },
    ])
  })

  test("omits body example when body has no variables", () => {
    expect(
      buildMessengerMessageTemplateComponents({
        ...baseInput,
        body: "Plain body text",
        bodyVariables: [],
      }),
    ).toEqual([
      {
        type: "BODY",
        text: "Plain body text",
      },
    ])
  })

  test("builds text header with header_text example", () => {
    expect(
      buildMessengerMessageTemplateComponents({
        ...baseInput,
        headerType: "text",
        headerText: "Hi {{1}}",
        headerVariables: [{ key: "{{1}}", example: "Customer" }],
      }),
    ).toEqual([
      {
        type: "HEADER",
        format: "TEXT",
        text: "Hi {{1}}",
        example: {
          header_text: ["Customer"],
        },
      },
      {
        type: "BODY",
        text: "Hello {{1}}",
        example: {
          body_text: [["Hung"]],
        },
      },
    ])
  })

  test("omits text header example when header has no variables", () => {
    expect(
      buildMessengerMessageTemplateComponents({
        ...baseInput,
        headerType: "text",
        headerText: "PAMAOI XIN THONG BAO",
        headerVariables: [],
      }),
    ).toEqual([
      {
        type: "HEADER",
        format: "TEXT",
        text: "PAMAOI XIN THONG BAO",
      },
      {
        type: "BODY",
        text: "Hello {{1}}",
        example: {
          body_text: [["Hung"]],
        },
      },
    ])
  })

  test("builds image header with text example and uploaded handle", () => {
    expect(
      buildMessengerMessageTemplateComponents(
        {
          ...baseInput,
          headerType: "text_and_image",
          headerText: "Hi {{1}}",
          headerVariables: [{ key: "{{1}}", example: "Customer" }],
          headerImageUrl: "https://example.com/header.jpg",
        },
        "header-handle",
      ),
    ).toEqual([
      {
        type: "HEADER",
        format: "IMAGE",
        text: "Hi {{1}}",
        example: {
          header_text: ["Customer"],
          header_handle: ["header-handle"],
        },
      },
      {
        type: "BODY",
        text: "Hello {{1}}",
        example: {
          body_text: [["Hung"]],
        },
      },
    ])
  })

  test("omits image header text example when header has no variables", () => {
    expect(
      buildMessengerMessageTemplateComponents(
        {
          ...baseInput,
          headerType: "text_and_image",
          headerText: "PAMAOI XIN THONG BAO",
          headerVariables: [],
          headerImageUrl: "https://example.com/header.jpg",
        },
        "header-handle",
      ),
    ).toEqual([
      {
        type: "HEADER",
        format: "IMAGE",
        text: "PAMAOI XIN THONG BAO",
        example: {
          header_handle: ["header-handle"],
        },
      },
      {
        type: "BODY",
        text: "Hello {{1}}",
        example: {
          body_text: [["Hung"]],
        },
      },
    ])
  })

  test("builds all supported button types", () => {
    expect(
      buildMessengerMessageTemplateComponents({
        ...baseInput,
        buttons: [
          { type: "POSTBACK", title: "Start" },
          {
            type: "PHONE_NUMBER",
            title: "Call",
            phoneNumber: "+84123456789",
          },
          {
            type: "URL",
            title: "Open",
            url: "https://example.com/{{1}}",
            variables: ["abc"],
          },
        ],
      }),
    ).toEqual([
      {
        type: "BODY",
        text: "Hello {{1}}",
        example: {
          body_text: [["Hung"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "POSTBACK",
            text: "Start",
            payload: "{{1}}",
          },
          {
            type: "PHONE_NUMBER",
            text: "Call",
            phone_number: "+84123456789",
          },
          {
            type: "URL",
            text: "Open",
            url: "https://example.com/{{1}}",
            example: {
              url_suffix_example: "https://example.com/abc",
            },
          },
        ],
      },
    ])
  })

  test("omits URL button example when variables are empty", () => {
    expect(
      buildMessengerMessageTemplateComponents({
        ...baseInput,
        buttons: [
          {
            type: "URL",
            title: "Open",
            url: "https://example.com",
            variables: [],
          },
        ],
      }),
    ).toEqual([
      {
        type: "BODY",
        text: "Hello {{1}}",
        example: {
          body_text: [["Hung"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Open",
            url: "https://example.com",
          },
        ],
      },
    ])
  })
})

describe("createMessengerMessageTemplateRequest", () => {
  test("rejects empty URL variable examples", () => {
    expect(
      createMessengerMessageTemplateRequest.safeParse({
        ...baseInput,
        buttons: [
          {
            type: "URL",
            title: "Open",
            url: "https://example.com/{{1}}",
            variables: [""],
          },
        ],
      }).success,
    ).toBe(false)
  })

  test("rejects unsupported body placeholders", () => {
    expect(
      createMessengerMessageTemplateRequest.safeParse({
        ...baseInput,
        body: "Hello {{10}}",
        bodyVariables: [],
      }).success,
    ).toBe(false)

    expect(
      createMessengerMessageTemplateRequest.safeParse({
        ...baseInput,
        body: "Hello {{0}}",
        bodyVariables: [],
      }).success,
    ).toBe(false)
  })

  test("rejects more than one header variable", () => {
    expect(
      createMessengerMessageTemplateRequest.safeParse({
        ...baseInput,
        headerType: "text",
        headerText: "Hello {{1}} {{2}}",
        headerVariables: [
          { key: "{{1}}", example: "One" },
          { key: "{{2}}", example: "Two" },
        ],
      }).success,
    ).toBe(false)
  })

  test("rejects URL example count mismatch", () => {
    expect(
      createMessengerMessageTemplateRequest.safeParse({
        ...baseInput,
        buttons: [
          {
            type: "URL",
            title: "Open",
            url: "https://example.com/{{1}}",
            variables: [],
          },
        ],
      }).success,
    ).toBe(false)
  })

  test("rejects more than one URL variable", () => {
    expect(
      createMessengerMessageTemplateRequest.safeParse({
        ...baseInput,
        buttons: [
          {
            type: "URL",
            title: "Open",
            url: "https://example.com/{{1}}/{{2}}",
            variables: ["one", "two"],
          },
        ],
      }).success,
    ).toBe(false)
  })

  test("turns a pasted Mini App token link into a {{1}} suffix with an example", () => {
    const result = createMessengerMessageTemplateRequest.safeParse({
      ...baseInput,
      buttons: [
        {
          type: "URL",
          title: "Open",
          url: "https://app.example.com/mini-apps?id=12&token={{mini_app_token}}",
          variables: [],
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.data?.buttons[0]).toMatchObject({
      url: "https://app.example.com/mini-apps?id=12&token={{1}}",
      variables: ["example-token"],
    })
  })

  test("turns a pasted Minigame token link into a {{1}} suffix", () => {
    const result = createMessengerMessageTemplateRequest.safeParse({
      ...baseInput,
      buttons: [
        {
          type: "URL",
          title: "Play",
          url: "https://app.example.com/minigames?minigameId=abc&token={{minigame_play_token}}",
          variables: [],
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.data?.buttons[0]).toMatchObject({
      url: "https://app.example.com/minigames?minigameId=abc&token={{1}}",
    })
  })

  test("accepts a pasted token link with trailing whitespace", () => {
    const result = createMessengerMessageTemplateRequest.safeParse({
      ...baseInput,
      buttons: [
        {
          type: "URL",
          title: "Open",
          url: "https://app.example.com/mini-apps?id=12&token={{mini_app_token}} \n",
          variables: [],
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.data?.buttons[0]).toMatchObject({
      url: "https://app.example.com/mini-apps?id=12&token={{1}}",
    })
  })

  test.each([
    ["a non Mini App page", "https://shop.com/go?t={{mini_app_token}}"],
    [
      "a token that is not last",
      "https://app.example.com/mini-apps?id=12&token={{mini_app_token}}&utm=fb",
    ],
    [
      "the other page's token",
      "https://app.example.com/minigames?minigameId=abc&token={{mini_app_token}}",
    ],
  ])("rejects a token variable in %s", (_label, url) => {
    const result = createMessengerMessageTemplateRequest.safeParse({
      ...baseInput,
      buttons: [{ type: "URL", title: "Open", url, variables: [] }],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "The token variable must be the last part of a Mini App or Minigame link",
    )
  })

  test("rejects a token link that has another variable", () => {
    const result = createMessengerMessageTemplateRequest.safeParse({
      ...baseInput,
      buttons: [
        {
          type: "URL",
          title: "Open",
          url: "https://x.example.com/{{1}}/mini-apps?id=1&token={{mini_app_token}}",
          variables: [],
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "A Mini App or Minigame link cannot have other variables besides its token",
    )
  })

  test("rejects any other named variable in a URL", () => {
    expect(
      createMessengerMessageTemplateRequest.safeParse({
        ...baseInput,
        buttons: [
          {
            type: "URL",
            title: "Open",
            url: "https://example.com/?ref={{user_id}}",
            variables: [],
          },
        ],
      }).success,
    ).toBe(false)
  })
})
