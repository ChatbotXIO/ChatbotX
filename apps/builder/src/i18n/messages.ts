import ar from "../../messages/ar.json"
import da from "../../messages/da.json"
import de from "../../messages/de.json"
import en from "../../messages/en.json"
import es from "../../messages/es.json"
import fi from "../../messages/fi.json"
import fr from "../../messages/fr.json"
import he from "../../messages/he.json"
import id from "../../messages/id.json"
import it from "../../messages/it.json"
import ja from "../../messages/ja.json"
import nl from "../../messages/nl.json"
import ptBR from "../../messages/pt-BR.json"
import ptPT from "../../messages/pt-PT.json"
import ro from "../../messages/ro.json"
import sv from "../../messages/sv.json"
import tr from "../../messages/tr.json"
import vi from "../../messages/vi.json"
import zhCN from "../../messages/zh-CN.json"
import zhTW from "../../messages/zh-TW.json"
import type { Locale } from "./config"

export const messagesByLocale: Record<Locale, Record<string, unknown>> = {
  ar,
  da,
  de,
  en,
  es,
  fi,
  fr,
  he,
  id,
  it,
  ja,
  nl,
  "pt-BR": ptBR,
  "pt-PT": ptPT,
  ro,
  sv,
  tr,
  vi,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
}
