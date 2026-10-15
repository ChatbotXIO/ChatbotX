import { MINI_APP_MAX_UPLOAD_BYTES } from "../uploads"

/**
 * Meta's limits for Flow JSON 7.3. Where the reference gives none, a generous
 * cap keeps stored payloads bounded.
 */

/** Image payloads are base64 strings; ~300 KB of image ≈ 400 K characters. */
export const MINI_APP_MAX_IMAGE_BASE64_LENGTH = 410_000
/** Images inside selection options are capped at 100 KB by Meta. */
export const MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH = 137_000

/** Options of a RadioButtonsGroup, CheckboxGroup or ChipsSelector; also the most items one can select. */
export const MINI_APP_MAX_OPTIONS = 20
export const MINI_APP_MAX_DROPDOWN_OPTIONS = 200
/** A Dropdown may have more options only when none of them has an image. */
export const MINI_APP_MAX_DROPDOWN_OPTIONS_WITH_IMAGES = 100
export const MINI_APP_MAX_NAVIGATION_ITEMS = 20

/** `max-file-size-kb` of a Photo/Document picker. */
export const MINI_APP_MAX_FILE_SIZE_KB = MINI_APP_MAX_UPLOAD_BYTES / 1024

export const MINI_APP_MAX_COMPONENTS_PER_SCREEN = 50
export const MINI_APP_MAX_IF_DEPTH = 3
