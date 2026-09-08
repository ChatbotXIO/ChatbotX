// Mirrors MEDIA_LIBRARY_FILES_PAGE_SIZE in
// packages/business/src/media-library-file/service.ts. Duplicated rather than
// re-exported because @chatbotx.io/business is a backend-only barrel: importing
// it from a "use client" component pulls the Postgres pool and Redis client
// into the browser bundle.
export const MEDIA_LIBRARY_FILES_PAGE_SIZE = 60
