export type ContactTimezoneOption = {
  value: string
  label: string
}

export const offsetToTimezoneMap: Record<string, string> = {
  "-12": "Etc/GMT+12",
  "-11": "Pacific/Pago_Pago",
  "-10": "Pacific/Honolulu",
  "-9": "America/Anchorage",
  "-8": "America/Los_Angeles",
  "-7": "America/Denver",
  "-6": "America/Chicago",
  "-5": "America/New_York",
  "-4": "America/Halifax",
  "-3": "America/Sao_Paulo",
  "-2": "Atlantic/South_Georgia",
  "-1": "Atlantic/Azores",
  "0": "UTC",
  "1": "Europe/Berlin",
  "2": "Europe/Athens",
  "3": "Europe/Moscow",
  "4": "Asia/Dubai",
  "5": "Asia/Karachi",
  "6": "Asia/Dhaka",
  "7": "Asia/Bangkok",
  "8": "Asia/Singapore",
  "9": "Asia/Tokyo",
  "10": "Australia/Sydney",
  "11": "Pacific/Noumea",
  "12": "Pacific/Auckland",
  "13": "Pacific/Tongatapu",
  "14": "Pacific/Kiritimati",
}

export const singleZoneCountryTimezones: Record<string, string> = {
  AE: "Asia/Dubai",
  AT: "Europe/Vienna",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  CN: "Asia/Shanghai",
  DE: "Europe/Berlin",
  DK: "Europe/Copenhagen",
  ES: "Europe/Madrid",
  FI: "Europe/Helsinki",
  FR: "Europe/Paris",
  GB: "Europe/London",
  HK: "Asia/Hong_Kong",
  IE: "Europe/Dublin",
  IN: "Asia/Kolkata",
  IT: "Europe/Rome",
  JP: "Asia/Tokyo",
  KH: "Asia/Phnom_Penh",
  KR: "Asia/Seoul",
  LA: "Asia/Vientiane",
  MM: "Asia/Yangon",
  MY: "Asia/Kuala_Lumpur",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  NZ: "Pacific/Auckland",
  PH: "Asia/Manila",
  PT: "Europe/Lisbon",
  SA: "Asia/Riyadh",
  SE: "Europe/Stockholm",
  SG: "Asia/Singapore",
  TH: "Asia/Bangkok",
  TW: "Asia/Taipei",
  VN: "Asia/Ho_Chi_Minh",
}

export const phoneCountryProfiles: Record<
  string,
  { locale: string; timezone: string }
> = {
  AE: { locale: "ar_AE", timezone: "Asia/Dubai" },
  DE: { locale: "de_DE", timezone: "Europe/Berlin" },
  FR: { locale: "fr_FR", timezone: "Europe/Paris" },
  GB: { locale: "en_GB", timezone: "Europe/London" },
  ID: { locale: "id_ID", timezone: "Asia/Jakarta" },
  IN: { locale: "hi_IN", timezone: "Asia/Kolkata" },
  IT: { locale: "it_IT", timezone: "Europe/Rome" },
  JP: { locale: "ja_JP", timezone: "Asia/Tokyo" },
  KH: { locale: "km_KH", timezone: "Asia/Phnom_Penh" },
  KR: { locale: "ko_KR", timezone: "Asia/Seoul" },
  LA: { locale: "lo_LA", timezone: "Asia/Vientiane" },
  MM: { locale: "my_MM", timezone: "Asia/Yangon" },
  MY: { locale: "ms_MY", timezone: "Asia/Kuala_Lumpur" },
  PH: { locale: "fil_PH", timezone: "Asia/Manila" },
  SG: { locale: "en_SG", timezone: "Asia/Singapore" },
  TH: { locale: "th_TH", timezone: "Asia/Bangkok" },
  VN: { locale: "vi_VN", timezone: "Asia/Ho_Chi_Minh" },
}

export const contactTimezoneOptions = Array.from(
  new Set([
    ...Object.values(singleZoneCountryTimezones),
    ...Object.values(phoneCountryProfiles).map((profile) => profile.timezone),
    ...Object.values(offsetToTimezoneMap),
  ]),
)
  .sort()
  .map((zone) => ({ value: zone, label: zone }))
