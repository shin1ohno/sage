# 要件文書

## はじめに

sage（賢者）は、Claude DesktopとClaude Code向けのMCPサーバーとして実装されるAIアシスタントです。タスク管理、優先順位付け、リマインド設定、カレンダー統合を自動化します。システムは個人の作業パターンを学習し、パーソナライズされたタスク整理とスケジューリング推奨を提供します。

このプラグインは最初にMercariのエンジニア（個人貢献者およびエンジニアリングマネージャー）をターゲットとし、将来的には全社展開を計画しています。Apple Reminders（AppleScript経由）、Notion（MCP経由）、カレンダー（AppleScript経由）と統合し、macOS環境でシームレスなタスク管理を提供します。

## プラットフォーム対応状況

| プラットフォーム | 状態 | 備考 |
|----------------|------|------|
| Desktop MCP (macOS) | ✅ 実装済み | AppleScript、ファイルシステム、Notion MCP |
| iOS/iPadOS | ✅ **Remote MCP対応** | Remote MCPサーバー経由で完全機能 |
| Web | ✅ **Remote MCP対応** | Remote MCPサーバー経由で完全機能 |

> **Remote MCP対応**: iOS/iPadOSとWebブラウザからClaude.aiを使用する際、Remote MCPサーバー経由でデスクトップ版と同等の完全機能にアクセス可能です。ネイティブSkills統合は不要となりました。

## 要件

### 要件1: 初期セットアップと設定

**ユーザーストーリー:** 新規ユーザーとして、3分以内に初期セットアップを完了したい。複雑な設定なしにすぐにAIアシスタントを使い始められるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** ユーザーが初回プラグインを起動したとき、システムは~/.sage/config.jsonの存在を確認すること
2. **WHERE** 設定ファイルが存在しない場合、システムはセットアップが必要であることを示すメッセージを表示すること
3. **WHEN** ユーザーがセットアップウィザードを開始したとき、システムは10問以下のセットアップ質問を順次提示すること
4. **WHEN** ユーザーがすべてのセットアップ質問に回答したとき、システムは30秒以内に設定ファイルを生成すること
5. **WHERE** 設定を永続化する際、システムは設定内容を~/.sage/config.jsonファイルに保存すること
6. **WHEN** セットアップが正常に完了したとき、システムは設定成功を示す確認メッセージをユーザーに表示すること

### 要件2: タスク分析と優先順位付け

**ユーザーストーリー:** 忙しいエンジニアとして、システムに自動的にタスクを分析して優先順位を割り当ててもらいたい。最も重要な作業に最初に集中できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** ユーザーがタスクリストを提供したとき、システムは各タスクに対して優先度レベル（P0、P1、P2、P3のいずれか）を分析すること
2. **WHERE** 優先度を決定する際、システムは設定ファイルに定義されたルールに基づいてP0、P1、P2、P3のいずれかを割り当てること
3. **WHERE** タスクのタイトルまたは説明に期限キーワード（「今日」「明日」「ASAP」など）が含まれている場合、システムは緊急度を考慮して優先順位を高く設定すること
4. **WHERE** タスクにユーザーのマネージャー名が言及されている場合、システムは優先度を1段階以上高く設定することを考慮すること
5. **WHEN** システムが優先度を決定したとき、システムは割り当て理由を含む説明を提供すること
6. **WHEN** システムがタスクを分析したとき、システムは完了時間を分単位で見積もり、結果に含めること

### 要件3: 時間見積もりとスケジューリング

**ユーザーストーリー:** ユーザーとして、システムにタスクの所要時間を見積もってもらい、いつ実行するかを提案してもらいたい。効果的に一日を計画できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** システムがタスクを分析するとき、システムはタスクのタイトルと説明に含まれるキーワードに基づいて完了時間を見積もること
2. **WHERE** 時間見積もりを計算する際、システムは以下の時間マッピングを使用すること：
   - Simple（シンプル）: 25分
   - Medium（標準）: 50分
   - Complex（複雑）: 75分
   - Project（プロジェクト）: 175分
   - **制約**: 全ての基本時間は25分の倍数であること
3. **WHEN** 修飾子（タスクの長さ、ミーティング、デバッグ等）を適用した後、システムは最終的な見積もり時間を最も近い25分の倍数に丸めること
4. **WHERE** 見積もり結果を出力する際、システムは25分の倍数（25, 50, 75, 100, 125, 150, 175, 200分など）のみを返すこと
5. **WHEN** システムが利用可能な時間枠を検索するとき、システムはユーザーのカレンダーを確認すること
6. **WHERE** カレンダーを確認する際、システムは設定ファイルに定義された勤務時間（開始時刻、終了時刻）を尊重すること
7. **WHEN** システムが時間枠を提案するとき、システムは設定された深い作業日（Deep Work Days）と会議の多い日（Meeting Heavy Days）を考慮すること
8. **WHERE** カレンダー上に競合がない場合、システムは最適な時間枠を理由と共に提案すること

### 要件4: 関係者の識別

**ユーザーストーリー:** チームメンバーとして、システムにタスクに関わる他の人を識別してもらいたい。適切な人と効果的に連携できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** システムがタスクを分析するとき、システムはタスクのタイトルと説明から人名を抽出すること
2. **WHERE** 関係者を抽出する際、システムは設定ファイルに登録されたチームメンバーリストを参照して認識すること
3. **WHERE** タスクのタイトルまたは説明に@記号を含むメンション（例: @田中）が含まれている場合、システムはそれを関係者として含めること
4. **WHERE** タスク内容にマネージャーを示すキーワード（「マネージャー」「上司」「manager」など）が検出された場合、システムはマネージャーの関与をフラグ付けすること
5. **WHEN** システムが関係者の識別を完了したとき、システムは関連する人のリストを結果に含めること

### 要件5: リマインド管理

**ユーザーストーリー:** 忘れっぽい人として、システムにタスクの適切なリマインドを設定してもらいたい。重要な期限を逃さないようにするため。

#### 受け入れ基準（EARS記法）

1. **WHERE** タスクに期限が設定されている場合、システムは期限に基づいて適切なリマインド時間を提案すること
2. **WHERE** タスクの期限が7日以内の場合、システムはApple Remindersアプリケーションにリマインダーを作成すること
3. **WHERE** タスクの期限が8日以上先の場合、システムはNotionデータベースにエントリを作成すること
4. **WHERE** タスクに期限が設定されていない場合、システムは無限の未来と仮定してNotionデータベースにエントリを作成すること
5. **WHEN** システムがリマインドを設定するとき、システムは設定ファイルに定義されたリマインド設定（リスト名、通知タイミングなど）を使用すること
6. **WHEN** リマインド作成が成功したとき、システムは作成成功を示すメッセージをユーザーに返すこと
7. **WHEN** リマインド作成が失敗したとき、システムはエラー内容と原因を含む詳細なメッセージをユーザーに返すこと

### 要件6: カレンダー統合

**ユーザーストーリー:** カレンダーに依存する作業者として、システムに私のスケジュールを理解してもらい、現実的な時間枠を提案してもらいたい。既存のコミットメントの周りでタスクを計画できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** システムが空き時間を確認するとき、システムは利用可能なカレンダー統合方法を検出すること
2. **WHERE** macOSプラットフォームで動作している場合、システムはAppleScript経由でCalendar.appからイベント情報を取得すること
3. **WHEN** システムがカレンダーを分析するとき、システムはイベントが存在しない空き時間枠を識別すること
4. **WHERE** 時間枠の適合性を評価する際、システムは設定ファイルに定義された深い作業日（Deep Work Days）を考慮すること
5. **WHERE** 会議の多い日（Meeting Heavy Days）が設定ファイルに定義されている場合、システムはそれらの日の時間枠を「あまり適さない」とマークすること
6. **WHERE** 既存のカレンダーイベントとの時間的競合が検出された場合、システムはその時間帯を候補から除外すること
7. **WHEN** システムが時間枠を提案するとき、システムは適合性スコアでランク付けし、使用したカレンダー統合方法を明記すること
8. **WHERE** カレンダーアクセスが利用できない場合、システムは手動で空き時間を入力するようユーザーに促すこと

### 要件7: クロスプラットフォーム互換性

**ユーザーストーリー:** Claude DesktopとClaude Codeの両方のユーザーとして、両方の環境で同じ機能を使いたい。どちらのツールを使っていても一貫したタスク管理ができるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHERE** システムがMCPサーバーとしてデプロイされている場合、システムはClaude Desktopアプリケーションから動作すること
2. **WHERE** システムがMCPサーバーとしてデプロイされている場合、システムはClaude Code CLIツールから動作すること
3. **WHERE** いずれかのMCPクライアント（Claude DesktopまたはClaude Code）を使用している場合、システムは同一のツールセットと機能を提供すること
4. **WHERE** 設定ファイル（~/.sage/config.json）が存在する場合、両方のMCPクライアントは同じ設定ファイルを読み込んで使用すること
5. **WHEN** ツールが呼び出されたとき、両方のMCPクライアントは同一の入力に対して同一の結果を返すこと
6. **WHERE** iOS/iPadOS/WebからClaude.ai経由で接続している場合、システムはRemote MCPサーバーを介してデスクトップ版と同等の機能を提供すること

### 要件8: Notion統合

**ユーザーストーリー:** Notionユーザーとして、長期タスクを自動的にNotionデータベースに同期してもらいたい。好みのツールでプロジェクトを管理できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHERE** タスクの期限が8日以上先、または期限が設定されていない場合、システムはNotion MCP Server経由でNotionデータベースに同期すること
2. **WHEN** システムがNotionにタスクを同期するとき、システムは設定ファイルに定義されたデータベースIDを使用すること
3. **WHEN** システムがNotionページを作成するとき、システムはタイトル、優先度、期限、関係者の情報を含めること
4. **WHEN** Notionへの同期が成功したとき、システムは作成されたNotionページのURLをユーザーに返すこと
5. **WHEN** Notion MCP Serverとの通信が失敗したとき、システムはエラーの詳細と手動でコピーして使用できるテキスト形式のタスク情報を提供すること

> **注意**: Notion統合にはNotion MCP Serverが事前に設定されている必要があります。
> **注意**: 期限が設定されていないタスクは「無限の未来」と仮定し、長期タスクとしてNotionで管理されます。

### 要件9: Apple Reminders統合

**ユーザーストーリー:** Appleエコシステムユーザーとして、短期タスクをApple Remindersに追加してもらいたい。すべてのデバイスでネイティブ通知を受け取れるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHERE** タスクの期限が7日以内の場合、システムはApple Remindersアプリケーションにリマインダーを作成すること
2. **WHERE** macOSプラットフォームで動作している場合、システムはAppleScript統合を使用してリマインダーを作成すること
3. **WHEN** システムがリマインダーを作成するとき、システムは設定ファイルに定義されたリマインダーリスト名を使用すること
4. **WHEN** システムがリマインダーを作成するとき、システムは適切な期限日とアラーム時刻を設定すること
5. **WHEN** リマインダー作成が失敗したとき、システムはエラーの詳細と使用した統合方法をユーザーに提供すること
6. **WHERE** AppleScript統合が利用できない場合、システムは手動でコピーして使用できるテキスト形式のリマインダー情報を生成すること

> **注意**: iOS/iPadOS/WebからはRemote MCPサーバー経由でApple Reminders統合を利用できます。

### 要件10: 設定管理

**ユーザーストーリー:** 変化する設定を持つユーザーとして、設定を更新したい。システムが進化する作業パターンに適応できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** ユーザーが設定の更新を要求したとき、システムは設定ファイルの一部のみを更新する部分更新を許可すること
2. **WHERE** カレンダー設定（勤務時間、深い作業日など）を更新する場合、システムは時刻形式（HH:MM形式など）を検証すること
3. **WHERE** 優先度ルールを更新する場合、システムはルール構文の妥当性を検証すること
4. **WHERE** 外部統合設定（Notion、Apple Remindersなど）を更新する場合、システムはAPI接続をテストして接続性を確認すること
5. **WHEN** 設定更新が正常に保存されたとき、システムは変更成功を示すメッセージをユーザーに返すこと
6. **WHEN** 設定検証が失敗したとき、システムは失敗した項目と理由を含む具体的なエラーメッセージを提供すること

### 要件11: タスク分割と整理

**ユーザーストーリー:** 複雑なタスクや複数のタスクを一度に伝えるユーザーとして、システムに適切なサイズのタスクに分割してもらいたい。管理しやすく実行可能なタスクの集合にするため。

#### 受け入れ基準（EARS記法）

1. **WHERE** ユーザーの入力に複数の異なるタスクが含まれている場合、システムは個別のタスクに分離すること
2. **WHERE** ユーザーが大きくて複雑なタスクを提供した場合、システムは実行可能なサブタスクに分割すること
3. **WHEN** システムがタスクを分割するとき、システムは各サブタスクが他のサブタスクに依存せず独立して実行可能であることを確認すること
4. **WHEN** システムがタスクを分割するとき、システムは元のタスクの意図と目標を保持すること
5. **WHERE** タスク間に実行順序や依存関係が存在する場合、システムは適切な順序や依存関係情報を設定すること
6. **WHEN** 分割結果をユーザーに提示するとき、システムは分割理由と推奨実行順序を説明に含めること

### 要件12: TODOリスト管理

**ユーザーストーリー:** 継続的にタスクを管理するユーザーとして、既存のTODOやタスクを一覧表示し、ステータスを更新したい。進行中の作業を効率的に追跡・管理できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** ユーザーがTODOリストを要求したとき、システムはすべての統合ソース（Apple Reminders、Notion）からタスクを集約すること
2. **WHERE** Apple Remindersからタスクを取得する場合、システムは未完了ステータスのリマインダーのみを表示すること
3. **WHERE** Notionからタスクを取得する場合、システムは設定されたデータベースIDから未完了ステータスのタスクのみを表示すること
4. **WHEN** システムがタスクを表示するとき、システムは各タスクの優先度、期限、ステータス、作成日を含めること
5. **WHEN** ユーザーがタスクのステータス更新を要求したとき、システムは該当するソース（Apple RemindersまたはNotion）でステータスを更新すること
6. **WHERE** タスクが完了としてマークされた場合、システムは統合されたすべてのソースで完了ステータスを同期すること
7. **WHERE** ユーザーがフィルタリング条件（優先度、期限、ステータス）を指定した場合、システムは条件に一致するタスクのみを表示すること
8. **WHERE** ユーザーが「今日のタスク」を要求した場合、システムは本日が期限または今日実行予定のタスクのみを表示すること

### 要件13: Remote MCP Server対応

**ユーザーストーリー:** iOS/iPadOSやWebブラウザからClaude.aiを使用するユーザーとして、デスクトップ版と同じ完全なsage機能にアクセスしたい。どのプラットフォームからでも一貫したタスク管理体験を得られるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** Remote MCPサーバーが起動したとき、システムはHTTPS/WebSocket接続を受け入れること ✅
2. **WHERE** Claude iOS/iPadOS/Webからの接続を受け付ける場合、システムはOAuth 2.1認証を実行すること ⚠️ **未実装** (Claude iOSはOAuth 2.0のみサポート、現状は認証なしモードで代替)
3. **WHEN** ユーザー認証が成功したとき、システムはユーザー固有の設定ファイルとデータへのアクセスを提供すること ✅
4. **WHERE** Remote MCP経由でツールが呼び出された場合、システムはLocal MCP版と同一の結果を返すこと ⚠️ **未実装** (HTTPサーバーのMCPハンドラーがプレースホルダー実装)
5. **WHEN** ユーザー設定が更新されたとき、システムは設定ファイルをクラウドストレージに永続化すること ✅
6. **WHERE** 複数デバイスから同時にアクセスがあった場合、システムは設定ファイルの競合を適切に解決すること ✅
7. **WHERE** APIレート制限に達した場合、システムはレート制限を示す適切なエラーメッセージ（429 Too Many Requests）を返すこと ✅
8. **WHERE** 外部API統合（Notion、Calendarなど）を使用する場合、システムはWeb API経由で同等の機能を提供すること ⚠️ **未実装** (13.4に依存)

### 要件14: CLIオプションとサーバーモード

**ユーザーストーリー:** sageを様々な環境で実行するユーザーとして、コマンドラインオプションで動作モードを切り替えたい。Local MCP（Stdio）とRemote MCP（HTTP）を柔軟に選択できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHERE** `--remote`コマンドラインオプションが指定された場合、システムはHTTPサーバーモードで起動すること
2. **WHERE** コマンドラインオプションが指定されていない場合、システムはStdioトランスポート（Local MCP）モードで起動すること
3. **WHERE** `--config <path>`オプションが指定された場合、システムは指定されたパスの設定ファイルを読み込むこと
4. **WHERE** `--port <number>`オプションが指定された場合、システムは指定されたポート番号でHTTPサーバーを起動すること（デフォルト: 3000）
5. **WHERE** `--host <address>`オプションが指定された場合、システムは指定されたアドレスでリッスンすること（デフォルト: 0.0.0.0）
6. **WHERE** 環境変数`SAGE_REMOTE_MODE=true`が設定されている場合、システムはHTTPサーバーモードで起動すること
7. **WHERE** 環境変数`SAGE_PORT`が設定されている場合、システムは指定されたポート番号を使用すること
8. **WHERE** 環境変数`SAGE_AUTH_SECRET`が設定されている場合、システムはその値をJWT認証のシークレットキーとして使用すること
9. **WHERE** HTTPサーバーモードで起動している場合、システムは`/health`エンドポイントでヘルスチェックリクエストに応答すること
10. **WHERE** HTTPサーバーモードで起動している場合、システムは`/mcp`エンドポイントでMCPリクエストを受け付けること

### 要件15: Remote MCP設定ファイルと認証

**ユーザーストーリー:** Remote MCPサーバーを運用するユーザーとして、設定ファイルでサーバー設定と認証を管理したい。セキュアにAPIアクセスを制御できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** システムがHTTPサーバーモードで起動するとき、システムは`~/.sage/remote-config.json`から設定を読み込むこと
2. **WHERE** `--remote-config <path>`オプションが指定された場合、システムは指定されたパスのリモート設定ファイルを読み込むこと
3. **WHERE** リモート設定ファイルが存在しない場合、システムはデフォルト設定で起動すること
4. **WHERE** 設定ファイルに`auth.secret`が設定されている場合、システムはそれをJWT署名のシークレットキーとして使用すること
5. **WHEN** `/auth/token`エンドポイントにPOSTリクエストで`{"secret": "<設定されたsecret>"}`が送信されたとき、システムはJWTトークンを生成して返すこと
6. **WHERE** 不正なsecretが送信された場合、システムは401 Unauthorizedエラーを返すこと
7. **WHERE** 有効なJWTトークンが`Authorization: Bearer <token>`ヘッダーで送信された場合、システムは`/mcp`エンドポイントへのアクセスを許可すること
8. **WHERE** 認証が有効な状態で、トークンなしで`/mcp`にアクセスされた場合、システムは401 Unauthorizedエラーを返すこと
9. **WHEN** システムがHTTPレスポンスを返すとき、システムは設定ファイルの`cors.allowedOrigins`に基づいてCORSヘッダーを設定すること
10. **WHERE** 設定ファイルの検証に失敗した場合、システムは起動時にエラーメッセージを表示して終了すること

> **設定ファイル例** (`~/.sage/remote-config.json`):
> ```json
> {
>   "remote": {
>     "enabled": true,
>     "port": 3000,
>     "host": "0.0.0.0",
>     "auth": {
>       "type": "jwt",
>       "secret": "your-secure-secret-key-at-least-32-chars",
>       "expiresIn": "24h"
>     },
>     "cors": {
>       "allowedOrigins": ["*"]
>     }
>   }
> }
> ```

### 要件16: カレンダーイベント一覧取得

**ユーザーストーリー:** ワークフロー分析を行うユーザーとして、指定した期間のカレンダーイベントを一覧取得したい。作業リズムの把握やスケジュール確認ができるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** `list_calendar_events`ツールが呼び出されたとき、システムは指定された期間内のすべてのイベントを返すこと
2. **WHERE** ツール入力として、システムは`startDate`（必須）、`endDate`（必須）、`calendarName`（オプション）を受け付けること
3. **WHERE** 日付パラメータを処理する際、システムはISO 8601形式（例: `2025-01-15`）を使用すること
4. **WHERE** `calendarName`が指定されている場合、システムは該当カレンダーのイベントのみを返すこと
5. **WHERE** `calendarName`が省略されている場合、システムはすべてのカレンダーからイベントを返すこと
6. **WHERE** 繰り返しイベントが指定期間内に発生する場合、システムは各発生（occurrence）を個別のイベントとして返すこと
7. **WHERE** 終日イベントが存在する場合、システムは`isAllDay: true`フラグを含むイベントを返すこと
8. **WHERE** イベントが複数日にまたがる場合、システムは正確な開始日時と終了日時を返すこと
9. **WHERE** タイムゾーンが指定されていない場合、システムはJST（Asia/Tokyo）をデフォルトタイムゾーンとして使用すること
10. **WHEN** システムがイベントを返すとき、システムは各イベントに`id`、`title`、`start`、`end`、`isAllDay`、`calendar`、`location`（オプション）を含めること
11. **WHERE** カレンダーデータを取得する際、システムは`find_available_slots`と同じEventKit統合を使用すること
12. **WHERE** カレンダーアクセスが利用できない場合、システムは原因を説明する適切なエラーメッセージを返すこと

> **出力例:**
> ```json
> {
>   "events": [
>     {
>       "id": "event-uuid-1",
>       "title": "チームミーティング",
>       "start": "2025-01-15T10:00:00+09:00",
>       "end": "2025-01-15T11:00:00+09:00",
>       "isAllDay": false,
>       "calendar": "Work",
>       "location": "会議室A"
>     },
>     {
>       "id": "event-uuid-2",
>       "title": "休暇",
>       "start": "2025-01-16",
>       "end": "2025-01-17",
>       "isAllDay": true,
>       "calendar": "Personal"
>     }
>   ],
>   "period": {
>     "start": "2025-01-15",
>     "end": "2025-01-20"
>   },
>   "totalEvents": 2
> }
> ```

### 要件17: カレンダーイベントへの返信

**ユーザーストーリー:** 休暇や長期不在を計画するユーザーとして、指定期間のカレンダーイベントに一括で不参加返信したい。年末年始や休暇中の予定を効率的に辞退できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** `respond_to_calendar_event`ツールが呼び出されたとき、システムは指定されたイベントに返信を送ること
2. **WHERE** 単一イベント返信時、システムは`eventId`（必須）、`response`（必須: "accept"/"decline"/"tentative"）、`comment`（オプション）を受け付けること
3. **WHEN** `respond_to_calendar_events_batch`ツールが呼び出されたとき、システムは複数のイベントに一括で返信を送ること
4. **WHERE** バッチ返信時、システムは`eventIds`（必須: 配列）、`response`（必須）、`comment`（オプション）を受け付けること
5. **WHERE** Google Calendarイベント（IDに`@google.com`を含む）の場合、システムはGoogle Calendar APIまたはCalendar.appを経由して返信すること
6. **WHERE** iCloud/ローカルイベントの場合、システムはEventKitを使用して返信を試みること
7. **WHERE** ユーザーがイベントの主催者である場合、システムは警告メッセージを返して処理をスキップすること
8. **WHERE** 繰り返しイベントに返信する場合、システムは指定されたインスタンスのみに返信し、シリーズ全体には影響しないこと
9. **WHERE** 出席者情報のないイベント（個人の予定）の場合、システムは「辞退不可」として処理をスキップすること
10. **WHERE** 読み取り専用カレンダーのイベントの場合、システムは理由を説明する適切なエラーメッセージを返すこと
11. **WHEN** 返信が成功したとき、システムは処理結果のサマリーを返すこと
12. **WHERE** バッチ処理の場合、システムは成功・失敗・スキップの各件数を含むサマリーを返すこと

#### 技術的制約

- **EventKit制約**: `EKParticipant`は読み取り専用であり、直接ステータス変更ができない場合がある
- **Google Calendar**: OAuth2認証が必要（スコープ: `https://www.googleapis.com/auth/calendar.events`）
- **代替手段**: Calendar.appを経由したUI操作、またはcalendar://スキーム

#### エッジケース

| ケース | 動作 |
|--------|------|
| 自分が主催者 | スキップ（警告） |
| 終日イベント | 通常どおり処理 |
| 繰り返しイベント | 単一インスタンスのみ変更 |
| 出席者なし（個人の予定） | スキップ（辞退不可） |
| 読み取り専用カレンダー | エラー |

> **使用例:**
> ```
> ユーザー: "12/30〜1/2までのすべての予定に不参加で返事して"
>
> Sage:
> 1. list_calendar_events(startDate: "2025-12-30", endDate: "2026-01-02")
> 2. 個人の予定（👪、🏠など）をフィルタリング
> 3. respond_to_calendar_events_batch(
>      eventIds: [...フィルタされたビジネスミーティングID...],
>      response: "decline",
>      comment: "年末年始休暇のため"
>    )
> 4. 辞退したイベントのサマリーを返す
> ```

> **出力例（バッチ）:**
> ```json
> {
>   "success": true,
>   "summary": {
>     "total": 15,
>     "declined": 12,
>     "skipped": 3,
>     "failed": 0
>   },
>   "details": {
>     "declined": [
>       {"id": "event-1", "title": "Weekly Standup", "reason": "辞退しました"},
>       {"id": "event-2", "title": "1on1 with Manager", "reason": "辞退しました"}
>     ],
>     "skipped": [
>       {"id": "event-3", "title": "Team Outing", "reason": "主催者のためスキップ"},
>       {"id": "event-4", "title": "個人の予定", "reason": "出席者なしのためスキップ"}
>     ]
>   },
>   "message": "15件中12件のイベントを辞退しました。3件はスキップされました。"
> }
> ```

### 要件18: カレンダーイベントの作成

**ユーザーストーリー:** 効率的に仕事を進めたいユーザーとして、会話の中でカレンダーにイベントを直接作成したい。別のアプリを開かずにスケジュールを管理できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** `create_calendar_event`ツールが呼び出されたとき、システムはカレンダーに新しいイベントを作成すること
2. **WHERE** ツール入力として、システムは`title`（必須）、`startDate`（必須: ISO 8601形式）、`endDate`（必須: ISO 8601形式）を受け付けること
3. **WHERE** オプション入力として、システムは`location`、`notes`、`calendarName`、`alarms`を受け付けること
4. **WHERE** `alarms`パラメータを処理する際、システムは相対時間文字列の配列（例: `["-15m", "-1h", "-1d"]`）を受け付けること
5. **WHERE** `calendarName`が指定されていない場合、システムはデフォルトカレンダーを使用すること
6. **WHERE** イベントを作成する際、システムはEventKit経由でカレンダーアプリケーションに書き込むこと
7. **WHERE** 開始・終了時刻がいずれも00:00:00の場合、システムはイベントを終日イベント（`isAllDay: true`）として作成すること
8. **WHERE** 指定されたカレンダー名が存在しない場合、システムは理由を説明する適切なエラーメッセージを返すこと
9. **WHERE** 指定されたカレンダーが読み取り専用の場合、システムは理由を説明する適切なエラーメッセージを返すこと
10. **WHEN** イベント作成が成功したとき、システムは作成されたイベントのID、タイトル、開始日時、終了日時を返すこと
11. **WHERE** カレンダーアクセス権限がない場合、システムは権限不足を示す適切なエラーメッセージを返すこと

#### 技術的詳細

- **EventKit使用**: AppleScriptObjC経由でEventKitフレームワークを使用
- **日付フォーマット**: ISO 8601形式（例: `2025-01-15T10:00:00+09:00`）
- **アラーム相対時間**: マイナス符号で開始前を表す（`-15m`=15分前、`-1h`=1時間前、`-1d`=1日前）

#### 入力スキーマ

```typescript
interface CreateCalendarEventRequest {
  title: string;                    // 必須: イベントタイトル
  startDate: string;                // 必須: ISO 8601形式の開始日時
  endDate: string;                  // 必須: ISO 8601形式の終了日時
  location?: string;                // オプション: 場所
  notes?: string;                   // オプション: メモ
  calendarName?: string;            // オプション: カレンダー名（未指定時はデフォルト）
  alarms?: string[];                // オプション: アラーム設定（例: ["-15m", "-1h"]）
}
```

#### 出力スキーマ

```typescript
interface CreateCalendarEventResult {
  success: boolean;
  eventId?: string;                 // 作成されたイベントID
  title?: string;                   // イベントタイトル
  startDate?: string;               // 開始日時
  endDate?: string;                 // 終了日時
  calendarName?: string;            // 作成先カレンダー名
  isAllDay?: boolean;               // 終日イベントかどうか
  error?: string;                   // エラーメッセージ
  message: string;                  // 結果メッセージ
}
```

> **使用例:**
> ```
> ユーザー: "来週の火曜日14時から15時まで、田中さんとの1on1をカレンダーに入れて"
>
> Sage:
> create_calendar_event(
>   title: "田中さんとの1on1",
>   startDate: "2025-01-14T14:00:00+09:00",
>   endDate: "2025-01-14T15:00:00+09:00",
>   alarms: ["-15m"]
> )
> ```

> **出力例:**
> ```json
> {
>   "success": true,
>   "eventId": "E1234-5678-ABCD",
>   "title": "田中さんとの1on1",
>   "startDate": "2025-01-14T14:00:00+09:00",
>   "endDate": "2025-01-14T15:00:00+09:00",
>   "calendarName": "Work",
>   "isAllDay": false,
>   "message": "カレンダーに「田中さんとの1on1」を作成しました（2025-01-14 14:00-15:00）"
> }
> ```

### 要件19: カレンダーイベントの削除

**ユーザーストーリー:** カレンダーを整理したいユーザーとして、不要なイベントや重複イベントを会話の中で削除したい。手動でカレンダーアプリを操作せずにスケジュールをクリーンに保てるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** `delete_calendar_event`ツールが呼び出されたとき、システムは指定されたイベントをカレンダーから削除すること
2. **WHERE** ツール入力として、システムは`eventId`（必須）を受け付けること
3. **WHERE** オプション入力として、システムは`calendarName`を受け付けること（指定時は該当カレンダーのみを検索対象とする）
4. **WHERE** `eventId`を処理する際、システムは`list_calendar_events`から取得したフルID形式またはUUID形式のいずれも受け付けること
5. **WHERE** `eventId`がフルID形式（例: `218F62EC-...:CB9F0431-...`）の場合、システムは最後のコロン以降のUUID部分を抽出して使用すること
6. **WHERE** `calendarName`が未指定の場合、システムはすべてのカレンダーからイベントを検索すること
7. **WHERE** 指定されたイベントIDに一致するイベントが見つからない場合、システムは理由を説明する適切なエラーメッセージを返すこと
8. **WHERE** 対象イベントが読み取り専用カレンダーに存在する場合、システムは理由を説明する適切なエラーメッセージを返すこと
9. **WHEN** 削除が成功したとき、システムは削除されたイベントのタイトルとカレンダー名を返すこと
10. **WHEN** `delete_calendar_events_batch`ツールが呼び出されたとき、システムは複数イベントを一括で削除すること
11. **WHERE** バッチ削除の場合、システムは成功・失敗の各件数を含むサマリーを返すこと
12. **WHERE** 削除対象が繰り返しイベントの場合、システムは指定されたインスタンスのみを削除し、シリーズ全体には影響しないこと

#### 技術的詳細

- **EventKit使用**: AppleScriptObjC経由でEventKitフレームワークを使用（`create_calendar_event`と同じ方式）
- **UUID抽出**: フルIDからUUID部分（eventIdentifier）を抽出して使用
- **Google Calendar同期**: EventKitでの削除はiCloud経由でGoogle Calendarに同期される

#### 入力スキーマ

```typescript
// 単一イベント削除
interface DeleteCalendarEventRequest {
  eventId: string;                  // 必須: イベントID（UUIDまたはフルID）
  calendarName?: string;            // オプション: カレンダー名（未指定時は全カレンダー検索）
}

// バッチ削除
interface DeleteCalendarEventsBatchRequest {
  eventIds: string[];               // 必須: イベントIDの配列
  calendarName?: string;            // オプション: カレンダー名
}
```

#### 出力スキーマ

```typescript
// 単一イベント削除の結果
interface DeleteCalendarEventResult {
  success: boolean;
  eventId: string;
  title?: string;                   // 削除されたイベントのタイトル
  calendarName?: string;            // 削除元カレンダー名
  error?: string;                   // エラーメッセージ
  message: string;                  // 結果メッセージ
}

// バッチ削除の結果
interface DeleteCalendarEventsBatchResult {
  success: boolean;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    eventId: string;
    title?: string;
    success: boolean;
    error?: string;
  }>;
  message: string;                  // 例: "10件中10件のイベントを削除しました"
}
```

#### 使用例

> **単一削除:**
> ```
> User: 明日の「Project CLEAR kickoff」ミーティングを削除して
>
> Sage:
> delete_calendar_event(
>   eventId: "CB9F0431-7EA1-4122-83A6-240AE1339429"
> )
> ```

> **出力例:**
> ```json
> {
>   "success": true,
>   "eventId": "CB9F0431-7EA1-4122-83A6-240AE1339429",
>   "title": "Project CLEAR kickoff",
>   "calendarName": "sh1@mercari.com",
>   "message": "イベント「Project CLEAR kickoff」を削除しました"
> }
> ```

> **バッチ削除:**
> ```
> User: 重複している10件のイベントをすべて削除して
>
> Sage:
> delete_calendar_events_batch(
>   eventIds: ["DED889F3-...", "30C86C85-...", ...]
> )
> ```

> **出力例:**
> ```json
> {
>   "success": true,
>   "summary": { "total": 10, "succeeded": 10, "failed": 0 },
>   "results": [...],
>   "message": "10件中10件のイベントを削除しました"
> }
> ```

#### 将来の拡張（現時点ではスコープ外）

- `update_calendar_event` - 既存イベントの更新
- `create_recurring_event` - 繰り返しルール付きイベント
- `deleteAllOccurrences` - 繰り返しイベントのシリーズ全体削除
- 参加者管理（招待状の送信）

### 要件20: HTTP Transport対応

**ユーザーストーリー:** Claude.aiからRemote MCPサーバーに接続するユーザーとして、HTTP経由でMCPリクエストを送信したい。クライアント側の実装に依存せず安定した接続を確立できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** `/mcp`エンドポイントがPOSTリクエストを受け付けたとき、システムはJSON-RPCレスポンスを返すこと
2. **WHERE** POSTリクエストに応答する際、システムはContent-Typeヘッダーを`application/json`に設定すること
3. **WHERE** POSTリクエストに応答する際、システムは適切なCORSヘッダー（`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`）を含めること
4. **WHERE** OPTIONSリクエスト（CORS preflight）を受け付けた場合、システムは適切なCORSレスポンスを返すこと
5. **WHERE** 設定ファイルで`authEnabled: false`が指定されている場合、システムは認証なしでPOST `/mcp`へのアクセスを許可すること
6. **WHERE** 認証が有効な場合、システムはAuthorizationヘッダーのBearerトークンを検証すること

#### 技術的詳細

**リクエスト/レスポンス形式:**
- Content-Type: `application/json`
- JSON-RPC 2.0形式

**レスポンスヘッダー:**
```
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

> **背景:** Remote MCPサーバーはHTTP POST経由でJSON-RPCリクエストを受け付けます。認証が有効な場合はJWT Bearerトークンが必要です。

### 要件32: 勤務リズム（Working Cadence）の取得

**ユーザーストーリー:** 効果的にタスクをスケジュールしたいユーザーとして、自分の勤務リズム（Deep Work日、ミーティング集中日、勤務時間など）を確認したい。最適な時間帯にタスクを配置できるようにするため。

#### 受け入れ基準（EARS記法）

1. **WHEN** `get_working_cadence`ツールが呼び出されたとき、システムは設定ファイルから勤務リズム情報を読み込んで返すこと
2. **WHEN** システムが勤務リズム情報を返すとき、システムは勤務時間（開始時刻、終了時刻、総勤務時間）を含めること
3. **WHEN** システムが勤務リズム情報を返すとき、システムはDeep Work日（集中作業に適した曜日）のリストを含めること
4. **WHEN** システムが勤務リズム情報を返すとき、システムはミーティング集中日のリストを含めること
5. **WHEN** システムが勤務リズム情報を返すとき、システムはDeep Workブロック（特定の時間帯の集中作業枠）を含めること
6. **WHERE** オプションパラメータ`dayOfWeek`が指定されている場合、システムはその曜日の詳細情報と推奨事項を返すこと
7. **WHERE** オプションパラメータ`date`が指定されている場合、システムはその日付から曜日を判定して詳細情報を返すこと
8. **WHEN** システムが勤務リズム情報を返すとき、システムはスケジューリング推奨事項（複雑なタスクの最適日、ミーティング推奨日など）を含めること
9. **WHERE** 設定ファイルが存在しない場合、システムはデフォルト値（標準的な勤務時間と曜日設定）を使用すること
10. **WHERE** 週次レビュー設定が有効な場合、システムはその情報（曜日、時刻、有効フラグ）も返すこと

#### 入力スキーマ

```typescript
interface GetWorkingCadenceRequest {
  dayOfWeek?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  date?: string; // ISO 8601形式 (例: "2025-01-15")
}
```

#### 出力スキーマ

```typescript
interface WorkingCadenceResult {
  success: boolean;
  user: { name: string; timezone: string; };
  workingHours: { start: string; end: string; totalMinutes: number; };
  weeklyPattern: {
    deepWorkDays: string[];
    meetingHeavyDays: string[];
    normalDays: string[];
  };
  deepWorkBlocks: Array<{
    day: string;
    startHour: number;
    endHour: number;
    description: string;
  }>;
  weeklyReview?: { enabled: boolean; day: string; time: string; };
  specificDay?: {
    date?: string;
    dayOfWeek: string;
    dayType: 'deep-work' | 'meeting-heavy' | 'normal';
    recommendations: string[];
  };
  recommendations: Array<{
    type: 'deep-work' | 'meeting' | 'quick-task' | 'review';
    recommendation: string;
    bestDays: string[];
    reason: string;
  }>;
  summary: string;
}
```

> **使用例:**
> ```
> ユーザー: "私のworking cadenceを教えて"
>
> Sage:
> get_working_cadence({})
>
> 勤務時間: 09:00-18:00 (9時間)
> Deep Work日: 月・水・金
> ミーティング集中日: 火・木
> 週次レビュー: 金曜 17:00
>
> 推奨事項:
> - 複雑なタスクは月・水・金の午前中にスケジュールしてください
> - ミーティングは火・木に集中させることを推奨します
> ```

### 要件21-31: OAuth 2.1 認証

> **詳細仕様:** `.kiro/specs/claude-task-manager/oauth-spec.md` を参照

**ユーザーストーリー:** Claude iOS/iPadOS/Webからsageに接続するユーザーとして、OAuth 2.1による安全な認証を行いたい。Claudeアプリの標準的な認証フローで簡単にアクセスできるようにするため。

#### 概要

OAuth 2.1認証により、Claude iOS/iPadOS/Webアプリケーションからsageへのセキュアなアクセスが可能になります。

#### 主要要件

| 要件 | 説明 | 優先度 |
|------|------|--------|
| 21 | OAuth 2.1 Authorization Code + PKCE (S256) | MUST |
| 22 | Protected Resource Metadata (RFC 9728) | MUST |
| 23 | Authorization Server Metadata (RFC 8414) | MUST |
| 24 | Dynamic Client Registration (RFC 7591) | SHOULD |
| 25 | Authorization Endpoint | MUST |
| 26 | Token Endpoint | MUST |
| 27 | Token Validation | MUST |
| 28 | Consent UI | MUST |
| 29 | User Authentication | MUST |
| 30 | Security Requirements | MUST |
| 31 | Claude固有の互換性 | MUST |

#### Claude互換性要件

1. コールバックURL `https://claude.ai/api/mcp/auth_callback` を許可すること
2. 将来のURL `https://claude.com/api/mcp/auth_callback` も許可すること

#### 参照規格

- OAuth 2.1 (draft-ietf-oauth-v2-1-13)
- RFC 8414 (Authorization Server Metadata)
- RFC 7591 (Dynamic Client Registration)
- RFC 9728 (Protected Resource Metadata)
- RFC 8707 (Resource Indicators)
- RFC 7636 (PKCE)
