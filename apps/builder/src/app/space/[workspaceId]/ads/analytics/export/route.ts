// Compat: the CSV export moved to /dashboard/ads/export. Old bookmarked
// export URLs keep working through this re-export.
export { GET } from "../../../dashboard/ads/export/route"

// Route segment config must be a local static declaration (Next.js does not
// resolve re-exported segment config).
export const runtime = "nodejs"
