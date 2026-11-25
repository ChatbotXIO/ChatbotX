import { registerMediaUrlImporter } from "@chatbotx.io/business"
import { importMediaFromUrl } from "./import-media-from-url"

// Imported for its side effect by the Node route handlers (`/rpc`, `/api`): they
// serve the procedures that import files from a URL. Never import this from the
// Edge-traced router graph.
registerMediaUrlImporter(importMediaFromUrl)
