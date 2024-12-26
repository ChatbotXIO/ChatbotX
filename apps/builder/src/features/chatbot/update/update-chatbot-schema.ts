import { z } from "zod"
import * as ctz from 'countries-and-timezones';

type Country = {
  id: string;
  name: string;
  timezones: string[];
};

const countries: { [key: string]: Country } = ctz.getAllCountries();

export const CountriesEnum = Object.keys(countries).reduce((acc, countryId) => {
  const country = countries[countryId];
  if (country) {
    acc[countryId] = country.name;
  }
  return acc;
}, {} as Record<string, string>);

export type CountryEnum = keyof typeof CountriesEnum;

const [firstKey, ...otherKeys] = Object.keys(CountriesEnum);

export const updateChatbotSchema = z.object({
  id: z.string().min(1),
  defaultReply: z.union([
    z.string().min(1),
    z.null(),
  ]),

  targetCountry: z.union([
    z.enum([firstKey!, ...otherKeys]),
    z.null(),
  ]),

  defaultLanguage: z.string().min(1),
  accountTimezone: z.string().min(1),
  brandColor: z.string().min(1),
  developmentMode: z.boolean(),
});

export type UpdateChatbotSchema = z.infer<typeof updateChatbotSchema>

export const updateChatbotBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type UpdateChatbotBindSchema = [chatbotId: string]
