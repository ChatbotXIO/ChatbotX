const notFound = {
  message: "Resource not found",
  status: 404,
}

const rateLimitExceeded = {
  message: "Rate limit exceeded",
  status: 429,
}

const invalidRequestData = {
  message: "Validation error",
  status: 422,
}

const businessError = {
  message: "An error occurred while processing your request",
  status: 400,
}

export const possibleErrorsOnFindingResource = {
  rateLimitExceeded,
  notFound,
  businessError,
}

export const possibleErrorsOnListingResource = {
  rateLimitExceeded,
  businessError,
}

export const possibleErrorsOnCreatingResource = {
  rateLimitExceeded,
  invalidRequestData,
  businessError,
}

export const possibleErrorsOnUpdatingResource = {
  rateLimitExceeded,
  invalidRequestData,
  businessError,
}

export const possibleErrorsOnDeletingResource = {
  rateLimitExceeded,
  notFound,
  businessError,
}
