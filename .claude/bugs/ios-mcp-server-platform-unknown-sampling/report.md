# Bug Report: iOSアプリからのMCPサーバーアクセスでunknownと判別され、Samplingが利用されない

**Report Date:** 2026-01-09
**Bug ID:** ios-mcp-server-platform-unknown-sampling
**Priority:** Critical
**Status:** Reported

---

## Summary

iOSアプリからsage MCPサーバーにアクセスした際、プラットフォームが `unknown` と判別されるため、Sampling機能が使用されない問題。これにより、iOS/iPadOSユーザーがネイティブAPI統合の恩恵を受けられず、MCP経由の機能のみが利用可能になる。

---

## Environment

- **発生プラットフォーム:** iOS/iPadOS (Claude iOSアプリ)
- **sage Version:** 最新 (Platform Adaptive Integration実装後)
- **MCP SDK Version:** @modelcontextprotocol/sdk ^1.0.4
- **影響範囲:** Critical - 全てのiOSユーザーに影響

---

## Impact

### ユーザーへの影響

1. **リマインダー作成が非効率**
   - iOS/iPadOSネイティブReminders APIが使用されず、代替手段のみ利用可能
   - `set_reminder` toolでSamplingによるネイティブ統合が機能しない

2. **カレンダー統合が限定的**
   - iOS/iPadOSネイティブCalendar APIが使用されず、Google Calendarのみアクセス可能
   - `list_calendar_events` toolでSamplingによるネイティブ統合が機能しない

3. **プラットフォーム適応型統合の価値喪失**
   - 全てのiOS/iPadOSユーザーがプラットフォーム固有の最適化を受けられない
   - パフォーマンス低下とユーザーエクスペリエンスの劣化

---

## Expected Behavior

### 期待される動作

1. **iOSアプリからのアクセス時**
   - `clientInfo.name` に "ios" または "ipad" を含む識別子が送信される
   - または、`clientInfo.name` が "Anthropic/ClaudeAI" でも `supportsSampling = true` であればiOS/iPadと推論される

2. **プラットフォーム検出結果**
   - `platform` = `'ios'` または `'ipados'`
   - `supportsSampling` = `true`
   - `detectionConfidence` = `'high'` または `'medium'`

3. **Tool実行時の動作**
   - `set_reminder` → `handleSetReminderWithSampling()` が呼び出される
   - `list_calendar_events` → `handleListCalendarEventsWithSampling()` が呼び出される
   - Samplingによるネイティブ統合が利用される

---

## Actual Behavior

### 実際の動作

1. **iOSアプリからのアクセス時**
   - `clientInfo.name` = `"Anthropic/ClaudeAI"` (汎用名)
   - `transportHint` = `'http'` (Remote MCP)
   - `supportsSampling` = `true`

2. **プラットフォーム検出結果**
   - `platform` = `'unknown'` ← **問題点**
   - `supportsSampling` = `true` ← 正常
   - `detectionConfidence` = `'low'` ← **問題点**

3. **Tool実行時の動作**
   - `set_reminder` → `handleSetReminder()` (非Sampling版) が呼び出される
   - `list_calendar_events` → `handleListCalendarEvents()` (非Sampling版) が呼び出される
   - **Sampling版のハンドラーが一切実行されない**

---

## Root Cause Analysis

### 根本原因

**src/platform/detector.ts:134-163** のプラットフォーム検出ロジックに問題がある。

```typescript
// detectPlatform() method - Line 125-181
static detectPlatform(
  clientInfo: ClientInfo,
  capabilities: ClientCapabilities,
  transportHint?: 'stdio' | 'http'
): DetectedPlatform {
  const clientName = clientInfo.name.toLowerCase();
  const supportsSampling = capabilities.sampling !== undefined;

  // Detect platform and confidence from client name
  let { platform, confidence } = this.detectPlatformFromClientName(clientName);

  // Refine detection for generic client names using transport mode
  // "Anthropic/ClaudeAI" is used by Desktop, iOS, and iPad clients
  if (platform === 'unknown' && transportHint) {
    if (transportHint === 'stdio') {
      // Stdio transport → Local Desktop Claude (macOS/Linux/Windows)
      platform = 'desktop';
      confidence = 'medium';
      // ...
    }
    // Note: HTTP transport alone is NOT sufficient to determine iOS/iPad
    // because Desktop Claude Code can also connect via Remote MCP (HTTP).
    // Both Desktop and iOS/iPad may support Sampling.
    //
    // For HTTP connections with generic client names, we keep platform as 'unknown'
    // and rely on graceful fallback behavior in tool handlers.
    else if (transportHint === 'http') {
      console.log(
        `[sage] Generic client name "${clientInfo.name}" with HTTP transport. ` +
        `Could be iOS/iPad or Desktop via Remote MCP. Keeping as 'unknown' for safety. ` +
        `Sampling: ${supportsSampling}`
      );
      // Keep platform as 'unknown' - do not assume iOS/iPad  ← **問題箇所**
      // ...
    }
  }
  // ...
}
```

#### 問題点の詳細

1. **HTTP transportだけでは判別しない設計**
   - コメント通り、Desktop Claude CodeもRemote MCP経由でHTTP接続可能
   - しかし、`supportsSampling = true` という追加情報を活用していない

2. **Samplingサポート情報を無視**
   - `supportsSampling` が `true` であることは強力なヒント
   - iOS/iPadOSおよびDesktop Claudeは両方Samplingをサポート可能
   - しかし、現状のロジックではこの情報を使用していない

3. **"unknown"として扱う保守的な判断**
   - コメントでは「graceful fallback behavior」に頼ると記載
   - しかし実際には、**tool registrationでSampling版ハンドラーが登録されない**ため、フォールバックが機能しない

---

## Technical Details

### コード詳細分析

#### 問題の流れ

1. **mcp-handler.ts:71-87** でプラットフォーム検出
   ```typescript
   // MCP initialize時に呼ばれる
   this.detectedPlatform = PlatformDetector.detectPlatform(
     clientInfo,
     capabilities,
     transportHint
   );
   // → platform = 'unknown' が返ってくる
   ```

2. **mcp-handler.ts:212-288** でツール登録
   ```typescript
   // registerToolsメソッド
   if (
     this.detectedPlatform.supportsSampling &&
     (this.detectedPlatform.platform === 'ios' ||
      this.detectedPlatform.platform === 'ipados')
   ) {
     // Sampling版ハンドラーを登録
     // ...
   }
   // → platform === 'unknown' なので、この条件に入らない！
   ```

3. **結果**
   - Sampling版の `set_reminder` および `list_calendar_events` が登録されない
   - 代わりに非Sampling版が使用される
   - iOS/iPadOSネイティブ統合が一切機能しない

---

## Reproduction Steps

### 再現手順

1. **iOSアプリでsage MCPサーバーに接続**
   ```
   Claude iOS app → Remote MCP → sage server
   ```

2. **プラットフォーム検出を確認**
   ```typescript
   // Console output:
   // [sage] Generic client name "Anthropic/ClaudeAI" with HTTP transport.
   // Could be iOS/iPad or Desktop via Remote MCP. Keeping as 'unknown' for safety.
   // Sampling: true
   ```

3. **リマインダー作成ツールを呼び出す**
   ```typescript
   // set_reminder tool call
   ```

4. **結果を確認**
   - 期待: `handleSetReminderWithSampling()` が呼ばれる
   - 実際: `handleSetReminder()` (非Sampling版) が呼ばれる

### 再現率

- **100%**: 毎回確実に再現する

---

## Affected Code

### 影響を受けるファイル

1. **src/platform/detector.ts**
   - `detectPlatform()` method (Line 125-181)
   - `detectPlatformFromClientName()` method (Line 201-238)

2. **src/cli/mcp-handler.ts**
   - `registerTools()` method (Line 212-288)
   - Sampling版ツール登録の条件判定

3. **src/tools/reminders/handlers.ts**
   - `handleSetReminderWithSampling()` (Line 276-407)
   - 呼び出されない関数

4. **src/tools/calendar/handlers.ts**
   - `handleListCalendarEventsWithSampling()` (Line 1972-2058)
   - 呼び出されない関数

---

## Logs

### ログ出力例

```
[sage] Generic client name "Anthropic/ClaudeAI" with HTTP transport. Could be iOS/iPad or Desktop via Remote MCP. Keeping as 'unknown' for safety. Sampling: true
```

**分析:**
- `clientInfo.name` = `"Anthropic/ClaudeAI"`
- `transportHint` = `'http'`
- `supportsSampling` = `true`
- **結果:** `platform = 'unknown'` (期待: `'ios'` または `'ipados'`)

---

## Related Issues

### 関連する仕様

- **Requirements:** 1.2, 1.6, 2.1-2.3 (platform-adaptive-integration)
- **Design:** Platform detection strategy (design.md)
- **Tasks:** Task 1-4 (platform-adaptive-integration)

### 類似のバグ

- なし（新機能のため）

---

## Workarounds

### 一時的な回避策

現時点では有効な回避策なし。ユーザー側で対応できることはない。

### 代替手段

- Google Calendar APIのみを使用（ネイティブ統合なし）
- 手動でリマインダー作成（自動化なし）

---

## Next Steps

次のステップとして `/bug-analyze` を実行し、根本原因の詳細な分析と修正案の作成を行います。

---

## Proposed Solutions

### 短期的な解決策 (Server-side)

**sage側のロジック改善で対応**

1. **Samplingサポート情報を活用**
   ```typescript
   // HTTP + Sampling = iOS/iPadOS の可能性が高い
   if (platform === 'unknown' && transportHint === 'http' && supportsSampling) {
     platform = 'ios'; // or 'ipados'
     confidence = 'medium';
   }
   ```

2. **fallback mechanismの改善**
   - tool registration時に両方のハンドラー（Sampling版/非Sampling版）を登録
   - 実行時に動的にどちらを使うか判断

**利点:**
- sage側だけで対応可能
- 即座に実装できる

**欠点:**
- 推論ベースなので誤判定のリスクあり
- Desktop Claude Code (Remote MCP + Sampling) と区別できない可能性

---

### 中期的な解決策 (Client-side Extension)

**MCPクライアント側に拡張情報を追加**

#### 提案仕様

`capabilities`に`nativeIntegrations`情報を含める:

```typescript
// Claude iOS app から送信される capabilities
{
  "sampling": {},
  "experimental": {
    "nativeIntegrations": {
      "calendar": true,        // iOS Calendar API available
      "reminders": true,       // iOS Reminders API available
      "contacts": false,       // Not implemented yet
      "photos": false          // Not implemented yet
    }
  }
}
```

#### sage側の実装

```typescript
// src/platform/detector.ts
static detectPlatform(
  clientInfo: ClientInfo,
  capabilities: ClientCapabilities,
  transportHint?: 'stdio' | 'http'
): DetectedPlatform {
  // Check for native integrations in capabilities
  const nativeIntegrations = capabilities.experimental?.nativeIntegrations;

  if (nativeIntegrations?.calendar || nativeIntegrations?.reminders) {
    // Native integrations available = iOS/iPadOS確定
    platform = 'ios'; // or detect ipados specifically
    confidence = 'high';
    return { platform, confidence, supportsSampling: true };
  }

  // Fallback to existing logic
  // ...
}
```

**利点:**
- 確実にプラットフォームを識別可能
- 誤判定のリスクなし
- 将来的な拡張性が高い（他のネイティブ機能も追加可能）

**欠点:**
- Claude iOSアプリ側の実装が必要（Anthropic社への依頼）
- 実装完了まで時間がかかる

**実装依頼先:**
- Anthropic社 Claude iOS/iPadOSチーム
- GitHub Issue: https://github.com/anthropics/claude-ios (もし公開リポジトリがあれば)

---

### 長期的な解決策 (MCP Standard Extension)

**MCP標準仕様への追加を提案**

#### MCP仕様への提案内容

`capabilities`の標準フィールドとして`nativeIntegrations`を追加:

```typescript
// MCP Standard: ClientCapabilities
interface ClientCapabilities {
  sampling?: {};
  roots?: { listChanged?: boolean };
  experimental?: {
    // Proposed: Native platform integrations
    nativeIntegrations?: {
      calendar?: boolean;
      reminders?: boolean;
      contacts?: boolean;
      photos?: boolean;
      notifications?: boolean;
      // ... other native features
    };
  };
}
```

**利点:**
- すべてのMCPクライアントで標準化
- プラットフォーム検出が確実になる
- エコシステム全体で恩恵を受ける

**欠点:**
- 標準化プロセスに時間がかかる
- すべてのMCPクライアントでの実装が必要

**提案先:**
- MCP Specification Repository: https://github.com/modelcontextprotocol/specification
- Discussion: MCP仕様のIssue/PRとして提案

---

## Additional Notes

### 重要なポイント

1. **Sampling capability情報の活用が必要**
   - `supportsSampling = true` はiOS/iPadOSの強い指標
   - この情報を使ってプラットフォーム推論を改善すべき

2. **fallback設計の問題**
   - コメントでは「graceful fallback」と書かれているが、実際には機能しない
   - tool registration時にplatform判定が完了しているため、後からfallbackできない

3. **影響範囲の広さ**
   - 全てのiOSユーザーが影響を受ける
   - プラットフォーム適応型統合の主要な価値提案が失われる

4. **理想的な解決策はMCP標準拡張**
   - クライアント側から`nativeIntegrations`情報を送信してもらう
   - sage側で確実にプラットフォーム検出が可能になる
   - 短期的にはsage側のロジック改善で対応し、並行してMCP拡張を提案すべき
