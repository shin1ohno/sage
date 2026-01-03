# OAuth Specifications

OAuth 2.1認証に関する仕様。Remote MCPおよびGoogle Calendar API認証を定義します。

## Documents

| Document | Description |
|----------|-------------|
| [oauth-spec.md](./oauth-spec.md) | OAuth 2.1詳細仕様 |

## Components

| Component | Description | Source |
|-----------|-------------|--------|
| OAuthServer | OAuth 2.1認証サーバー | `src/oauth/oauth-server.ts` |
| TokenService | JWT生成・検証、トークン管理 | `src/oauth/token-service.ts` |
| GoogleOAuthHandler | Google OAuth 2.0フロー | `src/oauth/google-oauth-handler.ts` |
| OAuthClientManager | クライアント登録・管理 | `src/oauth/oauth-client-manager.ts` |

## Features

- **OAuth 2.1 with PKCE**: S256 code challenge
- **Dynamic Client Registration**: RFC 7591準拠
- **JWT Tokens**: RS256署名、24時間有効期限
- **Refresh Token Rotation**: セキュアなトークン更新
- **Google OAuth Integration**: Google Calendar API認証

## Related Requirements

ルートの `requirements.md` から:
- 要件21-31: OAuth 2.1認証

## Security

詳細は [security.md](../shared/security.md) を参照。

## See Also

- [Remote MCP](../remote-mcp/README.md)
- [Google Calendar](../calendar/google-calendar/README.md)
