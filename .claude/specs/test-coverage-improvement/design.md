# Design: Test Coverage Improvement

## Overview

テスト追加によりカバレッジを80%閾値に到達させる。最も影響度の高いファイルから優先的にテストを追加する。

## Target Coverage

| Metric | Current | Target | Gap to Fill |
|--------|---------|--------|-------------|
| Statements | 70.66% | 80% | +9.34% |
| Branches | 56.82% | 70% | +13.18% |
| Lines | 70.75% | 80% | +9.25% |
| Functions | 67.41% | 80% | +12.59% |

## Priority Files for Test Addition

### Priority 1: mcp-handler.ts (1469 lines, 42.51% coverage)

**未カバー領域の分析:**
- `initialize()` - 設定読み込み (lines 184, 189-191)
- `initializeHotReload()` - ホットリロード初期化 (lines 205-267)
- `initializeServices()` - サービス初期化 (lines 317-345)
- Context creation methods (lines 350-480)
- Tool call error handling (line 513)

**テスト戦略:**
```typescript
// tests/unit/mcp-handler-extended.test.ts

describe('MCPHandler initialization', () => {
  it('should initialize with valid config');
  it('should handle config load failure gracefully');
  it('should skip hot-reload when disabled');
});

describe('MCPHandler service contexts', () => {
  it('should create SetupContext correctly');
  it('should create TaskToolsContext correctly');
  it('should create CalendarToolsContext correctly');
  it('should create OAuthToolsContext correctly');
});

describe('MCPHandler tool handlers', () => {
  it('should handle calendar tools');
  it('should handle reminder tools');
  it('should handle task tools');
});
```

**モック戦略:**
- `ConfigLoader.load()` をモック
- 各サービス（CalendarSourceManager, ReminderManager等）をモック
- 環境変数（GOOGLE_CLIENT_ID等）をセットアップ

### Priority 2: oauth-handler.ts (697 lines, 1.73% coverage)

**テスト戦略:**
- OAuth認証フローのテスト
- トークン検証のテスト
- エラーハンドリングのテスト

### Priority 3: todo-list-manager.ts (756 lines, 49.54% coverage)

**テスト戦略:**
- 既存テストの拡張
- エッジケースの追加
- エラーハンドリングのテスト

## Architecture

### Test File Structure

```
tests/
├── unit/
│   ├── mcp-handler.test.ts          # 既存
│   ├── mcp-handler-init.test.ts     # NEW: 初期化テスト
│   ├── mcp-handler-contexts.test.ts # NEW: コンテキスト生成テスト
│   ├── mcp-handler-tools.test.ts    # NEW: ツールハンドラテスト
│   ├── oauth-handler.test.ts        # NEW: OAuthテスト
│   └── todo-list-manager-extended.test.ts # NEW: 拡張テスト
```

### Mock Strategy

```typescript
// tests/mocks/config-loader.mock.ts
export const mockConfigLoader = {
  load: jest.fn().mockResolvedValue({
    user: { name: 'Test User', role: 'developer' },
    calendar: { sources: { eventkit: { enabled: true } } },
    // ... minimal valid config
  }),
};

// tests/mocks/services.mock.ts
export const mockCalendarSourceManager = {
  listEvents: jest.fn(),
  createEvent: jest.fn(),
};
```

## Coverage Exclusions (REQ-2)

テスト困難なインフラファイルを除外:

```javascript
// jest.config.js
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',
  '!src/index.ts',
  '!src/cli/signal-handler.ts',      // プロセスシグナル
  '!src/cli/sse-stream-handler.ts',  // SSEストリーミング
  '!src/services/container.ts',       // DIコンテナ
  '!src/services/remote-mcp-adapter.ts', // リモートアダプター
],
```

## Implementation Order

1. **Phase 1**: jest.config.js の除外設定 (即時効果)
2. **Phase 2**: mcp-handler テスト追加 (~+15% coverage impact)
3. **Phase 3**: oauth-handler テスト追加 (~+5% coverage impact)
4. **Phase 4**: todo-list-manager テスト拡張 (~+3% coverage impact)

## Expected Coverage After Implementation

| Phase | Statements | Branches | Lines | Functions |
|-------|------------|----------|-------|-----------|
| Current | 70.66% | 56.82% | 70.75% | 67.41% |
| Phase 1 (exclusions) | ~71% | ~57% | ~71% | ~68% |
| Phase 2 (mcp-handler) | ~78% | ~65% | ~78% | ~76% |
| Phase 3 (oauth) | ~82% | ~70% | ~82% | ~80% |
| Phase 4 (todo) | ~85% | ~73% | ~85% | ~83% |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| モックが複雑すぎる | 中 | 必要最小限のモックに限定 |
| テストが脆い | 中 | 実装詳細ではなく振る舞いをテスト |
| テスト時間増加 | 低 | 並列実行で対応 |

## Success Criteria

- [ ] 全てのカバレッジ閾値（80%/70%/80%/80%）を満たす
- [ ] CIが成功する
- [ ] テストが安定している（フレーキーでない）
