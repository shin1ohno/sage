# Bug Analysis

## Root Cause Analysis

### Investigation Summary
Conducted comprehensive code review of the HTTP server implementations and MCP handler integration. The codebase contains the correct implementation with proper MCP handler integration (`http-server-with-config.ts`), which is confirmed by:
- E2E tests passing (tests/e2e/mcp-over-http.test.ts:232-270)
- Unit tests verifying initialize response (tests/unit/mcp-handler.test.ts:180-211)
- Proper handler initialization in production code (src/cli/http-server-with-config.ts:156)

### Root Cause
**The deployed server at `https://mcp.ohno.be/mcp` is NOT using the current codebase.**

Evidence:
1. **Current Implementation Works**: Tests confirm `http-server-with-config.ts` + `mcp-handler.ts` correctly responds to `initialize` with proper MCP protocol response
2. **Server Returns Wrong Response**: Production server returns placeholder `{"message": "MCP request received"}` instead of proper initialization response
3. **Legacy Code Exists**: Codebase contains old implementation files with placeholder responses still present

The production server is either:
- Running an outdated version of sage (< v0.8.4)
- Using legacy implementation files that were supposed to be removed
- Not properly built/deployed from the current source code

### Contributing Factors
1. **Legacy Code Presence**: Old implementation files (`src/cli/http-server.ts`, `src/remote/remote-mcp-server.ts`) remain in codebase with TODO comments, creating confusion
2. **Deployment Process**: No verification that deployed version matches source code
3. **Version Tracking**: Server doesn't expose version information for debugging (health endpoint exists but may not be checked)

## Technical Details

### Affected Code Locations

- **File**: `src/cli/http-server-with-config.ts` (CORRECT - used in production)
  - **Function/Method**: `start()` at line 150-204
  - **Lines**: `156` - MCP handler initialization
  - **Status**: ✅ Correctly calls `await createMCPHandler()`

- **File**: `src/cli/mcp-handler.ts` (CORRECT - implements protocol)
  - **Function/Method**: `handleRequest()` at line 232-269
  - **Lines**: `237-238` - Initialize method handler
  - **Function/Method**: `handleInitialize()` at line 274-289
  - **Status**: ✅ Returns proper MCP protocol response with capabilities

- **File**: `src/cli/http-server.ts` (LEGACY - should be removed)
  - **Function/Method**: `handleMCPRequest()` at line 318-391
  - **Lines**: `348-358` - Placeholder response
  - **Issue**: Returns `{"message": "MCP request received"}` - WRONG RESPONSE
  - **Status**: ⚠️ Contains TODO comment but still exists

- **File**: `src/remote/remote-mcp-server.ts` (LEGACY - should be removed)
  - **Function/Method**: `handleMCPRequest()` at line 620-693
  - **Lines**: `670-676` - Placeholder response
  - **Issue**: Same placeholder response as above
  - **Status**: ⚠️ Contains TODO comment but still exists

### Data Flow Analysis

**Expected Flow (Current Implementation)**:
```
Client Request → HTTP Server → Authentication → processMCPRequest()
→ parseJSONRPCRequest() → mcpHandler.handleRequest()
→ handleInitialize() → Proper MCP Response
```

**Actual Flow (Production Server)**:
```
Client Request → HTTP Server → Authentication → ❌ UNKNOWN HANDLER
→ Placeholder Response: {"message": "MCP request received"}
```

### Dependencies
- `@modelcontextprotocol/sdk` v1.0.4 - MCP protocol definitions
- `node` v18+ - Runtime environment
- Production dependencies are correct; issue is deployment/version mismatch

## Impact Analysis

### Direct Impact
- **Remote MCP Server completely non-functional**: All HTTP-based MCP connections fail
- **No workaround exists**: Users cannot use sage via HTTP transport at all
- **Multi-platform support broken**: iOS/Web/Remote Claude Code connections impossible

### Indirect Impact
- **User Trust**: Documentation promises Remote MCP support but it doesn't work
- **Testing Gap**: E2E tests pass locally but production deployment fails
- **Deployment Reliability**: Suggests broader issues with deployment process

### Risk Assessment
**If not fixed**:
- Users will abandon sage for HTTP/Remote use cases
- Documentation becomes misleading and harmful
- Future deployments may have similar undetected issues
- Reputation damage as "broken" software

## Solution Approach

### Fix Strategy
**Two-phase approach**:

**Phase 1: Immediate Fix (Production)**
1. Verify deployed version at `https://mcp.ohno.be/mcp`
2. Rebuild from current source (v0.8.4+)
3. Deploy correct build to production
4. Verify initialize response matches tests

**Phase 2: Prevent Recurrence**
1. Remove legacy implementation files completely
2. Add version endpoint verification to deployment process
3. Add production smoke tests
4. Document deployment procedure

### Alternative Solutions Considered

**Alternative 1**: Fix placeholder responses in legacy files
- ❌ Rejected: Maintains duplicate code, increases maintenance burden
- ❌ Risk: May have more subtle differences beyond placeholder response

**Alternative 2**: Redirect to legacy implementation temporarily
- ❌ Rejected: Continues using wrong code, delays proper fix
- ❌ Risk: Legacy code may have other unfixed bugs or security issues

**Alternative 3**: Add compatibility layer
- ❌ Rejected: Over-engineering for deployment issue
- ❌ Risk: Adds complexity without addressing root cause

**Selected Solution**: Phase 1 + Phase 2 above
- ✅ Addresses immediate issue (redeploy)
- ✅ Prevents future occurrence (cleanup + verification)
- ✅ Minimal code changes
- ✅ Follows existing patterns

### Risks and Trade-offs

**Risks of Selected Solution**:
1. **Deployment Access**: Requires access to production server at mcp.ohno.be
   - Mitigation: Document process, provide user instructions if needed
2. **Downtime**: Brief service interruption during redeployment
   - Mitigation: Short downtime (< 1 minute expected)
3. **Breaking Changes**: Removing legacy files might affect unknown dependencies
   - Mitigation: Grep entire codebase for imports before removal

**Trade-offs**:
- **Technical Debt Payoff**: Removing legacy code improves maintainability
- **User Impact**: Short-term disruption for long-term reliability
- **Testing Coverage**: Gap between local tests and production exposed

## Implementation Plan

### Changes Required

1. **Production Redeployment** (CRITICAL - Do First)
   - File: Production server at https://mcp.ohno.be/mcp
   - Modification: Rebuild and redeploy from current source code
   - Commands:
     ```bash
     # On production server
     cd /path/to/sage
     git pull origin main
     npm install
     npm run build
     pm2 restart sage-remote  # or appropriate restart command
     ```
   - Verification:
     ```bash
     curl -X POST https://mcp.ohno.be/mcp \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer <token>" \
       -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
     # Should return proper MCP response, not placeholder
     ```

2. **Remove Legacy Files** (Cleanup - Do After #1 Works)
   - File: `src/cli/http-server.ts`
   - Modification: Delete entire file
   - Verification: `grep -r "http-server.ts" src/` returns no imports

3. **Remove Legacy Remote Server** (Cleanup - Do After #1 Works)
   - File: `src/remote/remote-mcp-server.ts`
   - Modification: Delete entire file
   - Verification: `grep -r "remote-mcp-server.ts" src/` returns no imports

4. **Add Version Endpoint Test** (Prevention - New Code)
   - File: `tests/e2e/mcp-over-http.test.ts`
   - Modification: Add test case verifying `/health` returns correct version
   - Example:
     ```typescript
     it('should return correct version from health endpoint', async () => {
       const response = await fetch(`http://127.0.0.1:${port}/health`);
       const body = await response.json();
       expect(body.version).toBe(VERSION);
     });
     ```

5. **Add Production Verification Script** (Prevention - New File)
   - File: `scripts/verify-production.sh` (new)
   - Modification: Create script to verify production deployment
   - Content:
     ```bash
     #!/bin/bash
     # Verify production sage server is running correct version
     EXPECTED_VERSION=$(node -p "require('./package.json').version")
     HEALTH_RESPONSE=$(curl -s https://mcp.ohno.be/health)
     ACTUAL_VERSION=$(echo $HEALTH_RESPONSE | jq -r '.version')

     if [ "$EXPECTED_VERSION" != "$ACTUAL_VERSION" ]; then
       echo "ERROR: Version mismatch!"
       echo "Expected: $EXPECTED_VERSION"
       echo "Actual: $ACTUAL_VERSION"
       exit 1
     fi
     echo "✓ Production version matches: $ACTUAL_VERSION"
     ```

### Testing Strategy

**Pre-Deployment Testing**:
1. Run full test suite locally: `npm test`
2. Verify all E2E HTTP tests pass: `npm test tests/e2e/mcp-over-http.test.ts`
3. Build locally and test with curl:
   ```bash
   npm run build
   node dist/index.js --remote --port 3001 &
   curl -X POST http://localhost:3001/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
   # Should return proper MCP initialize response
   ```

**Post-Deployment Verification**:
1. Health check: `curl https://mcp.ohno.be/health`
2. Initialize test:
   ```bash
   curl -X POST https://mcp.ohno.be/mcp \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
   ```
3. Claude Code connection test: `claude mcp list` should show sage as "✓ Connected"
4. Tools list test:
   ```bash
   curl -X POST https://mcp.ohno.be/mcp \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
   ```

**Regression Testing**:
- Verify stdio mode still works: `npx @shin1ohno/sage` (local MCP)
- Test OAuth flow still works (if applicable)
- Verify all existing E2E tests pass after legacy file removal

### Rollback Plan

**If deployment fails**:
1. Keep git tag/commit before deployment: `git tag pre-fix-$(date +%s)`
2. Rollback command: `git checkout <previous-tag> && npm run build && pm2 restart sage-remote`
3. Re-verify with placeholder response test (should return old behavior)

**If legacy file removal breaks something**:
1. Files are in git history: `git checkout HEAD~1 -- src/cli/http-server.ts`
2. Restore and investigate import usage
3. Fix imports to use correct implementation
4. Re-test before removing again

**Communication**:
- If downtime > 5 minutes, notify users via status page or documentation
- Document exact steps taken for future reference
- Update troubleshooting docs with lessons learned
