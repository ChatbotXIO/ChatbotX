import {
  spreadsheetSendDataDefaultFn,
  spreadsheetSendDataSchema,
  spreadsheetStepVersions,
  spreadsheetUpdateRowDefaultFn,
  tagNodeSpreadsheetWriteStepVersions,
  tagSpreadsheetWriteStepVersion,
  toCustomFieldToken,
  toSpreadsheetStepVersion,
  upgradeNodeSteps,
  upgradeSpreadsheetWriteStep,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

const lookup = (customFieldId: string) =>
  ({
    "cf-name": { name: "Full Name", type: "shortText" },
    "cf-date": { name: "Ngày sinh", type: "date" },
    "cf-bad": { name: "Bad\nName", type: "shortText" },
  })[customFieldId]

describe("spreadsheet write mapping versions", () => {
  test("normalizes missing and unknown versions to v1", () => {
    expect(toSpreadsheetStepVersion(undefined)).toBe("v1")
    expect(toSpreadsheetStepVersion("v9")).toBe("v1")
    expect(toSpreadsheetStepVersion("v2")).toBe("v2")
  })

  test("defaults new write steps to v2 while parsing legacy JSON as v1", () => {
    expect(spreadsheetSendDataDefaultFn().version).toBe("v2")
    expect(spreadsheetUpdateRowDefaultFn().version).toBe("v2")
    expect(
      spreadsheetSendDataSchema.parse({
        ...spreadsheetSendDataDefaultFn(),
        spreadsheetId: "11619011544072192",
        sheetName: "Sheet1",
        version: undefined,
        map: [{ header: "Name", customFieldId: "11619011544072193" }],
      }).version,
    ).toBe("v1")
  })

  test("accepts contact-to-sheet mappings that carry an empty customFieldId", () => {
    // Legacy v1 write steps persisted `customFieldId: ""`; the schema must keep
    // validating them so opening an existing step does not error.
    expect(() =>
      spreadsheetSendDataSchema.parse({
        ...spreadsheetSendDataDefaultFn(),
        spreadsheetId: "11619011544072192",
        sheetName: "Sheet1",
        version: "v2",
        map: [
          { header: "Name", value: "Ada", customFieldId: "" },
          { header: "Phone", value: "{{Phone}}", customFieldId: "" },
        ],
      }),
    ).not.toThrow()
  })

  test("converts legacy mappings to raw custom-field tokens all-or-nothing", () => {
    const step = {
      stepType: "spreadsheetSendData",
      map: [
        { header: "Name", customFieldId: "cf-name" },
        { header: "Birthday", customFieldId: "cf-date" },
      ],
    }

    expect(upgradeSpreadsheetWriteStep(step, lookup)).toEqual({
      ...step,
      version: spreadsheetStepVersions.enum.v2,
      map: [
        {
          header: "Name",
          customFieldId: "cf-name",
          value: "{{raw:Full Name}}",
        },
        {
          header: "Birthday",
          customFieldId: "cf-date",
          value: "{{raw:Ngày sinh}}",
        },
      ],
    })
  })

  test("keeps v1 when any mapping cannot be converted", () => {
    const deletedFieldStep = {
      stepType: "spreadsheetSendData",
      map: [
        { header: "Name", customFieldId: "cf-name" },
        { header: "Missing", customFieldId: "cf-missing" },
      ],
    }
    const invalidNameStep = {
      stepType: "spreadsheetSendData",
      map: [{ header: "Bad", customFieldId: "cf-bad" }],
    }

    expect(upgradeSpreadsheetWriteStep(deletedFieldStep, lookup)).toBe(
      deletedFieldStep,
    )
    expect(upgradeSpreadsheetWriteStep(invalidNameStep, lookup)).toBe(
      invalidNameStep,
    )
  })

  test("is idempotent for v2 and leaves empty maps unchanged", () => {
    const v2Step = {
      stepType: "spreadsheetUpdateRow",
      version: "v2",
      map: [{ header: "Name", value: "{{raw:Full Name}}" }],
    }
    const emptyMapStep = {
      stepType: "spreadsheetUpdateRow",
      map: [],
    }

    expect(upgradeSpreadsheetWriteStep(v2Step, lookup)).toBe(v2Step)
    expect(upgradeSpreadsheetWriteStep(emptyMapStep, lookup)).toBe(emptyMapStep)
  })

  test("tags write step versions without converting mappings", () => {
    const step = {
      stepType: "spreadsheetSendData",
      map: [{ header: "Name", customFieldId: "cf-name" }],
    }

    expect(tagSpreadsheetWriteStepVersion(step)).toEqual({
      ...step,
      version: "v1",
    })
    expect(tagSpreadsheetWriteStepVersion({ ...step, version: "v2" })).toEqual({
      ...step,
      version: "v2",
    })
  })

  test("walks top-level, button, carousel, and email nested steps", () => {
    const details = {
      beforeStep: { stepType: "chooseChannel" },
      steps: [
        {
          stepType: "sendCarousel",
          cards: [
            {
              buttons: [
                {
                  buttonType: "performAction",
                  beforeStep: null,
                  steps: [
                    {
                      stepType: "spreadsheetSendData",
                      map: [{ header: "Name", customFieldId: "cf-name" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          stepType: "email",
          elements: [
            {
              type: "button",
              buttonType: "performAction",
              beforeStep: null,
              steps: [
                {
                  stepType: "spreadsheetUpdateRow",
                  map: [{ header: "Birthday", customFieldId: "cf-date" }],
                },
              ],
            },
          ],
        },
      ],
      quickReplies: [
        {
          buttonType: "performAction",
          beforeStep: null,
          steps: [
            {
              stepType: "spreadsheetSendData",
              map: [{ header: "Name", customFieldId: "cf-name" }],
            },
          ],
        },
      ],
    }

    expect(JSON.stringify(upgradeNodeSteps(details, lookup))).toContain(
      "{{raw:Full Name}}",
    )
    expect(JSON.stringify(upgradeNodeSteps(details, lookup))).toContain(
      "{{raw:Ngày sinh}}",
    )
    expect(
      JSON.stringify(tagNodeSpreadsheetWriteStepVersions(details)),
    ).toContain('"version":"v1"')
  })

  test("walks message-step buttons where write steps also nest", () => {
    const details = {
      steps: [
        {
          stepType: "sendText",
          buttons: [
            {
              buttonType: "performAction",
              beforeStep: null,
              steps: [
                {
                  stepType: "spreadsheetSendData",
                  map: [{ header: "Name", customFieldId: "cf-name" }],
                },
              ],
            },
          ],
        },
      ],
    }

    expect(JSON.stringify(upgradeNodeSteps(details, lookup))).toContain(
      "{{raw:Full Name}}",
    )
    expect(
      JSON.stringify(tagNodeSpreadsheetWriteStepVersions(details)),
    ).toContain('"version":"v1"')
  })

  test("converts an unconfigured legacy row to an empty template", () => {
    const step = {
      stepType: "spreadsheetSendData",
      map: [
        { header: "Name", customFieldId: "cf-name" },
        { header: "Unmapped", customFieldId: "" },
      ],
    }

    expect(upgradeSpreadsheetWriteStep(step, lookup)).toEqual({
      ...step,
      version: spreadsheetStepVersions.enum.v2,
      map: [
        {
          header: "Name",
          customFieldId: "cf-name",
          value: "{{raw:Full Name}}",
        },
        { header: "Unmapped", customFieldId: "", value: "" },
      ],
    })
  })

  test("builds raw custom-field tokens", () => {
    expect(toCustomFieldToken({ name: "Full Name" })).toBe("{{raw:Full Name}}")
  })
})
