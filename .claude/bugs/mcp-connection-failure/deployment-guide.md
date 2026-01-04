# Production Deployment Guide

## Critical: This Must Be Done on Production Server

This bug fix requires redeploying the production server at `https://mcp.ohno.be/mcp` from the current codebase.

## Pre-Deployment Checklist

- [ ] Verify local tests pass: `npm test`
- [ ] Verify build succeeds: `npm run build`
- [ ] Backup current production state
- [ ] Note current git commit: `git rev-parse HEAD`

## Deployment Steps

### 1. Access Production Server

SSH into the server hosting `https://mcp.ohno.be`:

```bash
ssh user@production-server
cd /path/to/sage  # Navigate to sage deployment directory
```

### 2. Backup Current State

```bash
# Tag current state for rollback
git tag pre-fix-$(date +%s)

# Note current process info
pm2 info sage-remote  # or equivalent command
```

### 3. Deploy New Code

```bash
# Pull latest code
git fetch origin
git checkout main
git pull origin main

# Verify version
cat package.json | grep version
# Should show v0.8.4 or later

# Install dependencies
npm install

# Build
npm run build

# Verify build output
ls -la dist/
```

### 4. Restart Server

```bash
# Using pm2 (adjust command based on your setup)
pm2 restart sage-remote

# Or if using systemd
sudo systemctl restart sage-remote

# Or if running directly
pkill -f "node dist/index.js" && node dist/index.js --remote &
```

### 5. Verify Deployment

#### Quick Check - Health Endpoint

```bash
curl https://mcp.ohno.be/health
```

Expected response:
```json
{
  "status": "ok",
  "uptime": <number>,
  "version": "0.8.4",
  "timestamp": "<ISO timestamp>"
}
```

#### Full Check - MCP Initialize

```bash
# Replace <token> with actual Bearer token
curl -X POST https://mcp.ohno.be/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

Expected response (should NOT be placeholder):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": {
      "name": "sage",
      "version": "0.8.4"
    },
    "capabilities": {
      "tools": {}
    }
  }
}
```

**❌ WRONG (Old Behavior):**
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

#### Automated Verification

From your local machine with the updated codebase:

```bash
# Set auth token (if available)
export SAGE_AUTH_TOKEN="your-bearer-token"

# Run verification script
./scripts/verify-production.sh https://mcp.ohno.be
```

Expected output:
```
✅ Production version matches: 0.8.4
✅ MCP initialize endpoint working correctly
✅ All checks passed!
```

### 6. Test with Claude Code

```bash
# From local machine
claude mcp list
```

Expected:
```
sage: https://mcp.ohno.be/mcp (HTTP) - ✓ Connected
```

### 7. Monitor for Issues

```bash
# Check server logs
pm2 logs sage-remote

# Or if using systemd
journalctl -u sage-remote -f

# Monitor for errors
tail -f /path/to/logs/sage-error.log
```

## Rollback Procedure

If deployment fails or issues occur:

### Quick Rollback

```bash
# Find the tag created in step 2
git tag | grep pre-fix

# Checkout previous version
git checkout <pre-fix-tag>

# Rebuild and restart
npm install
npm run build
pm2 restart sage-remote
```

### Verify Rollback

```bash
curl https://mcp.ohno.be/health | jq '.version'
# Should show previous version
```

## Troubleshooting

### Issue: Version Still Shows Old Value

**Cause:** Build artifacts not refreshed or wrong process running

**Solution:**
```bash
# Force clean build
rm -rf dist/
npm run build

# Ensure old process is killed
pm2 delete sage-remote
pm2 start "node dist/index.js --remote" --name sage-remote
```

### Issue: Connection Still Fails

**Cause:** Wrong implementation still loaded or config issue

**Solution:**
```bash
# Verify correct file structure
ls -la src/cli/
# Should NOT contain http-server.ts
# Should contain http-server-with-config.ts

# Check if correct entry point
cat dist/index.js | head -20
# Should import from http-server-with-config.ts
```

### Issue: Authentication Fails

**Cause:** Auth configuration not loaded

**Solution:**
```bash
# Verify config file
cat ~/.sage/remote-config.json

# Check environment variables
env | grep SAGE

# Restart with explicit config
node dist/index.js --remote --config ~/.sage/remote-config.json
```

## Post-Deployment Tasks

- [ ] Update documentation if needed
- [ ] Notify users of fix (if applicable)
- [ ] Monitor error logs for 24 hours
- [ ] Schedule cleanup of legacy files (already done in this fix)

## Contact Information

For deployment issues, contact:
- Repository maintainer: @shin1ohno
- Issue tracker: https://github.com/shin1ohno/sage/issues
