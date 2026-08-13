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
  convertCustomFieldTypeToConditionType,
  type FieldConfig,
  formatConditionValueDisplay,
  getConditionOptions,
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
} from "@/features/contact-filter/components/static-field-filter-config"

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
  })
})
