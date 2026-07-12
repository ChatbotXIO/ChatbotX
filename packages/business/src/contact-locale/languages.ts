export type ContactLanguageOption = {
  value: string
  labelKey: string
  locale: string
}

export const contactLanguageOptions = [
  { value: "en", labelKey: "condition.languages.en", locale: "en_US" },
  { value: "vi", labelKey: "condition.languages.vi", locale: "vi_VN" },
  { value: "th", labelKey: "condition.languages.th", locale: "th_TH" },
  { value: "id", labelKey: "condition.languages.id", locale: "id_ID" },
  { value: "ms", labelKey: "condition.languages.ms", locale: "ms_MY" },
  { value: "km", labelKey: "condition.languages.km", locale: "km_KH" },
  { value: "lo", labelKey: "condition.languages.lo", locale: "lo_LA" },
  { value: "my", labelKey: "condition.languages.my", locale: "my_MM" },
  { value: "fil", labelKey: "condition.languages.fil", locale: "fil_PH" },
  { value: "ja", labelKey: "condition.languages.ja", locale: "ja_JP" },
  { value: "ko", labelKey: "condition.languages.ko", locale: "ko_KR" },
  { value: "zh", labelKey: "condition.languages.zh", locale: "zh_CN" },
  { value: "fr", labelKey: "condition.languages.fr", locale: "fr_FR" },
  { value: "de", labelKey: "condition.languages.de", locale: "de_DE" },
  { value: "es", labelKey: "condition.languages.es", locale: "es_ES" },
  { value: "it", labelKey: "condition.languages.it", locale: "it_IT" },
  { value: "pt", labelKey: "condition.languages.pt", locale: "pt_PT" },
  { value: "nl", labelKey: "condition.languages.nl", locale: "nl_NL" },
  { value: "ru", labelKey: "condition.languages.ru", locale: "ru_RU" },
  { value: "ar", labelKey: "condition.languages.ar", locale: "ar_SA" },
  { value: "hi", labelKey: "condition.languages.hi", locale: "hi_IN" },
] as const satisfies readonly ContactLanguageOption[]

export const supportedContactLanguages: ReadonlySet<string> = new Set(
  contactLanguageOptions.map((option) => option.value),
)
