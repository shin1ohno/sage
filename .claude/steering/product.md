# Product Steering Document

## Product Overview

**Name**: sage（賢者）
**Version**: 0.8.0
**Status**: Production Ready

sage は Claude Desktop、Claude Code、および Remote クライアント向けの AI タスク管理アシスタント MCP サーバーです。

## Problem Statement

エンジニアは日々多くのタスク（メール、Slack、会議メモなど）に直面し、優先順位付けと時間管理に苦労しています。sage はこれらのタスクを自動的に分析し、適切なツールに振り分けることで、エンジニアの生産性を向上させます。

## Target Users

### Primary Users
- **Mercari エンジニア**（Individual Contributors）
  - 日常的に多くのタスクを処理
  - Claude Desktop/Code を使用
  - Apple Reminders と Notion を併用

- **Engineering Managers**
  - チームメンバーからの依頼が多い
  - 会議が多く、カレンダー管理が重要
  - タスクの優先順位付けが重要

### Future Users
- Mercari 全社員への展開を計画

## Core Features

### 1. Task Analysis
- テキスト入力（メール、会議メモ等）からタスクを自動抽出
- 優先度自動判定（P0: 緊急、P1: 高、P2: 中、P3: 低）
- 時間見積もり（25分単位）
- 関係者（stakeholder）抽出

### 2. Smart Reminder Routing
| 期限 | 振り分け先 | 理由 |
|------|-----------|------|
| ≤7日 | Apple Reminders | 短期、アクション可能 |
| 8+日 | Notion | 長期計画用 |
| なし | Notion | 期限なしは長期タスク |

### 3. Calendar Integration
- **マルチソース対応**: EventKit + Google Calendar
- **プラットフォーム別**:
  - macOS: EventKit + Google Calendar（両方可）
  - Linux/Windows: Google Calendar のみ
- **機能**: イベント一覧、作成、削除、返信、空き時間検索
- **イベント重複排除**: iCalUID とヒューリスティックマッチング
- **自動フォールバック**: ソース障害時に他ソースに切り替え

### 4. Working Cadence
- Deep Work Days のトラッキング
- Meeting Heavy Days の検出
- スケジューリング推奨事項の提供

### 5. Remote Access
- OAuth 2.1 認証（PKCE S256）
- HTTP Transport（JSON-RPC over POST）
- iOS/iPadOS/Web からのアクセス対応

## Platform Support

| Platform | Access Method | Calendar Sources |
|----------|---------------|------------------|
| macOS Desktop | Local MCP (Stdio) | EventKit + Google Calendar |
| Linux/Windows Desktop | Local MCP (Stdio) | Google Calendar only |
| iOS/iPadOS | Remote MCP (HTTPS) | Via Remote MCP |
| Web (claude.ai) | Remote MCP (HTTPS) | Via Remote MCP |

## Success Metrics

- テストカバレッジ: 98%以上維持
- MCP ツール数: 24個実装済み
- テスト数: 1153テスト（100% pass）

## Non-Goals

- GUI/Webフロントエンドの提供（MCP経由のみ）
- 複数ユーザー同時アクセス（シングルユーザー前提）
- リアルタイムコラボレーション機能

## Future Roadmap

- [ ] Machine learning でタスク優先度予測
- [ ] Multi-user support for teams
- [ ] Slack/Teams integration
- [ ] Voice interface support
- [ ] Additional calendar providers (Microsoft 365, iCloud)
