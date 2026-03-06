import privateFlowsAPI from "./private"
import publicFlowsAPI from "./public"

const flowsAPI = {
  ...publicFlowsAPI,
  ...privateFlowsAPI,
}

export default flowsAPI
