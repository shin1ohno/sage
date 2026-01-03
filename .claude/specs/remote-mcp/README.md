# Remote MCP Specifications

Remote MCP Server機能に関する仕様。iOS/Web等からのリモートアクセスを定義します。

## Components

| Component | Description | Source |
|-----------|-------------|--------|
| RemoteMCPServer | HTTPサーバー、リクエスト処理 | `src/remote/server.ts` |
| MCPHandler | MCP JSON-RPCハンドラー | `src/remote/mcp-handler.ts` |
| HttpTransport | HTTP POST Transport | `src/remote/http-transport.ts` |

## Features

- **HTTP Transport**: JSON-RPC over HTTP POST
- **OAuth 2.1 Authentication**: 認証必須
- **CORS Support**: 設定可能なオリジン
- **HTTPS**: TLS 1.2+必須

## Supported Platforms

| Platform | Access Method |
|----------|---------------|
| iOS | Remote MCP (HTTPS) |
| iPadOS | Remote MCP (HTTPS) |
| Web (claude.ai) | Remote MCP (HTTPS) |

## Related Requirements

ルートの `requirements.md` から:
- 要件13: Remote MCP Server対応
- 要件14: CLIオプションとサーバーモード
- 要件15: Remote MCP設定ファイルと認証
- 要件20: HTTP Transport対応

## Configuration

```json
{
  "remote": {
    "port": 3000,
    "host": "0.0.0.0",
    "httpsEnabled": true,
    "corsOrigins": ["https://claude.ai"]
  }
}
```

## See Also

- [OAuth](../oauth/README.md)
- [Security](../shared/security.md)
