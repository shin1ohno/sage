# Technology Steering Document

## Technology Stack

### Core Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language | TypeScript | 5.x | Primary language (strict mode) |
| Runtime | Node.js | 18+ | Server runtime |
| Protocol | MCP | 1.0 | Model Context Protocol |
| Module System | ESM | - | ES Modules |

### Dependencies

#### Production Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^1.0.4",  // MCP server SDK
  "googleapis": "^134.0.0",                // Google Calendar API
  "run-applescript": "^7.1.0",             // AppleScript execution
  "zod": "^3.23.8"                         // Runtime type validation
}
```

#### Development Dependencies
```json
{
  "typescript": "^5.6.0",                  // TypeScript compiler
  "jest": "^29.0.0",                       // Testing framework
  "ts-jest": "^29.0.0",                    // Jest TypeScript support
  "tsx": "^4.19.0",                        // TypeScript execution
  "eslint": "^8.0.0",                      // Linting
  "@typescript-eslint/*": "^7.0.0"         // TypeScript ESLint
}
```

## Technical Standards

### TypeScript Configuration
- **Strict Mode**: 必須（`strict: true`）
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: Node16

### Code Quality
- **Linting**: ESLint with TypeScript rules
- **Type Safety**: No `any` without justification
- **Validation**: Zod for runtime input validation
- **Error Handling**: Throw errors, don't silently ignore

### Testing Requirements
- **Framework**: Jest
- **Coverage Target**: 98%+
- **Test Types**:
  - Unit tests (`tests/unit/`)
  - Integration tests (`tests/integration/`, `tests/integrations/`)
  - E2E tests (`tests/e2e/`)
- **Platform Mocking**: macOS-specific features mocked on Linux/Windows

## Architecture Decisions

### AD-001: MCP Protocol
**Decision**: MCP (Model Context Protocol) を採用
**Rationale**: Claude Desktop/Code との標準的な統合方法
**Implications**: Stdio transport (local) と HTTP transport (remote) の両方をサポート

### AD-002: Multi-Source Calendar
**Decision**: EventKit と Google Calendar の両方をサポート
**Rationale**:
- macOS では EventKit が最も統合度が高い
- Linux/Windows では Google Calendar が唯一の選択肢
- 両方有効時はマージと重複排除を実行
**Implications**: CalendarSourceManager による抽象化が必要

### AD-003: OAuth 2.1 for Remote Access
**Decision**: OAuth 2.1 (PKCE S256) を採用
**Rationale**: Claude iOS/Web からの安全なアクセス
**Implications**:
- JWT Bearer token 認証
- Dynamic Client Registration サポート

### AD-004: AppleScript for macOS Integration
**Decision**: AppleScript/AppleScriptObjC を使用
**Rationale**: Apple Reminders と EventKit への唯一のスクリプタブルアクセス
**Implications**: macOS 専用機能、他プラットフォームではフォールバック

## Integration Patterns

### External Services
| Service | Integration Method | Notes |
|---------|-------------------|-------|
| Apple Reminders | AppleScript | macOS only |
| Calendar.app | AppleScriptObjC (EventKit) | macOS only |
| Google Calendar | googleapis npm | All platforms |
| Notion | MCP Protocol | Via Notion MCP Server |

### Error Handling Pattern
```typescript
// Retry with exponential backoff for transient errors
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T>;

// Fallback pattern for calendar sources
try {
  result = await primarySource.operation();
} catch (error) {
  result = await fallbackSource.operation();
}
```

## Security Requirements

- **Secrets**: Never hardcode API keys, use environment variables
- **Token Storage**: Encrypt OAuth tokens at rest
- **Input Validation**: Validate all external input with Zod
- **CORS**: Configurable allowed origins for Remote MCP

## Performance Guidelines

- **Build Time**: < 10 seconds
- **Test Time**: < 30 seconds (full suite)
- **Startup Time**: < 1 second
- **Response Time**: < 2 seconds (average)

## Deployment

### npm Package
```bash
npm publish  # Publishes @shin1ohno/sage
```

### Local MCP
```json
{
  "mcpServers": {
    "sage": {
      "command": "npx",
      "args": ["-y", "@shin1ohno/sage"]
    }
  }
}
```

### Remote MCP
```bash
node dist/index.js --remote --port 3000
```
