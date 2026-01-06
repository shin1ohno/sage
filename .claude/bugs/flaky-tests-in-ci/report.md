# Bug Report

## Bug Summary
CIでフレーキーテストが断続的に失敗する。JWT期限切れテストとHTTPサーバーテストの両方で発生。

## Bug Details

### Expected Behavior
すべてのテストがCI環境で一貫して成功する。

### Actual Behavior
以下のテストがCIで断続的に失敗する：

1. **`tests/unit/http-server-auth.test.ts`**
   - テスト: `should return JWT token when secret is valid`
   - エラー: `Exceeded timeout of 5000 ms for a test`
   - `afterEach`フックも5000msでタイムアウト（`server.stop()`が完了しない）

2. **`tests/unit/jwt-middleware.test.ts`**
   - テスト: `should reject access with expired token`
   - エラー: `expect(received).toBe(expected)` - トークンが期限切れになっていない
   - 1500ms待機後もトークンがまだ有効

3. **`tests/unit/oauth-token-service.test.ts`**
   - テスト: `should reject expired token`
   - エラー: 同上 - 1500ms待機後もトークンが有効

### Steps to Reproduce
1. GitHub Actionsでmainブランチにpush
2. CIワークフローが実行される
3. Node 20.xまたは22.xでテストが失敗
4. 次回の実行では成功することがある（フレーキー）

### Environment
- **Version**: 1.0.2
- **Platform**: GitHub Actions (macos-latest)
- **Node Versions**: 20.x, 22.x
- **Test Runner**: Jest with `--maxWorkers=2`

## Impact Assessment

### Severity
- [x] Medium - Feature impaired but workaround exists

### Affected Users
- 開発者（CIが不安定でマージがブロックされる）

### Affected Features
- CI/CDパイプライン
- テストの信頼性

## Additional Context

### Error Messages
```
# http-server-auth.test.ts
thrown: "Exceeded timeout of 5000 ms for a test.
Add a timeout value to this test to increase the timeout..."

# jwt-middleware.test.ts
expect(received).toBe(expected) // Object.is equality
Expected: false
Received: true

# oauth-token-service.test.ts
expect(received).toBe(expected)
Expected: false
Received: true
```

### CI Run Evidence
- 失敗: https://github.com/shin1ohno/sage/actions/runs/20751237037 (2026-01-06T14:24:54Z)
- 失敗: https://github.com/shin1ohno/sage/actions/runs/20747096228 (2026-01-06T11:35:22Z)
- 成功: https://github.com/shin1ohno/sage/actions/runs/20747347377 (2026-01-06T12:01:09Z)

### Related Issues
- 最近のコミット `571d05e` でタイムアウト最適化を実施したが、一部のテストでまだ問題が発生

## Initial Analysis

### Suspected Root Cause

**問題1: HTTPサーバーテストのタイムアウト**
- `createHTTPServerWithConfig()`が`waitForServerReady()`を使用していない
- サーバー起動/停止が完了する前にテストが進行
- `server.stop()`の完了を待たずに次のテストが開始

**問題2: JWT期限切れテストのタイミング**
- JWTの`exp`クレームは秒単位（Unix timestamp seconds）
- 1秒の期限でトークンを生成し、1500ms待機
- **タイミング問題**: トークン生成が秒の境界近く（例: T.999秒）で発生すると、1500ms待機後もトークンがまだ有効になりうる
  - 生成時刻: T.999秒 → exp = T+1秒
  - 1500ms後: T+2.499秒 → まだexp時刻(T+1)を過ぎていない可能性がある
  - これはJWT検証ライブラリのclock skew tolerance設定にも依存

**問題3: CI環境の特性**
- GitHub Actions runnerはリソースを共有しており、タイミングが不安定
- macOS runnerは特に不安定な傾向がある
- `--maxWorkers=2`で並列実行しているため、リソース競合が発生

### Affected Components
- `tests/unit/http-server-auth.test.ts` - HTTPサーバー統合テスト
- `tests/unit/jwt-middleware.test.ts` - JWT期限切れテスト
- `tests/unit/oauth-token-service.test.ts` - OAuth期限切れテスト
- `src/cli/http-server-with-config.ts` - HTTPサーバー実装
- `src/cli/jwt-middleware.ts` - JWT検証実装

## Fix Implementation

### Status: ✅ Fixed

### Changes Applied

**1. JWT期限切れテストの待機時間を2000msに増加**

ファイル: `tests/unit/jwt-middleware.test.ts`, `tests/unit/oauth-token-service.test.ts`

```typescript
// Before: 1500ms - 秒境界のタイミング問題で不十分
await new Promise((resolve) => setTimeout(resolve, 1500));

// After: 2000ms - 秒単位の粒度を考慮した安全な待機時間
await new Promise((resolve) => setTimeout(resolve, 2000));
```

**理由**: JWTの`exp`クレームは秒単位。1秒有効期限 + 1秒バッファ = 2秒が最小安全待機時間。

**2. HTTPサーバーテストにイベントベース検出を追加**

ファイル: `tests/unit/http-server-auth.test.ts`

- `jest.setTimeout(30000)` を追加（安全マージン）
- `waitForServerReady()` を使用してサーバー起動完了を確認
- ヘルパー関数 `createAndWaitForServer()` を導入

```typescript
async function createAndWaitForServer(
  options: Parameters<typeof createHTTPServerWithConfig>[0]
): Promise<HTTPServerWithConfig> {
  const srv = await createHTTPServerWithConfig(options);
  const port = srv.getPort();
  const host = srv.getHost();
  await waitForServerReady(`http://${host}:${port}/health`);
  return srv;
}
```

### Test Results

ローカルで3回連続テスト成功を確認：
- Run 1: 51 passed (24.3s)
- Run 2: 51 passed (23.1s)
- Run 3: 51 passed (23.0s)
