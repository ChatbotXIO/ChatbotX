import { PAGE_ELEMENTS } from "../../steps/email/page-node-menu"
import type { MenuItem, TranslationFn } from "../types"

export const landingPageEditorMenus = (t: TranslationFn): MenuItem[] =>
  PAGE_ELEMENTS.map((item) => ({
    label: t(item.labelKey),
    icon: item.icon,
    stepType: null,
  }))
