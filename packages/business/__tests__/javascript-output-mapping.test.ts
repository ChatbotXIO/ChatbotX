import { describe, expect, test } from "vitest"
import type { ChatbotXException } from "../src/errors"
import {
  collectJavascriptOutputWrites,
  completeJavascriptMapping,
  isPlainJsonObject,
  jsonObjectFieldKeys,
} from "../src/javascript-execution/output-value"

describe("collectJavascriptOutputWrites", () => {
  const latitude = {
    id: "field-lat",
    name: "latitude",
    type: "number" as const,
  }
  const longitude = {
    id: "field-lng",
    name: "longitude",
    type: "number" as const,
  }
  const dump = {
    id: "field-dump",
    name: "gps_json",
    type: "shortText" as const,
  }
  const mappedFields = new Map([
    [latitude.id, latitude],
    [longitude.id, longitude],
    [dump.id, dump],
  ])
  const gpsMapping = [
    { jsonPath: "latitude", outputFieldId: latitude.id },
    { jsonPath: "longitude", outputFieldId: longitude.id },
  ]

  test("writes mapped JSON paths to the chosen custom fields", () => {
    expect(
      collectJavascriptOutputWrites({
        value: { latitude: 4.6097, longitude: -74.0817 },
        primaryField: null,
        mappedFields,
        mapping: gpsMapping,
      }),
    ).toEqual([
      { customFieldId: "field-lat", value: "4.6097" },
      { customFieldId: "field-lng", value: "-74.0817" },
    ])
  })

  test("follows nested JSON paths the same way External API Request does", () => {
    expect(
      collectJavascriptOutputWrites({
        value: { data: [{ lat: 1.85, lon: -76.05 }] },
        primaryField: null,
        mappedFields,
        mapping: [
          { jsonPath: "data.0.lat", outputFieldId: latitude.id },
          { jsonPath: "data.0.lon", outputFieldId: longitude.id },
        ],
      }),
    ).toEqual([
      { customFieldId: "field-lat", value: "1.85" },
      { customFieldId: "field-lng", value: "-76.05" },
    ])
  })

  test("also dumps the full JSON onto the primary field when it was not written by a path", () => {
    const value = { latitude: 4.6097, longitude: -74.0817 }
    expect(
      collectJavascriptOutputWrites({
        value,
        primaryField: dump,
        mappedFields,
        mapping: gpsMapping,
      }),
    ).toEqual([
      { customFieldId: "field-lat", value: "4.6097" },
      { customFieldId: "field-lng", value: "-74.0817" },
      { customFieldId: "field-dump", value: JSON.stringify(value) },
    ])
  })

  test("does not dump JSON onto the primary field when that field was already written by a path", () => {
    expect(
      collectJavascriptOutputWrites({
        value: { latitude: 4.6097, longitude: -74.0817 },
        primaryField: latitude,
        mappedFields,
        mapping: gpsMapping,
      }),
    ).toEqual([
      { customFieldId: "field-lat", value: "4.6097" },
      { customFieldId: "field-lng", value: "-74.0817" },
    ])
  })

  test("dumps an unmapped object onto the primary text field", () => {
    const value = { profile: { name: "Ada" }, active: true }
    expect(
      collectJavascriptOutputWrites({
        value,
        primaryField: dump,
        mappedFields,
        mapping: [],
      }),
    ).toEqual([{ customFieldId: "field-dump", value: JSON.stringify(value) }])
  })

  test("throws when mapped paths miss and no primary field is set", () => {
    expect(() =>
      collectJavascriptOutputWrites({
        value: { other: 1 },
        primaryField: null,
        mappedFields,
        mapping: gpsMapping,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatbotXException>>({
        code: "javascriptOutputNoMatchingFields",
      }),
    )
  })

  test("requires a primary field for a scalar return without mapping", () => {
    expect(() =>
      collectJavascriptOutputWrites({
        value: 42,
        primaryField: null,
        mappedFields,
        mapping: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ChatbotXException>>({
        code: "javascriptOutputFieldRequired",
      }),
    )
  })

  test("skips prototype-pollution keys from JSON.parse payloads", () => {
    const value = JSON.parse(
      '{"latitude":1,"__proto__":2,"constructor":3}',
    ) as Record<string, unknown>
    expect(jsonObjectFieldKeys(value)).toEqual(["latitude"])
    expect(isPlainJsonObject({ latitude: 1 })).toBe(true)
    expect(isPlainJsonObject([1, 2])).toBe(false)
  })

  test("drops incomplete mapping rows and unsafe paths", () => {
    expect(
      completeJavascriptMapping([
        { jsonPath: "", outputFieldId: "field-lat" },
        { jsonPath: "latitude", outputFieldId: "" },
        { jsonPath: "__proto__", outputFieldId: "field-lat" },
        { jsonPath: "latitude", outputFieldId: "field-lat" },
      ]),
    ).toEqual([{ jsonPath: "latitude", outputFieldId: "field-lat" }])
  })
})
