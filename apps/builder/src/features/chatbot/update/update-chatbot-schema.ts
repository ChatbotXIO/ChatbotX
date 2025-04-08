import { z } from "zod"
import { getAllCountries } from "countries-and-timezones"

type Country = {
  id: string
  name: string
  timezones: string[]
}

const countries: { [key: string]: Country } = getAllCountries()
const [firstCountryKey, ...otherCountryKeys] = Object.keys(countries)
const viewListTimeZones = Intl.supportedValuesOf("timeZone")

const viewListLanguages = [
  { name: "English", code: "en" },
  { name: "Vietnamese", code: "vi" },
] as const
const languageCodes = viewListLanguages.map((language) => language.code)

export const updateChatbotSchema = z.object({
  defaultReply: z.union([z.string().min(1), z.null()]),
  targetCountry: z.union([
    z.enum([firstCountryKey, ...otherCountryKeys]),
    z.null(),
  ]),
  defaultLanguage: z.enum(languageCodes as [string, ...string[]]),
  accountTimezone: z.enum(viewListTimeZones as [string, ...string[]]),
  brandColor: z
    .string()
    .min(1)
    .regex(/^#[0-9A-Fa-f]{6}$/),
  developmentMode: z.boolean(),
})

export type UpdateChatbotSchema = z.infer<typeof updateChatbotSchema>

export const updateChatbotBindSchema: [id: z.ZodString] = [z.string().cuid2()]
export type UpdateChatbotBindSchema = [id: string]
