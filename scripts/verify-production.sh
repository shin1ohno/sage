#!/bin/bash
# Verify production sage server is running correct version
# Usage: ./scripts/verify-production.sh [server-url]

set -e

SERVER_URL="${1:-https://mcp.ohno.be}"
EXPECTED_VERSION=$(node -p "require('./package.json').version")

echo "🔍 Verifying production sage server..."
echo "   Server: $SERVER_URL"
echo "   Expected version: $EXPECTED_VERSION"
echo ""

# Check health endpoint
echo "📡 Checking health endpoint..."
HEALTH_RESPONSE=$(curl -s "${SERVER_URL}/health" || echo "{}")

if [ "$HEALTH_RESPONSE" = "{}" ]; then
  echo "❌ ERROR: Failed to reach health endpoint"
  echo "   URL: ${SERVER_URL}/health"
  echo "   The server may be down or unreachable."
  exit 1
fi

# Extract version (using node for JSON parsing to avoid jq dependency)
ACTUAL_VERSION=$(node -p "
  try {
    const data = JSON.parse('${HEALTH_RESPONSE//\'/\\\'}');
    data.version || 'unknown';
  } catch (e) {
    'unknown';
  }
")

echo "   Status: $(node -p "JSON.parse('${HEALTH_RESPONSE//\'/\\\'}').status || 'unknown'")"
echo "   Actual version: $ACTUAL_VERSION"
echo ""

# Compare versions
if [ "$EXPECTED_VERSION" != "$ACTUAL_VERSION" ]; then
  echo "❌ ERROR: Version mismatch!"
  echo "   Expected: $EXPECTED_VERSION"
  echo "   Actual: $ACTUAL_VERSION"
  echo ""
  echo "💡 Action required:"
  echo "   1. Rebuild: npm run build"
  echo "   2. Deploy to production server"
  echo "   3. Restart server: pm2 restart sage-remote (or equivalent)"
  exit 1
fi

echo "✅ Production version matches: $ACTUAL_VERSION"
echo ""

# Optional: Test MCP initialize endpoint (requires auth token)
if [ -n "$SAGE_AUTH_TOKEN" ]; then
  echo "🔐 Testing MCP initialize endpoint with authentication..."
  INIT_RESPONSE=$(curl -s -X POST "${SERVER_URL}/mcp" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SAGE_AUTH_TOKEN" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify-script","version":"1.0.0"}}}' || echo "{}")

  # Check if response contains proper MCP initialize response
  HAS_PROTOCOL=$(node -p "
    try {
      const data = JSON.parse('${INIT_RESPONSE//\'/\\\'}');
      data.result && data.result.protocolVersion ? 'true' : 'false';
    } catch (e) {
      'false';
    }
  ")

  if [ "$HAS_PROTOCOL" = "true" ]; then
    echo "   ✅ MCP initialize endpoint working correctly"
  else
    echo "   ❌ ERROR: MCP initialize endpoint returned unexpected response"
    echo "   Response: $INIT_RESPONSE"
    exit 1
  fi
else
  echo "ℹ️  Skipping MCP endpoint test (set SAGE_AUTH_TOKEN to enable)"
fi

echo ""
echo "✅ All checks passed!"
