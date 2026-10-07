import { describe, expect, test } from "vitest"
import {
  applyMessengerTemplateParameterValues,
  applyWaTemplateParameterValues,
  describeMessengerTemplateParameters,
  describeWaTemplateParameters,
  type TemplateComponent,
} from "../src"

const positional: TemplateComponent[] = [
  { type: "HEADER", format: "IMAGE" },
  { type: "BODY", text: "Hi {{1}}, order {{2}} is ready" },
  {
    type: "BUTTONS",
    buttons: [
      { type: "PHONE_NUMBER", text: "Call", phone_number: "+84" },
      { type: "URL", text: "Track", url: "https://x.io/{{1}}" },
      { type: "COPY_CODE", text: "Copy" },
    ],
  },
]

describe("WhatsApp template parameters", () => {
  test("lists one key per value to fill", () => {
    expect(
      describeWaTemplateParameters(positional).map((spec) => spec.key),
    ).toEqual(["header", "body.1", "body.2", "button.1", "button.2"])
  })

  test("builds the nested params with dense button slots", () => {
    const result = applyWaTemplateParameterValues(positional, {
      header: "https://cdn.x.io/a.jpg",
      "body.1": "Ann",
      "body.2": "#42",
      "button.1": "abc",
      "button.2": "SAVE10",
    })

    expect(result.missing).toEqual([])
    expect(result.unknown).toEqual([])
    expect(result.params).toEqual({
      header: [{ type: "image", image: { link: "https://cdn.x.io/a.jpg" } }],
      body: [
        { type: "text", text: "Ann" },
        { type: "text", text: "#42" },
      ],
      button: [
        { sub_type: "url", index: 1, text: "abc" },
        { sub_type: "copy_code", index: 2, coupon_code: "SAVE10" },
      ],
    })
  })

  test("named placeholders keep parameter_name and are keyed by name", () => {
    const result = applyWaTemplateParameterValues(
      [{ type: "BODY", text: "Order {{order_id}} for {{name}}" }],
      { "body.order_id": "42", "body.name": "Ann" },
    )

    expect(result.params.body).toEqual([
      { type: "text", text: "42", parameter_name: "order_id" },
      { type: "text", text: "Ann", parameter_name: "name" },
    ])
  })

  test("reports missing, unknown and empty keys", () => {
    const result = applyWaTemplateParameterValues(positional, {
      header: "https://cdn.x.io/a.jpg",
      "body.1": "  ",
      nope: "x",
    })

    expect(result.missing).toEqual(["body.1", "body.2", "button.1", "button.2"])
    expect(result.unknown).toEqual(["nope"])
  })

  test("location headers take latitude/longitude, name and address optional", () => {
    const result = applyWaTemplateParameterValues(
      [{ type: "HEADER", format: "LOCATION" }],
      { "header.latitude": "10.7", "header.longitude": "106.7" },
    )

    expect(result.missing).toEqual([])
    expect(result.params.header?.[0]?.location).toEqual({
      latitude: "10.7",
      longitude: "106.7",
      name: "",
      address: "",
    })
  })

  test("carousel cards are keyed by card index", () => {
    const result = applyWaTemplateParameterValues(
      [
        {
          type: "CAROUSEL",
          cards: [
            {
              card_index: 0,
              components: [
                { type: "HEADER", format: "IMAGE" },
                { type: "BODY", text: "Card {{1}}" },
              ],
            },
          ],
        },
      ],
      { "card.0.header": "https://cdn.x.io/c.jpg", "card.0.body.1": "one" },
    )

    expect(result.missing).toEqual([])
    expect(result.params.carousel).toEqual([
      {
        card_index: 0,
        header: [{ type: "image", image: { link: "https://cdn.x.io/c.jpg" } }],
        body: [{ type: "text", text: "one" }],
      },
    ])
  })

  test("a limited-time offer needs a positive millisecond timestamp", () => {
    const components: TemplateComponent[] = [
      {
        type: "LIMITED_TIME_OFFER",
        limited_time_offer: { has_expiration: true },
      },
    ]

    expect(
      applyWaTemplateParameterValues(components, {
        "offer.expiration_ms": "soon",
      }).invalid,
    ).toEqual(["offer.expiration_ms"])
    expect(
      applyWaTemplateParameterValues(components, {
        "offer.expiration_ms": "1767225600000",
      }).params.limited_time_offer,
    ).toEqual({ expiration_time_ms: 1_767_225_600_000 })
  })

  test("a multi-product button is reported as unsupported", () => {
    const result = applyWaTemplateParameterValues(
      [{ type: "BUTTONS", buttons: [{ type: "MPM", text: "View" }] }],
      {},
    )

    expect(result.unsupported).toEqual(["button.0"])
  })
})

describe("Messenger template parameters", () => {
  const components = [
    { type: "HEADER", format: "TEXT", text: "Hello {{1}}" },
    { type: "BODY", text: "Your code is {{1}}" },
    {
      type: "BUTTONS",
      buttons: [{ type: "URL", text: "Open", url: "https://x.io/{{1}}" }],
    },
  ]

  test("lists header, body and URL button keys", () => {
    expect(
      describeMessengerTemplateParameters(components).map((spec) => spec.key),
    ).toEqual(["header.1", "body.1", "button.0"])
  })

  test("builds positional params without parameter_name", () => {
    const result = applyMessengerTemplateParameterValues(
      components,
      "POSITIONAL",
      { "header.1": "Ann", "body.1": "1234", "button.0": "abc" },
    )

    expect(result.missing).toEqual([])
    expect(result.params).toEqual({
      header: [{ type: "text", text: "Ann" }],
      body: [{ text: "1234" }],
      button: [{ sub_type: "url", index: 0, text: "abc" }],
    })
  })
})
