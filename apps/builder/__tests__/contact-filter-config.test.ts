// @vitest-environment node

import { contactLocaleOptions } from "@chatbotx.io/business/contact-locale"
import {
  contactSources,
  formFieldTypes,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { describe, expect, test } from "vitest"
import {
  type FieldConfig,
  formatConditionValueDisplay,
  formatFilterConditionValue,
  getConditionOptions,
  getDefaultFilterConfig,
  getFieldConfigs,
  getFieldOptions,
} from "@/features/contact-filter/components/contact-filter-config"
import {
  customFieldOperatorRequiresArrayValue,
  getCustomFieldConditionOptions,
  getCustomFieldValueInputConfig,
  getDefaultCustomFieldValue,
} from "@/features/contact-filter/components/custom-field-filter-config"
import {
  getDefaultStaticFieldValue,
  getStaticFieldConditionOptions,
  getStaticFieldValueInputConfig,
  staticFieldOperatorRequiresArrayValue,
  staticFieldRules,
} from "@/features/contact-filter/components/static-field-filter-config"
import {
  convertCustomFieldTypeToConditionType,
  singleContactFilterConditionSchema,
} from "@/features/contact-filter/schema"

const t = (key: string) => key
const conditionOptions = getConditionOptions(t)

const option = (
  options: { value: string; disabled?: boolean }[],
  value: string,
) => options.find((item) => item.value === value)

describe("contact filter operator config", () => {
  test("disables unsupported static operators for boolean fields", () => {
    const config: FieldConfig = {
      name: "blocked",
      formField: formFieldTypes.enum.boolean,
      group: "contactInfo",
    }

    const options = getStaticFieldConditionOptions(config, conditionOptions)

    expect(option(options, operatorTypes.enum.eq)?.disabled).toBe(false)
    expect(option(options, operatorTypes.enum.isEmpty)?.disabled).toBe(false)
    expect(option(options, operatorTypes.enum.contains)?.disabled).toBe(true)
    expect(option(options, operatorTypes.enum.isBetween)?.disabled).toBe(true)
  })

  test("disables empty operators for non-nullable boolean fields", () => {
    for (const name of ["emailWasVerified", "optedInForEmail"]) {
      const config: FieldConfig = {
        name,
        formField: formFieldTypes.enum.boolean,
        group: "email",
      }

      const options = getStaticFieldConditionOptions(config, conditionOptions)

      expect(option(options, operatorTypes.enum.eq)?.disabled).toBe(false)
      expect(option(options, operatorTypes.enum.isEmpty)?.disabled).toBe(true)
    }
  })

  test("keeps Instagram snapshot and post filter rules aligned with their schemas", () => {
    for (const name of [
      "followsBusinessOnInstagram",
      "businessFollowsUserOnInstagram",
      "verifiedAccountOnInstagram",
    ]) {
      expect(staticFieldRules[name]?.enabledOperators).toEqual([
        operatorTypes.enum.eq,
        operatorTypes.enum.isEmpty,
      ])
    }

    expect(staticFieldRules.followerCountOnInstagram?.singleInput).toBe(
      "number",
    )
    expect(staticFieldRules.commentedOnPost?.enabledOperators).toEqual([
      operatorTypes.enum.eq,
      operatorTypes.enum.ne,
      operatorTypes.enum.isEmpty,
    ])

    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
      channelPostOptions: [{ label: "Post", value: "post-1" }],
    })
    expect(
      configs.find((config) => config.name === "commentedOnPost"),
    ).toMatchObject({
      formField: formFieldTypes.enum.multiSelect,
      optionSource: "channelPosts",
      options: [{ label: "Post", value: "post-1" }],
    })
  })

  test("rejects malformed commented-post values before they can widen an audience", () => {
    for (const value of [
      "1",
      ["0"],
      ["01"],
      ["9223372036854775808"],
      ["1", "1"],
      Array.from({ length: 101 }, (_, index) => String(index + 1)),
    ]) {
      expect(
        singleContactFilterConditionSchema.safeParse({
          field: "commentedOnPost",
          operator: "eq",
          value,
        }).success,
      ).toBe(false)
    }

    expect(
      singleContactFilterConditionSchema.safeParse({
        field: "commentedOnPost",
        operator: "eq",
        value: ["1", "9223372036854775807"],
      }).success,
    ).toBe(true)
  })

  test("enables all number custom-field operator families", () => {
    const config: FieldConfig = {
      name: "customField:cf-1",
      customFieldId: "cf-1",
      customFieldType: "number",
      formField: formFieldTypes.enum.number,
      group: "customFields",
    }

    const options = getCustomFieldConditionOptions(config, conditionOptions)

    expect(options).toHaveLength(14)
    expect(options.every((item) => item.disabled === false)).toBe(true)
  })
})

describe("contact filter value-input config", () => {
  test("returns static input kinds and defaults by field/operator", () => {
    const dateConfig: FieldConfig = {
      name: "lastSeen",
      formField: formFieldTypes.enum.datetime,
      group: "analytics",
    }

    expect(
      getStaticFieldValueInputConfig(dateConfig, operatorTypes.enum.isBetween),
    ).toEqual({ kind: "datetimeInterval", defaultValue: ["", ""] })
    expect(
      getDefaultStaticFieldValue(dateConfig, operatorTypes.enum.isBetween),
    ).toEqual(["", ""])
    expect(
      staticFieldOperatorRequiresArrayValue(
        dateConfig,
        operatorTypes.enum.isBetween,
      ),
    ).toBe(true)
    expect(
      getStaticFieldValueInputConfig(dateConfig, operatorTypes.enum.isEmpty),
    ).toEqual({ kind: "none", defaultValue: "" })
  })

  test("returns custom input kinds and defaults by type/operator", () => {
    const numberConfig: FieldConfig = {
      name: "customField:cf-1",
      customFieldId: "cf-1",
      customFieldType: "number",
      formField: formFieldTypes.enum.number,
      group: "customFields",
    }

    expect(
      getCustomFieldValueInputConfig(
        numberConfig,
        operatorTypes.enum.isBetween,
      ),
    ).toEqual({ kind: "numberInterval", defaultValue: ["0", "0"] })
    expect(
      getDefaultCustomFieldValue(numberConfig, operatorTypes.enum.isBetween),
    ).toEqual(["0", "0"])
    expect(
      customFieldOperatorRequiresArrayValue(operatorTypes.enum.isBetween),
    ).toBe(true)
  })

  test("uses date equality input for custom date fields", () => {
    const dateConfig: FieldConfig = {
      name: "customField:cf-date",
      customFieldId: "cf-date",
      customFieldType: "date",
      formField: formFieldTypes.enum.datetime,
      group: "customFields",
    }

    expect(
      getCustomFieldValueInputConfig(dateConfig, operatorTypes.enum.eq),
    ).toEqual({ kind: "date", defaultValue: "" })
    expect(
      getCustomFieldValueInputConfig(dateConfig, operatorTypes.enum.ne),
    ).toEqual({ kind: "date", defaultValue: "" })
    expect(
      getCustomFieldValueInputConfig(dateConfig, operatorTypes.enum.isBetween),
    ).toEqual({ kind: "datetimeInterval", defaultValue: ["", ""] })
  })
})

describe("contact filter field config helpers", () => {
  test("maps workspace custom fields to customField configs", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [{ label: "VIP", value: "tag-1" }],
      inboxOptions: [{ label: "Inbox", value: "inbox-1" }],
      flowVersionOptions: [],
      customFields: [
        { id: "cf-1", name: "Plan", type: "shortText" },
        { id: "cf-2", name: "Age", type: "number" },
      ],
    })

    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "customField:cf-1",
        customFieldId: "cf-1",
        customFieldType: "shortText",
        label: "Plan",
        formField: formFieldTypes.enum.text,
        group: "customFields",
      }),
    )
    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "customField:cf-2",
        formField: formFieldTypes.enum.number,
      }),
    )
  })

  test("omits bot field configs by default (opt-in gating)", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
      botFields: [{ id: "bf-1", name: "Greeting", type: "shortText" }],
    })

    expect(
      configs.find((config) => config.name === "botField:bf-1"),
    ).toBeUndefined()
  })

  test("maps workspace bot fields to botField configs when includeBotFields is true", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
      botFields: [
        { id: "bf-1", name: "Greeting", type: "shortText" },
        { id: "bf-2", name: "Order Count", type: "number" },
      ],
      includeBotFields: true,
    })

    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "botField:bf-1",
        botFieldId: "bf-1",
        customFieldType: "shortText",
        label: "Greeting",
        formField: formFieldTypes.enum.text,
        group: "botFields",
      }),
    )
    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "botField:bf-2",
        formField: formFieldTypes.enum.number,
      }),
    )
  })

  test("assigns supported static fields to their configured option groups", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const groupFor = (name: string) =>
      configs.find((config) => config.name === name)?.group

    expect(groupFor("fullName")).toBe("contactInfo")
    expect(groupFor("locale")).toBe("contactInfo")
    expect(groupFor("language")).toBe("contactInfo")
    expect(groupFor("timezone")).toBe("contactInfo")
    expect(groupFor("tags")).toBe("analytics")
    expect(groupFor("lastSeen")).toBe("analytics")
    expect(groupFor("lastInteraction")).toBe("analytics")
    expect(groupFor("conversationAssigned")).toBe("analytics")
    expect(groupFor("unreplied")).toBe("analytics")
    expect(groupFor("unread")).toBe("analytics")
    expect(groupFor("existingContact")).toBe("contactInfo")
    expect(groupFor("hasContactInfo")).toBe("contactInfo")
    expect(groupFor("phone")).toBe("sms")
    expect(groupFor("email")).toBe("email")
    expect(groupFor("emailWasVerified")).toBe("email")
    expect(groupFor("optedInForEmail")).toBe("email")
    expect(groupFor("lastComment")).toBe("facebookInstagramComment")
  })

  test("exposes backend-supported language and last comment filters", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })

    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "language",
        formField: formFieldTypes.enum.multiSelect,
        group: "contactInfo",
      }),
    )
    expect(
      configs
        .find((config) => config.name === "language")
        ?.options?.map((option) => option.value),
    ).toContain("vi_VN")
    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "lastComment",
        formField: formFieldTypes.enum.text,
        group: "facebookInstagramComment",
      }),
    )
  })

  test("offers phone, email and phone+email as hasContactInfo options with presence operators only", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const infoOptions = configs.find(
      (config) => config.name === "hasContactInfo",
    )?.options

    expect(infoOptions).toEqual([
      { label: "fields.phone.label", value: "phone" },
      { label: "fields.email.label", value: "email" },
      { label: "fields.phoneAndEmail.label", value: "phoneAndEmail" },
    ])

    const infoConfig: FieldConfig = {
      name: "hasContactInfo",
      formField: formFieldTypes.enum.multiSelect,
      group: "contactInfo",
    }
    const operators = getStaticFieldConditionOptions(
      infoConfig,
      conditionOptions,
    )
    expect(option(operators, operatorTypes.enum.in)?.disabled).toBeFalsy()
    expect(option(operators, operatorTypes.enum.notIn)?.disabled).toBeFalsy()
    expect(option(operators, operatorTypes.enum.isEmpty)?.disabled).toBeFalsy()
    expect(option(operators, operatorTypes.enum.eq)?.disabled).toBe(true)
    expect(option(operators, operatorTypes.enum.contains)?.disabled).toBe(true)
  })

  test("derives contact source options from the contact source taxonomy", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const sourceOptions = configs.find(
      (config) => config.name === "source",
    )?.options

    expect(sourceOptions?.map((option) => option.value)).toEqual(
      contactSources.options,
    )
    expect(sourceOptions?.map((option) => option.value)).not.toContain(
      "fbLeadAd",
    )
  })

  test("keeps locale labels from template language options and appends stored locale values", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })
    const localeOptions = configs.find(
      (config) => config.name === "locale",
    )?.options

    expect(localeOptions).toEqual(
      expect.arrayContaining([
        { label: "English (US)", value: "en_US" },
        { label: "English (UK)", value: "en_GB" },
        { label: "Arabic (UAE)", value: "ar_AE" },
      ]),
    )
    expect(localeOptions?.map((option) => option.value)).toEqual(
      expect.arrayContaining(
        contactLocaleOptions.map((option) => option.value),
      ),
    )
    const contactLocaleValues = new Set(
      contactLocaleOptions.map((option) => option.value),
    )
    expect(
      localeOptions
        ?.filter((option) => contactLocaleValues.has(option.value))
        .every((option) => option.label !== option.value),
    ).toBe(true)
    expect(localeOptions).toContainEqual({
      label: "condition.languages.vi",
      value: "vi_VN",
    })
  })

  test("uses curated contact timezone option list", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })

    expect(
      configs
        .find((config) => config.name === "timezone")
        ?.options?.map((option) => option.value),
    ).toContain("Asia/Ho_Chi_Minh")
  })

  test("uses fixed continent options with unknown sentinel", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })

    expect(
      configs
        .find((config) => config.name === "continent")
        ?.options?.map((option) => option.value),
    ).toEqual(["unknown", "AS", "EU", "AF", "OC", "NA", "SA"])
  })

  test("passes conversation assignee options through", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
      assigneeOptions: [{ label: "Unassigned", value: "unassigned" }],
    })

    expect(
      configs.find((config) => config.name === "conversationAssigned")?.options,
    ).toEqual([{ label: "Unassigned", value: "unassigned" }])
  })

  test("adds translated value options to static, custom, and bot boolean configs", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [{ id: "cf-bool", name: "Subscribed", type: "boolean" }],
      botFields: [{ id: "bf-bool", name: "Enabled", type: "boolean" }],
      includeBotFields: true,
    })
    const booleanOptions = [
      { label: "fields.boolean.true", value: "true" },
      { label: "fields.boolean.false", value: "false" },
    ]

    expect(
      configs.find((config) => config.name === "blocked")?.options,
    ).toEqual(booleanOptions)
    expect(
      configs.find((config) => config.name === "customField:cf-bool")?.options,
    ).toEqual(booleanOptions)
    expect(
      configs.find((config) => config.name === "botField:bf-bool")?.options,
    ).toEqual(booleanOptions)

    for (const fieldName of ["customField:cf-bool", "botField:bf-bool"]) {
      const options = configs.find(
        (config) => config.name === fieldName,
      )?.options
      expect(formatConditionValueDisplay("{{x}}", options)).toBe("{{x}}")
    }
  })

  test("exposes the ctwaAds group with fromCtwaAd and ctwaConversion options", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })

    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "fromCtwaAd",
        formField: formFieldTypes.enum.boolean,
        group: "ctwaAds",
      }),
    )
    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "fromGoogleAd",
        formField: formFieldTypes.enum.boolean,
        group: "ctwaAds",
      }),
    )
    expect(configs).toContainEqual(
      expect.objectContaining({
        name: "ctwaConversion",
        formField: formFieldTypes.enum.multiSelect,
        group: "ctwaAds",
        options: [
          {
            label: "condition.fields.ctwaConversionTypes.lead",
            value: "lead",
          },
          {
            label: "condition.fields.ctwaConversionTypes.purchase",
            value: "purchase",
          },
        ],
      }),
    )

    const options = getFieldOptions(configs, t)
    expect(options).toContainEqual(
      expect.objectContaining({
        value: "group-ctwaAds",
        children: [
          { label: "condition.fields.fromCtwaAd", value: "fromCtwaAd" },
          {
            label: "condition.fields.fromGoogleAd",
            value: "fromGoogleAd",
          },
          {
            label: "condition.fields.ctwaConversion",
            value: "ctwaConversion",
          },
        ],
      }),
    )
  })

  test("groups field options and keeps contact-info fields flat", () => {
    const configs: FieldConfig[] = [
      {
        name: "fullName",
        formField: formFieldTypes.enum.text,
        group: "contactInfo",
      },
      {
        name: "tags",
        formField: formFieldTypes.enum.multiSelect,
        group: "analytics",
      },
      {
        name: "customField:cf-1",
        customFieldId: "cf-1",
        label: "Plan",
        formField: formFieldTypes.enum.text,
        group: "customFields",
      },
    ]

    const options = getFieldOptions(configs, t)

    expect(options[0]).toEqual({
      label: "condition.fields.fullName",
      value: "fullName",
    })
    expect(options).toContainEqual(
      expect.objectContaining({
        value: "group-analytics",
        children: [
          {
            label: "condition.fields.tags",
            value: "tags",
          },
        ],
      }),
    )
    expect(options).toContainEqual(
      expect.objectContaining({
        value: "group-customFields",
        children: [
          {
            label: "Plan",
            value: "customField:cf-1",
          },
        ],
      }),
    )
  })

  test("renders the Bot Fields group immediately after Custom Fields", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [{ id: "cf-1", name: "Plan", type: "shortText" }],
      botFields: [{ id: "bf-1", name: "Greeting", type: "shortText" }],
      includeBotFields: true,
    })

    const options = getFieldOptions(configs, t)
    const groupOrder = options
      .filter((opt) => opt.value.startsWith("group-"))
      .map((opt) => opt.value)
    const customFieldsIndex = groupOrder.indexOf("group-customFields")
    const botFieldsIndex = groupOrder.indexOf("group-botFields")

    expect(customFieldsIndex).toBeGreaterThanOrEqual(0)
    expect(botFieldsIndex).toBe(customFieldsIndex + 1)
    expect(options).toContainEqual(
      expect.objectContaining({
        value: "group-botFields",
        children: [
          {
            label: "Greeting",
            value: "botField:bf-1",
          },
        ],
      }),
    )
  })

  test("preserves configured field order inside each group", () => {
    const configs: FieldConfig[] = [
      {
        name: "fullName",
        label: "Zulu",
        formField: formFieldTypes.enum.text,
        group: "contactInfo",
      },
      {
        name: "existingContact",
        label: "Alpha",
        formField: formFieldTypes.enum.boolean,
        group: "contactInfo",
      },
      {
        name: "tags",
        label: "Zulu",
        formField: formFieldTypes.enum.multiSelect,
        group: "analytics",
      },
      {
        name: "lastSeen",
        label: "Alpha",
        formField: formFieldTypes.enum.datetime,
        group: "analytics",
      },
    ]

    const options = getFieldOptions(configs, t)

    expect(options.slice(0, 2).map((option) => option.value)).toEqual([
      "fullName",
      "existingContact",
    ])
    expect(
      options.find((option) => option.value === "group-analytics")?.children,
    ).toEqual([
      { label: "Zulu", value: "tags" },
      { label: "Alpha", value: "lastSeen" },
    ])
  })

  test("hides retired fields from the picker but keeps their configs for rendering", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })

    const existingContactConfig = configs.find(
      (config) => config.name === "existingContact",
    )
    expect(existingContactConfig).toBeDefined()
    expect(existingContactConfig?.hidden).toBe(true)
    const localeConfig = configs.find((config) => config.name === "locale")
    expect(localeConfig).toBeDefined()
    expect(localeConfig?.hidden).toBe(true)

    const collectValues = (options: SelectOption[]): string[] =>
      options.flatMap((option) =>
        option.children ? collectValues(option.children) : [option.value],
      )
    const pickerValues = collectValues(getFieldOptions(configs, t))
    expect(pickerValues).not.toContain("existingContact")
    expect(pickerValues).not.toContain("locale")
    expect(pickerValues).toContain("hasContactInfo")
    expect(pickerValues).toContain("language")
  })

  test("converts custom field types and formats values for display", () => {
    expect(convertCustomFieldTypeToConditionType("number")).toBe(
      formFieldTypes.enum.number,
    )
    expect(convertCustomFieldTypeToConditionType("datetime")).toBe(
      formFieldTypes.enum.datetime,
    )
    expect(convertCustomFieldTypeToConditionType("boolean")).toBe(
      formFieldTypes.enum.boolean,
    )
    expect(convertCustomFieldTypeToConditionType("unknown")).toBe(
      formFieldTypes.enum.text,
    )

    expect(
      formatConditionValueDisplay(
        ["tag-1", "missing"],
        [{ label: "VIP", value: "tag-1" }],
      ),
    ).toBe("VIP, missing")

    expect(
      formatConditionValueDisplay(
        ["u_1", "t_1", "unassigned", "missing"],
        [
          { label: "Unassigned", value: "unassigned" },
          {
            label: "Agents",
            value: "agents",
            children: [{ label: "Alice", value: "u_1" }],
          },
          {
            label: "Inbox Teams",
            value: "inbox-teams",
            children: [{ label: "Sales Team", value: "t_1" }],
          },
        ],
      ),
    ).toBe("Alice, Sales Team, Unassigned, missing")
  })

  describe("looked-up value labels", () => {
    const t = (key: string) => key
    const tagLabels = [{ label: "VIP", value: "tag-1" }]

    test("flags a value missing from the looked-up labels as unknown", () => {
      expect(
        formatConditionValueDisplay(
          ["tag-1", "deleted"],
          tagLabels,
          "condition.unknownValue",
        ),
      ).toBe("VIP, condition.unknownValue")
    })

    test("an empty looked-up list means every value was deleted", () => {
      expect(
        formatConditionValueDisplay("tag-1", [], "condition.unknownValue"),
      ).toBe("condition.unknownValue")
    })

    test("without an unknown label an empty or missing list shows the raw value", () => {
      expect(formatConditionValueDisplay("tag-1", [])).toBe("tag-1")
      expect(formatConditionValueDisplay("tag-1", undefined)).toBe("tag-1")
    })

    test("formatFilterConditionValue prefers looked-up labels over picker options", () => {
      const fieldConfig: FieldConfig = {
        name: "tags",
        formField: "multiSelect",
        group: "analytics",
        // The picker list is capped, so tag-9 is not in it.
        options: [{ label: "VIP", value: "tag-1" }],
        valueLabels: [
          { label: "VIP", value: "tag-1" },
          { label: "Late tag", value: "tag-9" },
        ],
      }

      expect(
        formatFilterConditionValue(["tag-1", "tag-9", "gone"], fieldConfig, t),
      ).toBe("VIP, Late tag, condition.unknownValue")
    })

    test("formatFilterConditionValue falls back to picker options until labels load", () => {
      const fieldConfig: FieldConfig = {
        name: "tags",
        formField: "multiSelect",
        group: "analytics",
        options: [{ label: "VIP", value: "tag-1" }],
      }

      expect(
        formatFilterConditionValue(["tag-1", "tag-9"], fieldConfig, t),
      ).toBe("VIP, tag-9")
      expect(formatFilterConditionValue("titan", undefined, t)).toBe("titan")
    })

    test("getFieldConfigs attaches looked-up labels only for id-backed fields", () => {
      const configs = getFieldConfigs({
        t,
        tagOptions: [],
        inboxOptions: [],
        flowVersionOptions: [],
        customFields: [],
        assigneeOptions: [{ label: "Unassigned", value: "unassigned" }],
        filterValueLabels: {
          tags: [{ id: "tag-1", name: "VIP" }],
          sequences: [],
          broadcasts: [],
          reflinks: [],
          inboxes: [],
          members: [{ id: "7", name: "Alice" }],
          inboxTeams: [{ id: "3", name: "Sales" }],
        },
      })
      const byName = (name: string) =>
        configs.find((config) => config.name === name)

      expect(byName("tags")?.valueLabels).toEqual([
        { value: "tag-1", label: "VIP" },
      ])
      expect(byName("conversationAssigned")?.valueLabels).toEqual([
        { value: "u_7", label: "Alice" },
        { value: "t_3", label: "Sales" },
        { label: "Unassigned", value: "unassigned" },
      ])
      expect(byName("fullName")?.valueLabels).toBeUndefined()
    })

    test("getFieldConfigs leaves valueLabels unset until the lookup has loaded", () => {
      const configs = getFieldConfigs({
        t,
        tagOptions: [],
        inboxOptions: [],
        flowVersionOptions: [],
        customFields: [],
      })

      expect(configs.every((config) => config.valueLabels === undefined)).toBe(
        true,
      )
    })
  })
})

describe("getDefaultFilterConfig", () => {
  const config = (name: string, hidden?: boolean): FieldConfig => ({
    name,
    formField: formFieldTypes.enum.text,
    group: "analytics",
    hidden,
    options: [],
  })

  test("prefers the current channel wherever it sits in the list", () => {
    const configs = [
      config("followsBusinessOnInstagram"),
      config("language"),
      config("currentChannel"),
    ]

    expect(getDefaultFilterConfig(configs)?.name).toBe("currentChannel")
  })

  test("falls back to the first pickable field when the channel is not offered", () => {
    const configs = [config("locale", true), config("language"), config("tags")]

    expect(getDefaultFilterConfig(configs)?.name).toBe("language")
  })

  test("never defaults to a retired (hidden) field", () => {
    expect(
      getDefaultFilterConfig([config("currentChannel", true), config("tags")])
        ?.name,
    ).toBe("tags")
  })

  test("returns undefined when nothing is pickable", () => {
    expect(getDefaultFilterConfig([])).toBeUndefined()
    expect(getDefaultFilterConfig([config("locale", true)])).toBeUndefined()
  })

  test("the real field configs open on the current channel, not an Instagram field", () => {
    const configs = getFieldConfigs({
      t,
      tagOptions: [],
      inboxOptions: [],
      flowVersionOptions: [],
      customFields: [],
    })

    expect(getDefaultFilterConfig(configs)?.name).toBe("currentChannel")
  })
})
