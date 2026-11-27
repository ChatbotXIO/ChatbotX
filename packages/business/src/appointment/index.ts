// `./copy` is reached only through its own `@chatbotx.io/business/appointment/copy`
// subpath, so tests that mock this barrel can still load the real copy.
export * from "./inbox-booking-link"
export * from "./service"
