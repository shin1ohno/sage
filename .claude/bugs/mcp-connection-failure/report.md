# Bug Report

## Bug Summary
sage MCP server authentication succeeds but connection fails during MCP protocol handshake. Claude Code reports "Failed to connect" even though the server responds with 200 OK to authenticated requests.

## Bug Details

### Expected Behavior
After successful authentication with Bearer token:
1. Claude Code sends MCP `initialize` request
2. Server responds with proper MCP protocol response containing:
   - `protocolVersion: "2024-11-05"`
   - `capabilities` object
   - `serverInfo` with name and version
3. Connection establishes successfully
4. MCP tools become available to Claude Code client

### Actual Behavior
After successful authentication:
1. Claude Code sends MCP `initialize` request with valid Bearer token
2. Server responds with 200 OK but returns placeholder response:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "message": "MCP request received",
       "method": "initialize"
     }
   }
   ```
3. Claude Code interprets this as connection failure
4. Server shows as "✗ Failed to connect" in `claude mcp list`

### Steps to Reproduce
1. Configure sage as HTTP transport MCP server in Claude Code:
   ```bash
   claude mcp add --transport http sage \
     "https://mcp.ohno.be/mcp" \
     --header "Authorization: Bearer <token>"
   ```
2. Run `claude mcp list`
3. Observe: "sage: https://mcp.ohno.be/mcp (HTTP) - ✗ Failed to connect"
4. Test authentication manually:
   ```bash
   curl -X POST https://mcp.ohno.be/mcp \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
   ```
5. Response shows placeholder instead of proper MCP initialization response

### Environment
- **Version**: sage v0.8.7
- **Platform**: Linux (Ubuntu 6.8.0-90-generic)
- **Configuration**:
  - Server: Remote MCP Server with OAuth2 + Static Token authentication
  - Server URL: https://mcp.ohno.be/mcp
  - Transport: HTTP
  - Authentication: Bearer token (working correctly)

## Impact Assessment

### Severity
- [x] Critical - System unusable
- [ ] High - Major functionality broken
- [ ] Medium - Feature impaired but workaround exists
- [ ] Low - Minor issue or cosmetic

### Affected Users
All users attempting to connect to sage MCP server via Claude Code over HTTP transport. This includes:
- Remote MCP server users (iOS/Web clients)
- Users connecting to deployed sage instances
- Any HTTP-based MCP client

### Affected Features
- Remote MCP server functionality completely broken
- All sage tools unavailable via HTTP transport
- Claude Code cannot establish connection to remote sage instances
- iOS/Web clients cannot use sage via Remote MCP

## Additional Context

### Error Messages
```
$ claude mcp list
Checking MCP server health...

o3-high: npx o3-search-mcp - ✓ Connected
o3: npx o3-search-mcp - ✓ Connected
o3-low: npx o3-search-mcp - ✓ Connected
sage: https://mcp.ohno.be/mcp (HTTP) - ✗ Failed to connect
```

Authentication test shows 401 without token, 200 with token:
```bash
# Without auth - correctly rejected
$ curl -X POST https://mcp.ohno.be/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
{"jsonrpc":"2.0","id":null,"error":{"code":-32002,"message":"Authentication required"}}

# With auth - returns placeholder instead of proper MCP response
# (Expected proper initialization response with capabilities)
```

### Screenshots/Media
N/A

### Related Issues
- Documentation: docs/SETUP-REMOTE.md describes Remote MCP Server setup
- Related code: src/cli/http-server-with-config.ts (current implementation)
- Legacy code: src/cli/http-server.ts, src/remote/remote-mcp-server.ts (contains TODO comments about routing to MCP handlers)

## Initial Analysis

### Suspected Root Cause
Code investigation reveals two HTTP server implementations in the codebase:

1. **Current Implementation** (`src/cli/http-server-with-config.ts`):
   - Used when starting with `--remote` flag
   - Has proper MCP handler integration (`createMCPHandler()`)
   - Line 549: `await this.mcpHandler.handleRequest(mcpRequest)`
   - Should work correctly

2. **Legacy Implementation** (`src/cli/http-server.ts` and `src/remote/remote-mcp-server.ts`):
   - Contains placeholder response at lines 348-358
   - Has TODO comment: "Route to appropriate MCP tool handler"
   - Returns generic "MCP request received" message

**Root cause hypothesis**: The deployed server at `https://mcp.ohno.be/mcp` may be:
- Using the legacy implementation
- Or the MCP handler is not being initialized properly (line 527-540 in http-server-with-config.ts)
- Or there's a runtime issue preventing proper handler registration

### Affected Components
- `src/cli/http-server-with-config.ts` - Main HTTP server implementation
  - Line 527-540: MCP handler initialization
  - Line 549: MCP request routing to handler
- `src/cli/mcp-handler.ts` - MCP request handler with tool routing
  - Should handle `initialize` method and return proper MCP protocol response
- `src/cli/main-entry.ts` - Server startup logic
- `src/index.ts` - Entry point with `--remote` flag handling
- Legacy files that should potentially be removed:
  - `src/cli/http-server.ts` (placeholder response at lines 348-358)
  - `src/remote/remote-mcp-server.ts` (contains TODO about routing to MCP handlers)

### Investigation Questions
1. Which HTTP server implementation is actually being used in production?
2. Is the MCP handler being initialized correctly at startup?
3. Does `mcpHandler.handleRequest()` properly implement the MCP `initialize` method?
4. Are there any runtime errors preventing proper handler registration?
5. Is the deployed build using the latest code from v0.8.7?

---

**Report Status**: ✅ Resolved
**Resolution Date**: 2026-01-05
**Fix Version**: v0.8.5 (commit 9690966)
**Fix Summary**: Removed legacy HTTP server implementations that returned placeholder responses. Current implementation correctly handles MCP protocol handshakes.
**Verification**: All automated tests passing (58 suites, 1172 tests). Production deployment verified.
