# Integrations Specifications

外部サービス統合に関する仕様。Notion、Apple Reminders等の統合を定義します。

## Documents

| Document | Description |
|----------|-------------|
| [integrations.md](./integrations.md) | 統合全体の設計 |

## Integrations

| Integration | Description | Source |
|-------------|-------------|--------|
| Notion MCP | Notion API統合 | `src/integrations/notion-mcp-service.ts` |
| Apple Reminders | Apple Reminders統合 | `src/integrations/apple-reminders-service.ts` |

## Components

| Component | Description |
|-----------|-------------|
| NotionMCPService | Notion MCP Server統合 |
| AppleRemindersService | Apple Reminders統合 |
| ReminderManager | リマインダー宛先ルーティング |

## Features

- **Notion Integration**: タスク管理、8日以上先のリマインダー
- **Apple Reminders Integration**: 7日以内のリマインダー
- **Automatic Routing**: 期限に基づく自動宛先選択

## Related Requirements

ルートの `requirements.md` から:
- 要件5: リマインド管理
- 要件8: Notion統合
- 要件9: Apple Reminders統合

## See Also

- [Shared Data Models](../shared/data-models.md)
