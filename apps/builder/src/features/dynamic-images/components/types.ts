import type {
  DynamicImageImageElement,
  DynamicImageQrCodeElement,
  DynamicImageTextElement,
} from "@chatbotx.io/database/partials"

/**
 * A patch that can carry any field from any element variant, without the
 * `type` discriminant. `Partial<DynamicImageElement>` (the union) only
 * exposes fields shared by every variant, which is too narrow for callers
 * (e.g. the canvas, which sets `size` only for `qrCode`) that mutate a
 * single element by id without re-narrowing on every call site.
 */
export type DynamicImageElementPatch = Partial<
  Omit<DynamicImageImageElement, "type"> &
    Omit<DynamicImageTextElement, "type"> &
    Omit<DynamicImageQrCodeElement, "type">
>
