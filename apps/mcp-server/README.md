# MCP Server - ChatbotX

MCP (Model Context Protocol) Server for ChatbotX API management. Provides tools to manage tags and custom fields through an MCP-compliant interface.

## 📋 Prerequisites

- **Node.js**: v20+ recommended
- **pnpm**: v10.30.3 or higher
- **Environment Variables**: CHATBOTX_API_KEY, CHATBOTX_API_URL (optional)

## 🚀 Installation

1. **Install dependencies**:

```bash
pnpm install
```

2. **Create `.env` file** (optional, for custom API configuration):

```bash
# .env
CHATBOTX_API_KEY=your-api-key-here
CHATBOTX_API_URL=https://your-api-url.com/api/v1
CHATBOTX_ALLOW_SELF_SIGNED_CERT=true  # Only for development
```

## 📖 Available Scripts

### Development

```bash
# Run the MCP server in development mode (with TypeScript)
pnpm dev
```

### Build

```bash
# Compile TypeScript to JavaScript
pnpm build
```

### Production

```bash
# Run the compiled server
pnpm start
```

### Testing

```bash
# Test all tools with the test script
pnpm test
```

## 🧪 Testing Tools

### Quick Test

Run all tools at once:

```bash
pnpm test
```

This executes `src/test-tools.ts` and tests:

- ✅ `list_tags` - Get all tags
- ✅ `create_tag` - Create a new tag
- ✅ `list_custom_fields` - Get all custom fields
- ✅ `create_custom_field` - Create a new custom field

### Expected Output

```
🧪 Testing MCP Server Tools...

📋 Testing list_tags...
✅ list_tags result: { content: [...] }

---

📋 Testing list_custom_fields...
✅ list_custom_fields result: { content: [...] }

---

✏️ Testing create_tag...
✅ create_tag result: { content: [...] }

---

✏️ Testing create_custom_field...
✅ create_custom_field result: { content: [...] }
```

## 📂 Project Structure

```
src/
├── index.ts              # Main MCP server entry point
├── types.ts              # Shared type definitions
├── tools/
│   ├── tag.ts            # Tag management tools
│   └── custom-fields.ts  # Custom field management tools
├── common.ts             # Utility functions
└── test-tools.ts         # Testing script for all tools
```

## 🛠️ Tools Documentation

### Tags

- **`list_tags`**: Get a list of all tags in the system
  - No parameters required
  - Returns: Array of tag objects with `id` and `name`

- **`create_tag`**: Create a new tag with the given name
  - Parameters: `{ name: string }`
  - Returns: Created tag object

### Custom Fields

- **`list_custom_fields`**: Get a list of all custom fields in the system
  - No parameters required
  - Returns: Array of custom field objects

- **`create_custom_field`**: Create a new custom field
  - Parameters: `{ name: string; customFieldType: "shortText" | "number" | "date" | "datetime" | "boolean" | "longText" }`
  - Returns: Created custom field object

## 🔧 Environment Variables

| Variable                          | Description                               | Default                        | Required               |
| --------------------------------- | ----------------------------------------- | ------------------------------ | ---------------------- |
| `CHATBOTX_API_KEY`                | ChatbotX API authentication key           | `test-api-key`                 | ⚠️ Yes (in production) |
| `CHATBOTX_API_URL`                | ChatbotX API base URL                     | `http://localhost:3000/api/v1` | No                     |
| `CHATBOTX_ALLOW_SELF_SIGNED_CERT` | Allow self-signed certificates (dev only) | `true`                         | No                     |

## 📝 Example Usage

### Via Test Script

```bash
pnpm test
```

### Via TypeScript

```typescript
import { ChatbotXAPI } from "@chatbotx/public-apis";
import tags from "./src/tools/tag";

const api = new ChatbotXAPI("your-api-key");
const result = await tags.list_tags.execute(api);
console.log(result);
```

## 🐛 Troubleshooting

### Error: API connection failed

- Check if `API_URL` is correct
- Verify `API_KEY` is valid
- For self-signed certificates, ensure `CHATBOTX_ALLOW_SELF_SIGNED_CERT=true`

### Build errors with TypeScript

- Run `pnpm build` to see detailed TypeScript errors
- Check TypeScript version: `pnpm ls typescript`

## 📚 Technology Stack

- **Runtime**: Node.js with TypeScript
- **Type Safety**: TypeScript with strict mode
- **Framework**: Model Context Protocol SDK
- **Package Manager**: pnpm
- **Development**: tsx for TypeScript execution

## 📦 Dependencies

- `@chatbotx/public-apis`: ChatbotX API client
- `@modelcontextprotocol/sdk`: MCP framework
- `dotenv`: Environment configuration
- `zod`: Schema validation

## 🚢 Deployment

### Build for Production

```bash
pnpm build
```

### Run Production Server

```bash
pnpm start
```

### Docker (if available)

Check the `docker/` folder for Dockerfile configuration.

## 📝 License

ISC

## 👤 Author

ChatbotX Team

---

**Last Updated**: March 12, 2026
