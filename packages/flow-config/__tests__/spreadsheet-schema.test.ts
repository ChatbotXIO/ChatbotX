import { describe, expect, test } from "vitest"
import {
  spreadsheetContactToSheetMappingSchema,
  spreadsheetGetRandomRowSchema,
  spreadsheetGetRowSchema,
  spreadsheetSendDataSchema,
  spreadsheetSheetToContactMappingSchema,
  spreadsheetUpdateRowSchema,
} from "../src"

const baseStep = {
  id: "1",
  spreadsheetId: "2",
  sheetName: "Sheet1",
  states: [
    { id: "3", stateType: "success" },
    { id: "4", stateType: "error" },
  ],
}

const lookup = {
  mode: "AND",
  conditions: [],
}

describe("spreadsheetSheetToContactMappingSchema", () => {
  test("allows leaving customFieldId blank while preserving the header", () => {
    const parsed = spreadsheetSheetToContactMappingSchema.parse({
      customFieldId: "",
      header: "Messenger user id",
    })

    expect(parsed).toEqual({
      customFieldId: "",
      header: "Messenger user id",
    })
  })

  test("still requires a column header", () => {
    expect(() =>
      spreadsheetSheetToContactMappingSchema.parse({
        customFieldId: "",
        header: "",
      }),
    ).toThrow()
  })
})

describe("spreadsheet step schemas", () => {
  test.each([
    ["spreadsheetGetRow", spreadsheetGetRowSchema],
    ["spreadsheetGetRandomRow", spreadsheetGetRandomRowSchema],
  ])("allows blank customFieldId for %s mappings", (stepType, schema) => {
    const parsed = schema.parse({
      ...baseStep,
      stepType,
      lookup,
      map: [{ customFieldId: "", header: "Messenger user id" }],
    })

    expect(parsed.map).toEqual([
      { customFieldId: "", header: "Messenger user id" },
    ])
  })

  test.each([
    ["spreadsheetUpdateRow", spreadsheetUpdateRowSchema],
    ["spreadsheetSendData", spreadsheetSendDataSchema],
  ])("allows text values for %s mappings", (stepType, schema) => {
    const parsed = schema.parse({
      ...baseStep,
      stepType,
      ...(stepType === "spreadsheetSendData" ? {} : { lookup }),
      map: [{ header: "Messenger user id", value: "{{user_id}}" }],
    })

    expect(parsed.map).toEqual([
      { header: "Messenger user id", value: "{{user_id}}" },
    ])
  })
})

describe("spreadsheetContactToSheetMappingSchema", () => {
  test("defaults missing value to an empty string", () => {
    const parsed = spreadsheetContactToSheetMappingSchema.parse({
      header: "Messenger user id",
    })

    expect(parsed).toEqual({
      header: "Messenger user id",
      value: "",
    })
  })
})
