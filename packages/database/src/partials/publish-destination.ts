// The vocabulary is shared with the publishers and the UI, which cannot depend
// on this package, so it lives in `@chatbotx.io/utils`.
export {
  PUBLISH_REQUIRED_SCOPES,
  type PublishDestinationState,
  type PublishDestinationStatus,
  publishDestinationStates,
  publishDestinationStatuses,
} from "@chatbotx.io/utils/publish-destination"
