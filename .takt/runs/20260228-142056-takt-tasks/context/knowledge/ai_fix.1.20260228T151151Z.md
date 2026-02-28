# フロントエンド専門知識

## フロントエンドの層構造

依存方向は一方向。逆方向の依存は禁止。

```
app/routes/ → features/ → shared/
```

| 層 | 責務 | ルール |
|---|------|--------|
| `app/routes/` | ルート定義のみ | UIロジックを持たない。feature の View を呼ぶだけ |
| `features/` | 機能単位の自己完結モジュール | 他の feature を直接参照しない |
| `shared/` | 全 feature 横断の共有コード | feature に依存しない |

ルートファイルは薄いラッパーに徹する。

```tsx
// CORRECT - ルートは薄い
// app/routes/schedule-management.tsx
export default function ScheduleManagementRoute() {
  return <ScheduleManagementView />
}

// WRONG - ルートにロジックを書く
export default function ScheduleManagementRoute() {
  const [filter, setFilter] = useState('all')
  const { data } = useListSchedules({ filter })
  return <ScheduleTable data={data} onFilterChange={setFilter} />
}
```

View コンポーネント（`features/*/components/*-view.tsx`）がデータ取得・状態管理を担当する。

```
ルート（route） → View（データ取得・状態管理） → 子コンポーネント（表示）
```

## コンポーネント設計

1ファイルにベタ書きしない。必ずコンポーネント分割する。

分離が必須なケース:
- 独自のstateを持つ → 必ず分離
- 50行超のJSX → 分離
- 再利用可能 → 分離
- 責務が複数 → 分離
- ページ内の独立したセクション → 分離

| 基準 | 判定 |
|------|------|
| 1コンポーネント200行超 | 分割を検討 |
| 1コンポーネント300行超 | REJECT |
| 表示とロジックが混在 | 分離を検討 |
| Props drilling（3階層以上） | 状態管理の導入を検討 |
| 複数の責務を持つコンポーネント | REJECT |

良いコンポーネント:
- 単一責務: 1つのことをうまくやる
- 自己完結: 必要な依存が明確
- テスト可能: 副作用が分離されている

コンポーネント分類:

| 種類 | 責務 | 例 |
|------|------|-----|
| Container | データ取得・状態管理 | `UserListContainer` |
| Presentational | 表示のみ | `UserCard` |
| Layout | 配置・構造 | `PageLayout`, `Grid` |
| Utility | 共通機能 | `ErrorBoundary`, `Portal` |

### UIプリミティブの設計原則

shared/components/ui/ に配置するHTML要素ラッパーの設計ルール:

- `forwardRef` で ref を転送する（外部からの制御を可能にする）
- `className` を受け取り、外からスタイル拡張可能にする
- ネイティブ props をスプレッドで透過する（`...props`）
- variants は別ファイルに分離する（`button.variants.ts`）

```tsx
// CORRECT - プリミティブの設計
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </button>
    )
  }
)

// WRONG - refもclassNameも透過しない閉じたコンポーネント
export const Button = ({ label, onClick }: { label: string; onClick: () => void }) => {
  return <button className="fixed-style" onClick={onClick}>{label}</button>
}
```

ディレクトリ構成:
```
features/{feature-name}/
├── components/
│   ├── {feature}-view.tsx      # メインビュー（子を組み合わせる）
│   ├── {sub-component}.tsx     # サブコンポーネント
│   └── index.ts
├── hooks/
├── types.ts
└── index.ts
```

## 状態管理

子コンポーネントは自身で状態を変更しない。イベントを親にバブリングし、親が状態を操作する。

```tsx
// 子が自分で状態を変更（NG）
const ChildBad = ({ initialValue }: { initialValue: string }) => {
  const [value, setValue] = useState(initialValue)
  return <input value={value} onChange={e => setValue(e.target.value)} />
}

// 親が状態を管理、子はコールバックで通知（OK）
const ChildGood = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  return <input value={value} onChange={e => onChange(e.target.value)} />
}

const Parent = () => {
  const [value, setValue] = useState('')
  return <ChildGood value={value} onChange={setValue} />
}
```

例外（子がローカルstate持ってOK）:
- UI専用の一時状態（ホバー、フォーカス、アニメーション）
- 親に伝える必要がない完全にローカルな状態

| 基準 | 判定 |
|------|------|
| 不要なグローバル状態 | ローカル化を検討 |
| 同じ状態が複数箇所で管理 | 正規化が必要 |
| 子から親への状態変更（逆方向データフロー） | REJECT |
| APIレスポンスをそのまま状態に | 正規化を検討 |
| useEffectの依存配列が不適切 | REJECT |

状態配置の判断基準:

| 状態の性質 | 推奨配置 |
|-----------|---------|
| UIの一時的な状態（モーダル開閉等） | ローカル（useState） |
| フォームの入力値 | ローカル or フォームライブラリ |
| 複数コンポーネントで共有 | Context or 状態管理ライブラリ |
| サーバーデータのキャッシュ | TanStack Query等のデータフェッチライブラリ |

## APIクライアント生成

プロジェクトがAPIクライアント生成ツール（Orval、openapi-typescript等）を採用している場合、新規APIエンドポイントとの接続には必ず生成されたクライアントを使用する。

| パターン | 判定 |
|---------|------|
| 生成ツールが存在するのに axiosInstance/fetch を直接使用 | REJECT |
| 生成ツールの設定を確認せずにAPIフックを手書き | REJECT |
| 生成ツールが存在しないプロジェクトで直接呼び出し | OK |

確認手順:
1. プロジェクトにAPI生成設定があるか確認（orval.config.ts, openapi-generator 等）
2. 既存の生成済みクライアントの使用パターンを確認
3. 新規エンドポイントは生成パイプラインに追加し、生成されたフックを使う

## データ取得

API呼び出しはルート（View）コンポーネントで行い、子コンポーネントにはpropsで渡す。

```tsx
// CORRECT - ルートでデータ取得、子に渡す
const OrderDetailView = () => {
  const { data: order, isLoading, error } = useGetOrder(orderId)
  const { data: items } = useListOrderItems(orderId)

  if (isLoading) return <Skeleton />
  if (error) return <ErrorDisplay error={error} />

  return (
    <OrderSummary
      order={order}
      items={items}
      onItemSelect={handleItemSelect}
    />
  )
}

// WRONG - 子コンポーネントが自分でデータ取得
const OrderSummary = ({ orderId }) => {
  const { data: order } = useGetOrder(orderId)
  // ...
}
```

UIの状態変更でパラメータが変わる場合（週切り替え、フィルタ等）:

状態もViewレベルで管理し、コンポーネントにはコールバックを渡す。

```tsx
// CORRECT - 状態もViewで管理
const ScheduleView = () => {
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date()))
  const { data } = useListSchedules({
    from: format(currentWeek, 'yyyy-MM-dd'),
    to: format(endOfWeek(currentWeek), 'yyyy-MM-dd'),
  })

  return (
    <WeeklyCalendar
      schedules={data?.items ?? []}
      currentWeek={currentWeek}
      onWeekChange={setCurrentWeek}
    />
  )
}

// WRONG - コンポーネント内で状態管理+データ取得
const WeeklyCalendar = ({ facilityId }) => {
  const [currentWeek, setCurrentWeek] = useState(...)
  const { data } = useListSchedules({ facilityId, from, to })
  // ...
}
```

例外（コンポーネント内フェッチが許容されるケース）:

| ケース | 理由 |
|--------|------|
| 独立ウィジェット | どのページにも置ける自己完結型コンポーネント |
| 無限スクロール | スクロール位置というUI内部状態に依存 |
| 検索オートコンプリート | 入力値に依存したリアルタイム検索 |
| リアルタイム更新 | WebSocket/Pollingでの自動更新 |
| モーダル内の詳細取得 | 開いたときだけ追加データを取得 |

### 独立ウィジェットパターン

WordPress のサイドバーウィジェットのように、どのページにも「置くだけ」で動くコンポーネント。親のデータフローに参加しない自己完結型。

該当する例:
- 通知バッジ・通知ベル（未読数を自分で取得）
- ログインユーザー情報表示（ヘッダーのアバター等）
- お知らせバナー
- 天気・為替など外部データ表示
- アクティビティフィード（サイドバー）

```tsx
// OK - 独立ウィジェット。どのページに置いても自分で動く
const NotificationBell = () => {
  const { data } = useNotificationCount({ refetchInterval: 30000 })
  return (
    <button aria-label="通知">
      <Bell />
      {data?.unreadCount > 0 && <span className="badge">{data.unreadCount}</span>}
    </button>
  )
}

// OK - ヘッダーに常駐するユーザーメニュー
const UserMenu = () => {
  const { data: user } = useCurrentUser()
  return <Avatar name={user?.name} />
}
```

ウィジェットと判定する条件（すべて満たすこと）:
- 親のデータと**完全に無関係**（親から props でデータを受け取る必要がない）
- 親の状態に**影響を与えない**（結果を親にバブリングしない）
- **どのページに置いても同じ動作**をする（ページ固有のコンテキストに依存しない）

1つでも満たさない場合は View でデータ取得し、props で渡す。

```tsx
// WRONG - ウィジェットに見えるが、orderId という親のコンテキストに依存
const OrderStatusWidget = ({ orderId }: { orderId: string }) => {
  const { data } = useGetOrder(orderId)
  return <StatusBadge status={data?.status} />
}

// CORRECT - 親のデータフローに参加するならpropsで受け取る
const OrderStatusWidget = ({ status }: { status: OrderStatus }) => {
  return <StatusBadge status={status} />
}
```

判断基準: 「親が管理する意味がない / 親に影響を与えない」ケースのみ許容。

| 基準 | 判定 |
|------|------|
| コンポーネント内で直接fetch | Container層に分離 |
| エラーハンドリングなし | REJECT |
| ローディング状態の未処理 | REJECT |
| キャンセル処理なし | 警告 |
| N+1クエリ的なフェッチ | REJECT |

## 共有コンポーネントと抽象化

### カテゴリ分類

shared コンポーネントは責務別にサブディレクトリで分類する。

```
shared/components/
├── ui/              # HTMLプリミティブのラッパー（Button, Card, Badge, Dialog）
├── form/            # フォーム入力要素（TextInput, Select, Checkbox）
├── layout/          # ページ構造・ルート保護（Layout, ProtectedRoute）
├── navigation/      # ナビゲーション（Tabs, BackLink, SidebarItem）
├── data-display/    # データ表示（Table, DetailField, Calendar）
├── feedback/        # 状態フィードバック（LoadingState, ErrorState）
├── domain/          # ドメイン固有だが横断的（StatusBadge, CategoryBadge）
└── index.ts         # barrel export
```

| カテゴリ | 配置基準 |
|---------|---------|
| ui/ | HTML要素を薄くラップ。ドメイン知識を持たない |
| form/ | ラベル・エラー・必須マークを統合したフォーム部品 |
| layout/ | ページ全体の骨格。認証・ロール制御を含む |
| domain/ | 特定ドメインに依存するが、複数 feature で共有 |

ui/ と domain/ の判断基準: ドメイン用語がコンポーネント名やpropsに含まれるなら domain/。

### 共有化の基準

同じパターンのUIは共有コンポーネント化する。インラインスタイルのコピペは禁止。

```tsx
// WRONG - インラインスタイルのコピペ
<button className="p-2 text-[var(--text-secondary)] hover:...">
  <X className="w-5 h-5" />
</button>

// CORRECT - 共有コンポーネント使用
<IconButton onClick={onClose} aria-label="閉じる">
  <X className="w-5 h-5" />
</IconButton>
```

共有コンポーネント化すべきパターン:
- アイコンボタン（閉じる、編集、削除等）
- ローディング/エラー表示
- ステータスバッジ
- タブ切り替え
- ラベル+値の表示（詳細画面）
- 検索入力
- カラー凡例

過度な汎用化を避ける:

```tsx
// WRONG - IconButtonに無理やりステッパー用バリアントを追加
export const iconButtonVariants = cva('...', {
  variants: {
    variant: {
      default: '...',
      outlined: '...',  // ステッパー専用、他で使わない
    },
    size: {
      medium: 'p-2',
      stepper: 'w-8 h-8',  // outlinedとセットでしか使わない
    },
  },
})

// CORRECT - 用途別に専用コンポーネント
export function StepperButton(props) {
  return (
    <button className="w-8 h-8 rounded-full border ..." {...props}>
      <Plus className="w-4 h-4" />
    </button>
  )
}
```

別コンポーネントにすべきサイン:
- 「このvariantはこのsizeとセット」のような暗黙の制約がある
- 追加したvariantが元のコンポーネントの用途と明らかに違う
- 使う側のprops指定が複雑になる

### テーマ差分とデザイントークン

同じ機能コンポーネントを再利用しつつ見た目だけ変える場合は、デザイントークン + テーマスコープで管理する。

原則:
- 色・余白・角丸・影・タイポをトークン（CSS Variables）として定義する
- 画面/ロール別の差分はテーマスコープ（例: `.consumer-theme`, `.admin-theme`）で上書きする
- コンポーネント内に16進カラー値（`#xxxxxx`）を直書きしない
- ロジック差分（API・状態管理）と見た目差分（トークン）を混在させない

```css
/* tokens.css */
:root {
  --color-bg-page: #f3f4f6;
  --color-surface: #ffffff;
  --color-text-primary: #1f2937;
  --color-border: #d1d5db;
  --color-accent: #2563eb;
}

.consumer-theme {
  --color-bg-page: #f7f8fa;
  --color-accent: #4daca1;
}
```

```tsx
// same component, different look by scope
<div className="consumer-theme">
  <Button variant="primary">Submit</Button>
</div>
```

運用ルール:
- 共通UI（Button/Card/Input/Tabs）はトークン参照のみで実装する
- feature側はテーマ共通クラス（例: `surface`, `title`, `chip`）を利用し、装飾ロジックを重複させない
- 追加テーマ実装時は「トークン追加 → スコープ上書き → 既存コンポーネント流用」の順で進める

レビュー観点:
- 直書き色・直書き余白のコピペがないか
- 同一UIパターンがテーマごとに別コンポーネント化されていないか
- 見た目変更のためにデータ取得/状態管理が改変されていないか

NG例:
- 見た目差分のために `ButtonConsumer`, `ButtonAdmin` を乱立
- featureコンポーネントごとに色を直書き
- テーマ切り替えのたびにAPIレスポンス整形ロジックを変更

## 抽象化レベルの評価

### 条件分岐の肥大化検出

| パターン | 判定 |
|---------|------|
| 同じ条件分岐が3箇所以上 | 共通コンポーネントに抽出 → REJECT |
| propsによる分岐が5種類以上 | コンポーネント分割を検討 |
| render内の三項演算子のネスト | 早期リターンまたはコンポーネント分離 → REJECT |
| 型による分岐レンダリング | ポリモーフィックコンポーネントを検討 |

### 抽象度の不一致検出

| パターン | 問題 | 修正案 |
|---------|------|--------|
| データ取得ロジックがJSXに混在 | 読みにくい | カスタムフックに抽出 |
| ビジネスロジックがコンポーネントに混在 | 責務違反 | hooks/utilsに分離 |
| スタイル計算ロジックが散在 | 保守困難 | ユーティリティ関数に抽出 |
| 同じ変換処理が複数箇所に | DRY違反 | 共通関数に抽出 |

良い抽象化の例:

```tsx
// 条件分岐が肥大化
function UserBadge({ user }) {
  if (user.role === 'admin') {
    return <span className="bg-red-500">管理者</span>
  } else if (user.role === 'moderator') {
    return <span className="bg-yellow-500">モデレーター</span>
  } else if (user.role === 'premium') {
    return <span className="bg-purple-500">プレミアム</span>
  } else {
    return <span className="bg-gray-500">一般</span>
  }
}

// Mapで抽象化
const ROLE_CONFIG = {
  admin: { label: '管理者', className: 'bg-red-500' },
  moderator: { label: 'モデレーター', className: 'bg-yellow-500' },
  premium: { label: 'プレミアム', className: 'bg-purple-500' },
  default: { label: '一般', className: 'bg-gray-500' },
}

function UserBadge({ user }) {
  const config = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.default
  return <span className={config.className}>{config.label}</span>
}
```

```tsx
// 抽象度が混在
function OrderList() {
  const [orders, setOrders] = useState([])
  useEffect(() => {
    fetch('/api/orders')
      .then(res => res.json())
      .then(data => setOrders(data))
  }, [])

  return orders.map(order => (
    <div>{order.total.toLocaleString()}円</div>
  ))
}

// 抽象度を揃える
function OrderList() {
  const { data: orders } = useOrders()  // データ取得を隠蔽

  return orders.map(order => (
    <OrderItem key={order.id} order={order} />
  ))
}
```

## フロントエンドとバックエンドの責務分離

### 表示形式の責務

バックエンドは「データ」を返し、フロントエンドが「表示形式」に変換する。

```tsx
// フロントエンド: 表示形式に変換
export function formatPrice(amount: number): string {
  return `¥${amount.toLocaleString()}`
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy年M月d日')
}
```

| 基準 | 判定 |
|------|------|
| バックエンドが表示用文字列を返している | 設計見直しを提案 |
| 同じフォーマット処理が複数箇所にコピペ | ユーティリティ関数に統一 |
| コンポーネント内でインラインフォーマット | 関数に抽出 |

### ドメインロジックの配置（SmartUI排除）

ドメインロジック（ビジネスルール）はバックエンドに配置。フロントエンドは状態の表示・編集のみ。

ドメインロジックとは:
- 集約のビジネスルール（在庫判定、価格計算、ステータス遷移）
- バリデーション（業務制約の検証）
- 不変条件の保証

フロントエンドの責務:
- サーバーから受け取った状態を表示
- ユーザー入力を収集し、コマンドとしてバックエンドに送信
- UI専用の一時状態管理（フォーカス、ホバー、モーダル開閉）
- 表示形式の変換（フォーマット、ソート、フィルタ）

| 基準 | 判定 |
|------|------|
| フロントエンドで価格計算・在庫判定 | バックエンドに移動 → REJECT |
| フロントエンドでステータス遷移ルール | バックエンドに移動 → REJECT |
| フロントエンドでビジネスバリデーション | バックエンドに移動 → REJECT |
| サーバー側で計算可能な値をフロントで再計算 | 冗長 → REJECT |

良い例 vs 悪い例:

```tsx
// BAD - フロントエンドでビジネスルール
function OrderForm({ order }: { order: Order }) {
  const totalPrice = order.items.reduce((sum, item) =>
    sum + item.price * item.quantity, 0
  )
  const canCheckout = totalPrice >= 1000 && order.items.every(i => i.stock > 0)

  return <button disabled={!canCheckout}>注文確定</button>
}

// GOOD - バックエンドから受け取った状態を表示
function OrderForm({ order }: { order: Order }) {
  // totalPrice, canCheckout はサーバーから受け取る
  return (
    <>
      <div>{formatPrice(order.totalPrice)}</div>
      <button disabled={!order.canCheckout}>注文確定</button>
    </>
  )
}
```

```tsx
// BAD - フロントエンドでステータス遷移判定
function TaskCard({ task }: { task: Task }) {
  const canStart = task.status === 'pending' && task.assignee !== null
  const canComplete = task.status === 'in_progress' && /* 複雑な条件... */

  return (
    <>
      <button onClick={startTask} disabled={!canStart}>開始</button>
      <button onClick={completeTask} disabled={!canComplete}>完了</button>
    </>
  )
}

// GOOD - サーバーが許可するアクションを返す
function TaskCard({ task }: { task: Task }) {
  // task.allowedActions = ['start', 'cancel'] など、サーバーが計算
  const canStart = task.allowedActions.includes('start')
  const canComplete = task.allowedActions.includes('complete')

  return (
    <>
      <button onClick={startTask} disabled={!canStart}>開始</button>
      <button onClick={completeTask} disabled={!canComplete}>完了</button>
    </>
  )
}
```

例外（フロントエンドにロジックを置いてもOK）:

| ケース | 理由 |
|--------|------|
| UI専用バリデーション | 「必須入力」「文字数制限」等のUXフィードバック（サーバー側でも検証必須） |
| クライアント側フィルタ/ソート | サーバーから受け取ったリストの表示順序変更 |
| 表示条件の分岐 | 「ログイン済みなら詳細表示」等のUI制御 |
| リアルタイムフィードバック | 入力中のプレビュー表示 |

判断基準: 「この計算結果がサーバーとズレたら業務が壊れるか?」
- YES → バックエンドに配置（ドメインロジック）
- NO → フロントエンドでもOK（表示ロジック）

## 横断的関心事の処理層

横断的関心事は適切な層で処理する。コンポーネント内に散在させない。

| 関心事 | 処理層 | パターン |
|-------|--------|---------|
| 認証トークン付与 | APIクライアント層 | リクエストインターセプタ |
| 認証エラー（401/403） | APIクライアント層 | レスポンスインターセプタ |
| ルート保護 | レイアウト層 | ProtectedRoute + Outlet |
| ロール別振り分け | レイアウト層 | ユーザー種別による分岐 |
| ローディング/エラー表示 | View（Container）層 | 早期リターン |

```tsx
// CORRECT - 横断的関心事はインターセプタ層で処理
// api/axios-instance.ts
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// WRONG - 各コンポーネントで個別にトークンを付与
const MyComponent = () => {
  const token = localStorage.getItem('auth_token')
  const { data } = useQuery({
    queryFn: () => fetch('/api/data', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  })
}
```

```tsx
// CORRECT - ルート保護はレイアウト層で
// shared/components/layout/protected-route.tsx
function ProtectedRoute() {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Layout><Outlet /></Layout>
}

// routes でラップ
<Route element={<ProtectedRoute />}>
  <Route path="/dashboard" element={<DashboardView />} />
</Route>

// WRONG - 各ページで個別に認証チェック
function DashboardView() {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" />
  return <div>...</div>
}
```

## パフォーマンス

| 基準 | 判定 |
|------|------|
| 不要な再レンダリング | 最適化が必要 |
| 大きなリストの仮想化なし | 警告 |
| 画像の最適化なし | 警告 |
| バンドルに未使用コード | tree-shakingを確認 |
| メモ化の過剰使用 | 本当に必要か確認 |

最適化チェックリスト:
- `React.memo` / `useMemo` / `useCallback` は適切か
- 大きなリストは仮想スクロール対応か
- Code Splittingは適切か
- 画像はlazy loadingされているか

アンチパターン:

```tsx
// レンダリングごとに新しいオブジェクト
<Child style={{ color: 'red' }} />

// 定数化 or useMemo
const style = useMemo(() => ({ color: 'red' }), []);
<Child style={style} />
```

## アクセシビリティ

| 基準 | 判定 |
|------|------|
| インタラクティブ要素にキーボード対応なし | REJECT |
| 画像にalt属性なし | REJECT |
| フォーム要素にlabelなし | REJECT |
| 色だけで情報を伝達 | REJECT |
| フォーカス管理の欠如（モーダル等） | REJECT |

チェックリスト:
- セマンティックHTMLを使用しているか
- ARIA属性は適切か（過剰でないか）
- キーボードナビゲーション可能か
- スクリーンリーダーで意味が通じるか
- カラーコントラストは十分か

## TypeScript/型安全性

| 基準 | 判定 |
|------|------|
| `any` 型の使用 | REJECT |
| 型アサーション（as）の乱用 | 要検討 |
| Props型定義なし | REJECT |
| イベントハンドラの型が不適切 | 修正が必要 |

## フロントエンドセキュリティ

| 基準 | 判定 |
|------|------|
| dangerouslySetInnerHTML使用 | XSSリスクを確認 |
| ユーザー入力の未サニタイズ | REJECT |
| 機密情報のフロントエンド保存 | REJECT |
| CSRFトークンの未使用 | 要確認 |

## テスタビリティ

| 基準 | 判定 |
|------|------|
| data-testid等の未付与 | 警告 |
| テスト困難な構造 | 分離を検討 |
| ビジネスロジックのUIへの埋め込み | REJECT |

## アンチパターン検出

以下を見つけたら REJECT:

| アンチパターン | 問題 |
|---------------|------|
| God Component | 1コンポーネントに全機能が集中 |
| Prop Drilling | 深いPropsバケツリレー |
| Inline Styles乱用 | 保守性低下 |
| useEffect地獄 | 依存関係が複雑すぎる |
| Premature Optimization | 不要なメモ化 |
| Magic Strings | ハードコードされた文字列 |
| Hidden Dependencies | 子コンポーネントの隠れたAPI呼び出し |
| Over-generalization | 無理やり汎用化したコンポーネント |


---

# バックエンド専門知識

## ヘキサゴナルアーキテクチャ（ポートとアダプター）

依存方向は外側から内側へ。逆方向の依存は禁止。

```
adapter（外部） → application（ユースケース） → domain（ビジネスロジック）
```

ディレクトリ構成:

```
{domain-name}/
├── domain/                  # ドメイン層（フレームワーク非依存）
│   ├── model/
│   │   └── aggregate/       # 集約ルート、値オブジェクト
│   └── service/             # ドメインサービス
├── application/             # アプリケーション層（ユースケース）
│   ├── usecase/             # オーケストレーション
│   └── query/               # クエリハンドラ
├── adapter/                 # アダプター層（外部接続）
│   ├── inbound/             # 入力アダプター
│   │   └── rest/            # REST Controller, Request/Response DTO
│   └── outbound/            # 出力アダプター
│       └── persistence/     # Entity, Repository実装
└── api/                     # 公開インターフェース（他ドメインから参照可能）
    └── events/              # ドメインイベント
```

各層の責務:

| 層 | 責務 | 依存してよいもの | 依存してはいけないもの |
|----|------|----------------|---------------------|
| domain | ビジネスロジック、不変条件 | 標準ライブラリのみ | フレームワーク、DB、外部API |
| application | ユースケースのオーケストレーション | domain | adapter の具体実装 |
| adapter/inbound | HTTPリクエスト受信、DTO変換 | application, domain | outbound adapter |
| adapter/outbound | DB永続化、外部API呼び出し | domain（インターフェース） | application |

```kotlin
// CORRECT - ドメイン層はフレームワーク非依存
data class Order(val orderId: String, val status: OrderStatus) {
    fun confirm(confirmedBy: String): OrderConfirmedEvent {
        require(status == OrderStatus.PENDING)
        return OrderConfirmedEvent(orderId, confirmedBy)
    }
}

// WRONG - ドメイン層にSpringアノテーション
@Entity
data class Order(
    @Id val orderId: String,
    @Enumerated(EnumType.STRING) val status: OrderStatus
) {
    fun confirm(confirmedBy: String) { ... }
}
```

| 基準 | 判定 |
|------|------|
| ドメイン層にフレームワーク依存（@Entity, @Component等） | REJECT |
| Controller から Repository を直接参照 | REJECT。UseCase層を経由 |
| ドメイン層から外向きの依存（DB, HTTP等） | REJECT |
| adapter 間の直接依存（inbound → outbound） | REJECT |

## API層設計（Controller）

Controller は薄く保つ。リクエスト受信 → UseCase委譲 → レスポンス返却のみ。

```kotlin
// CORRECT - Controller は薄い
@RestController
@RequestMapping("/api/orders")
class OrdersController(
    private val placeOrderUseCase: PlaceOrderUseCase,
    private val queryGateway: QueryGateway
) {
    // Command: 状態変更
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun post(@Valid @RequestBody request: OrderPostRequest): OrderPostResponse {
        val output = placeOrderUseCase.execute(request.toInput())
        return OrderPostResponse(output.orderId)
    }

    // Query: 参照
    @GetMapping("/{id}")
    fun get(@PathVariable id: String): ResponseEntity<OrderGetResponse> {
        val detail = queryGateway.query(FindOrderQuery(id), OrderDetail::class.java).join()
            ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(OrderGetResponse.from(detail))
    }
}

// WRONG - Controller にビジネスロジック
@PostMapping
fun post(@RequestBody request: OrderPostRequest): ResponseEntity<Any> {
    // バリデーション、在庫チェック、計算... Controller に書いてはいけない
    val stock = inventoryRepository.findByProductId(request.productId)
    if (stock.quantity < request.quantity) {
        return ResponseEntity.badRequest().body("在庫不足")
    }
    val total = request.quantity * request.unitPrice * 1.1  // 税計算
    orderRepository.save(OrderEntity(...))
    return ResponseEntity.ok(...)
}
```

### Request/Response DTO 設計

Request と Response は別の型として定義する。ドメインモデルをそのままAPIに露出しない。

```kotlin
// Request: バリデーションアノテーション + init ブロック
data class OrderPostRequest(
    @field:NotBlank val customerId: String,
    @field:NotNull val items: List<OrderItemRequest>
) {
    init {
        require(items.isNotEmpty()) { "注文には1つ以上の商品が必要です" }
    }

    fun toInput() = PlaceOrderInput(customerId = customerId, items = items.map { it.toItem() })
}

// Response: ファクトリメソッド from() で変換
data class OrderGetResponse(
    val orderId: String,
    val status: String,
    val customerName: String
) {
    companion object {
        fun from(detail: OrderDetail) = OrderGetResponse(
            orderId = detail.orderId,
            status = detail.status.name,
            customerName = detail.customerName
        )
    }
}
```

| 基準 | 判定 |
|------|------|
| ドメインモデルをそのままレスポンスに返す | REJECT |
| Request DTOにビジネスロジック | REJECT。バリデーションのみ許容 |
| Response DTOにドメインロジック（計算等） | REJECT |
| Request/Responseが同一の型 | REJECT |

### RESTful なアクション設計

状態遷移は動詞をサブリソースとして表現する。

```
POST   /api/orders              → 注文作成
GET    /api/orders/{id}         → 注文取得
GET    /api/orders              → 注文一覧
POST   /api/orders/{id}/approve → 承認（状態遷移）
POST   /api/orders/{id}/cancel  → キャンセル（状態遷移）
```

| 基準 | 判定 |
|------|------|
| PUT/PATCH でドメイン操作（approve, cancel等） | REJECT。POST + 動詞サブリソース |
| 1つのエンドポイントで複数の操作を分岐 | REJECT。操作ごとにエンドポイントを分ける |
| DELETE で論理削除 | REJECT。POST + cancel 等の明示的操作 |

## バリデーション戦略

バリデーションは層ごとに役割が異なる。すべてを1箇所に集めない。

| 層 | 責務 | 手段 | 例 |
|----|------|------|-----|
| API層 | 構造的バリデーション | `@NotBlank`, `init` ブロック | 必須項目、型、フォーマット |
| UseCase層 | ビジネスルール検証 | Read Modelへの問い合わせ | 重複チェック、前提条件の存在確認 |
| ドメイン層 | 状態遷移の不変条件 | `require` | 「PENDINGでないと承認できない」 |

```kotlin
// API層: 「入力の形が正しいか」
data class OrderPostRequest(
    @field:NotBlank val customerId: String,
    val from: LocalDateTime,
    val to: LocalDateTime
) {
    init {
        require(!to.isBefore(from)) { "終了日時は開始日時以降でなければなりません" }
    }
}

// UseCase層: 「ビジネス的に許可されるか」（Read Model参照）
fun execute(input: PlaceOrderInput) {
    customerRepository.findById(input.customerId)
        ?: throw CustomerNotFoundException("顧客が存在しません")
    validateNoOverlapping(input)  // 重複チェック
    commandGateway.send(buildCommand(input))
}

// ドメイン層: 「今の状態でこの操作は許されるか」
fun confirm(confirmedBy: String): OrderConfirmedEvent {
    require(status == OrderStatus.PENDING) { "確定できる状態ではありません" }
    return OrderConfirmedEvent(orderId, confirmedBy)
}
```

| 基準 | 判定 |
|------|------|
| ドメインの状態遷移ルールがAPI層にある | REJECT |
| ビジネスルール検証がControllerにある | REJECT。UseCase層に |
| 構造バリデーション（@NotBlank等）がドメインにある | REJECT。API層で |
| UseCase層のバリデーションがAggregate内にある | REJECT。Read Model参照はUseCase層 |

## エラーハンドリング

### 例外階層設計

ドメイン例外は sealed class で階層化する。HTTP ステータスコードへのマッピングは Controller 層で行う。

```kotlin
// ドメイン例外: sealed class で網羅性を保証
sealed class OrderException(message: String) : RuntimeException(message)
class OrderNotFoundException(message: String) : OrderException(message)
class InvalidOrderStateException(message: String) : OrderException(message)
class InsufficientStockException(message: String) : OrderException(message)

// Controller 層でHTTPステータスにマッピング
@RestControllerAdvice
class OrderExceptionHandler {
    @ExceptionHandler(OrderNotFoundException::class)
    fun handleNotFound(e: OrderNotFoundException) =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorResponse(e.message))

    @ExceptionHandler(InvalidOrderStateException::class)
    fun handleInvalidState(e: InvalidOrderStateException) =
        ResponseEntity.status(HttpStatus.CONFLICT).body(ErrorResponse(e.message))

    @ExceptionHandler(InsufficientStockException::class)
    fun handleInsufficientStock(e: InsufficientStockException) =
        ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(ErrorResponse(e.message))
}
```

| 基準 | 判定 |
|------|------|
| ドメイン例外にHTTPステータスコードが含まれる | REJECT。ドメインはHTTPを知らない |
| 汎用的な Exception や RuntimeException を throw | REJECT。具体的な例外型を使う |
| try-catch の空 catch | REJECT |
| Controller 内で例外を握りつぶして 200 を返す | REJECT |

## ドメインモデル設計

### イミュータブル + require

ドメインモデルは `data class`（イミュータブル）で設計し、`init` ブロックと `require` で不変条件を保証する。

```kotlin
data class Order(
    val orderId: String,
    val status: OrderStatus = OrderStatus.PENDING
) {
    // companion object の static メソッドで生成
    companion object {
        fun place(orderId: String, customerId: String): OrderPlacedEvent {
            require(customerId.isNotBlank()) { "Customer ID cannot be blank" }
            return OrderPlacedEvent(orderId, customerId)
        }
    }

    // インスタンスメソッドで状態遷移 → イベント返却
    fun confirm(confirmedBy: String): OrderConfirmedEvent {
        require(status == OrderStatus.PENDING) { "確定できる状態ではありません" }
        return OrderConfirmedEvent(orderId, confirmedBy, LocalDateTime.now())
    }

    // イミュータブルな状態更新
    fun apply(event: OrderEvent): Order = when (event) {
        is OrderPlacedEvent -> Order(orderId = event.orderId)
        is OrderConfirmedEvent -> copy(status = OrderStatus.CONFIRMED)
        is OrderCancelledEvent -> copy(status = OrderStatus.CANCELLED)
    }
}
```

| 基準 | 判定 |
|------|------|
| ドメインモデルに var フィールド | REJECT。`copy()` でイミュータブルに更新 |
| バリデーションなしのファクトリ | REJECT。`require` で不変条件を保証 |
| ドメインモデルが外部サービスを呼ぶ | REJECT。純粋な関数のみ |
| setter でフィールドを直接変更 | REJECT |

### 値オブジェクト

プリミティブ型（String, Int）をドメインの意味でラップする。

```kotlin
// ID系: 型で取り違えを防止
data class OrderId(@get:JsonValue val value: String) {
    init { require(value.isNotBlank()) { "Order ID cannot be blank" } }
    override fun toString(): String = value
}

// 範囲系: 複合的な不変条件を保証
data class DateRange(val from: LocalDateTime, val to: LocalDateTime) {
    init { require(!to.isBefore(from)) { "終了日は開始日以降でなければなりません" } }
}

// メタ情報系: イベントペイロード内の付随情報
data class ApprovalInfo(val approvedBy: String, val approvalTime: LocalDateTime)
```

| 基準 | 判定 |
|------|------|
| 同じ型のIDが取り違えられる（orderId と customerId が両方 String） | 値オブジェクト化を検討 |
| 同じフィールドの組み合わせ（from/to等）が複数箇所に | 値オブジェクトに抽出 |
| 値オブジェクトに init ブロックがない | REJECT。不変条件を保証する |

## リポジトリパターン

ドメイン層でインターフェースを定義し、adapter/outbound で実装する。

```kotlin
// domain/: インターフェース（ポート）
interface OrderRepository {
    fun findById(orderId: String): Order?
    fun save(order: Order)
}

// adapter/outbound/persistence/: 実装（アダプター）
@Repository
class JpaOrderRepository(
    private val jpaRepository: OrderJpaRepository
) : OrderRepository {
    override fun findById(orderId: String): Order? {
        return jpaRepository.findById(orderId).orElse(null)?.toDomain()
    }
    override fun save(order: Order) {
        jpaRepository.save(OrderEntity.from(order))
    }
}
```

### Read Model Entity（JPA Entity）

Read Model 用の JPA Entity はドメインモデルとは別に定義する。var（mutable）が許容される。

```kotlin
@Entity
@Table(name = "orders")
data class OrderEntity(
    @Id val orderId: String,
    var customerId: String,
    @Enumerated(EnumType.STRING) var status: OrderStatus,
    var metadata: String? = null
)
```

| 基準 | 判定 |
|------|------|
| ドメインモデルを JPA Entity として兼用 | REJECT。分離する |
| Entity に ビジネスロジック | REJECT。Entity はデータ構造のみ |
| Repository 実装がドメイン層にある | REJECT。adapter/outbound に |

## 認証・認可の配置

認証・認可は横断的関心事として適切な層で処理する。

| 関心事 | 配置 | 手段 |
|-------|------|------|
| 認証（誰か） | Filter / Interceptor層 | JWT検証、セッション確認 |
| 認可（権限） | Controller層 | `@PreAuthorize("hasRole('ADMIN')")` |
| データアクセス制御（自分のデータのみ） | UseCase層 | ビジネスルールとして検証 |

```kotlin
// Controller層: ロールベースの認可
@PostMapping("/{id}/approve")
@PreAuthorize("hasRole('FACILITY_ADMIN')")
fun approve(@PathVariable id: String, @RequestBody request: ApproveRequest) { ... }

// UseCase層: データアクセス制御
fun execute(input: DeleteInput, currentUserId: String) {
    val entity = repository.findById(input.id)
        ?: throw NotFoundException("見つかりません")
    require(entity.ownerId == currentUserId) { "他のユーザーのデータは操作できません" }
    // ...
}
```

| 基準 | 判定 |
|------|------|
| 認可ロジックが UseCase 層やドメイン層にある | REJECT。Controller層で |
| データアクセス制御が Controller にある | REJECT。UseCase層で |
| 認証処理が Controller 内にある | REJECT。Filter/Interceptor で |

## テスト戦略

### テストピラミッド

```
        ┌─────────────┐
        │   E2E Test  │  ← 少数: API全体フロー確認
        ├─────────────┤
        │ Integration │  ← Repository, Controller の統合確認
        ├─────────────┤
        │  Unit Test  │  ← 多数: ドメインモデル、UseCase の独立テスト
        └─────────────┘
```

### ドメインモデルのテスト

ドメインモデルはフレームワーク非依存なので、純粋なユニットテストが書ける。

```kotlin
class OrderTest {
    // ヘルパー: 特定の状態の集約を構築
    private fun pendingOrder(): Order {
        val event = Order.place("order-1", "customer-1")
        return Order.from(event)
    }

    @Nested
    inner class Confirm {
        @Test
        fun `PENDING状態から確定できる`() {
            val order = pendingOrder()
            val event = order.confirm("admin-1")
            assertEquals("order-1", event.orderId)
        }

        @Test
        fun `CONFIRMED状態からは確定できない`() {
            val order = pendingOrder().let { it.apply(it.confirm("admin-1")) }
            assertThrows<IllegalArgumentException> {
                order.confirm("admin-2")
            }
        }
    }
}
```

テストのルール:
- 状態遷移をヘルパーメソッドで構築（テストごとに独立）
- `@Nested` で操作単位にグループ化
- 正常系と異常系（不正な状態遷移）を両方テスト
- `assertThrows` で例外の型を検証

### UseCase のテスト

UseCase はモックを使ってテスト。外部依存を注入する。

```kotlin
class PlaceOrderUseCaseTest {
    private val commandGateway = mockk<CommandGateway>()
    private val customerRepository = mockk<CustomerRepository>()
    private val useCase = PlaceOrderUseCase(commandGateway, customerRepository)

    @Test
    fun `顧客が存在しない場合はエラー`() {
        every { customerRepository.findById("unknown") } returns null

        assertThrows<CustomerNotFoundException> {
            useCase.execute(PlaceOrderInput(customerId = "unknown", items = listOf(...)))
        }
    }
}
```

| 基準 | 判定 |
|------|------|
| ドメインモデルのテストにモックを使用 | REJECT。ドメインは純粋にテスト |
| UseCase テストで実DBに接続 | REJECT。モックを使う |
| テストがフレームワークの起動を必要とする | ユニットテストなら REJECT |
| 状態遷移の異常系テストがない | REJECT |

## アンチパターン検出

以下を見つけたら REJECT:

| アンチパターン | 問題 |
|---------------|------|
| Smart Controller | Controller にビジネスロジックが集中 |
| Anemic Domain Model | ドメインモデルが setter/getter だけのデータ構造 |
| God Service | 1つの Service クラスに全操作が集中 |
| Repository直叩き | Controller が Repository を直接参照 |
| ドメイン漏洩 | adapter 層にドメインロジックが漏れる |
| Entity兼用 | JPA Entity をドメインモデルとして使い回す |
| 例外握りつぶし | 空の catch ブロック |
| Magic String | ハードコードされたステータス文字列等 |


---

# セキュリティ知識

## AI生成コードのセキュリティ問題

AI生成コードには特有の脆弱性パターンがある。

| パターン | リスク | 例 |
|---------|--------|-----|
| もっともらしいが危険なデフォルト | 高 | `cors: { origin: '*' }` は問題なく見えるが危険 |
| 古いセキュリティプラクティス | 中 | 非推奨の暗号化、古い認証パターンの使用 |
| 不完全なバリデーション | 高 | 形式は検証するがビジネスルールを検証しない |
| 入力を過度に信頼 | 重大 | 内部APIは常に安全と仮定 |
| コピペによる脆弱性 | 高 | 同じ危険なパターンが複数ファイルで繰り返される |

特に厳しく審査が必要:
- 認証・認可ロジック（AIはエッジケースを見落としがち）
- 入力バリデーション（AIは構文を検証しても意味を見落とす可能性）
- エラーメッセージ（AIは内部詳細を露出する可能性）
- 設定ファイル（AIは学習データから危険なデフォルトを使う可能性）

## インジェクション攻撃

**SQLインジェクション**

- 文字列連結によるSQL構築 → REJECT
- パラメータ化クエリの不使用 → REJECT
- ORMの raw query での未サニタイズ入力 → REJECT

```typescript
// NG
db.query(`SELECT * FROM users WHERE id = ${userId}`)

// OK
db.query('SELECT * FROM users WHERE id = ?', [userId])
```

**コマンドインジェクション**

- `exec()`, `spawn()` での未検証入力 → REJECT
- シェルコマンド構築時のエスケープ不足 → REJECT

```typescript
// NG
exec(`ls ${userInput}`)

// OK
execFile('ls', [sanitizedInput])
```

**XSS (Cross-Site Scripting)**

- HTML/JSへの未エスケープ出力 → REJECT
- `innerHTML`, `dangerouslySetInnerHTML` の不適切な使用 → REJECT
- URLパラメータの直接埋め込み → REJECT

## 認証・認可

**認証の問題**

- ハードコードされたクレデンシャル → 即REJECT
- 平文パスワードの保存 → 即REJECT
- 弱いハッシュアルゴリズム (MD5, SHA1) → REJECT
- セッショントークンの不適切な管理 → REJECT

**認可の問題**

- 権限チェックの欠如 → REJECT
- IDOR (Insecure Direct Object Reference) → REJECT
- 権限昇格の可能性 → REJECT

```typescript
// NG - 権限チェックなし
app.get('/user/:id', (req, res) => {
  return db.getUser(req.params.id)
})

// OK
app.get('/user/:id', authorize('read:user'), (req, res) => {
  if (req.user.id !== req.params.id && !req.user.isAdmin) {
    return res.status(403).send('Forbidden')
  }
  return db.getUser(req.params.id)
})
```

## データ保護

**機密情報の露出**

- APIキー、シークレットのハードコーディング → 即REJECT
- ログへの機密情報出力 → REJECT
- エラーメッセージでの内部情報露出 → REJECT
- `.env` ファイルのコミット → REJECT

**データ検証**

- 入力値の未検証 → REJECT
- 型チェックの欠如 → REJECT
- サイズ制限の未設定 → REJECT

## 暗号化

- 弱い暗号アルゴリズムの使用 → REJECT
- 固定IV/Nonceの使用 → REJECT
- 暗号化キーのハードコーディング → 即REJECT
- HTTPSの未使用（本番環境） → REJECT

## ファイル操作

**パストラバーサル**

- ユーザー入力を含むファイルパス → REJECT
- `../` のサニタイズ不足 → REJECT

```typescript
// NG
const filePath = path.join(baseDir, userInput)
fs.readFile(filePath)

// OK
const safePath = path.resolve(baseDir, userInput)
if (!safePath.startsWith(path.resolve(baseDir))) {
  throw new Error('Invalid path')
}
```

**ファイルアップロード**

- ファイルタイプの未検証 → REJECT
- ファイルサイズ制限なし → REJECT
- 実行可能ファイルのアップロード許可 → REJECT

## 依存関係

- 既知の脆弱性を持つパッケージ → REJECT
- メンテナンスされていないパッケージ → 警告
- 不必要な依存関係 → 警告

## エラーハンドリング

- スタックトレースの本番露出 → REJECT
- 詳細なエラーメッセージの露出 → REJECT
- エラーの握りつぶし（セキュリティイベント） → REJECT

## レート制限・DoS対策

- レート制限の欠如（認証エンドポイント） → 警告
- リソース枯渇攻撃の可能性 → 警告
- 無限ループの可能性 → REJECT

## マルチテナントデータ分離

テナント境界を超えたデータアクセスを防ぐ。認可（誰が操作できるか）とスコーピング（どのテナントのデータか）は別の関心事。

| 基準 | 判定 |
|------|------|
| 読み取りはテナントスコープだが書き込みはスコープなし | REJECT |
| 書き込み操作でクライアント提供のテナントIDを使用 | REJECT |
| テナントリゾルバーを使うエンドポイントに認可制御がない | REJECT |
| ロール分岐の一部パスでテナント解決が未考慮 | REJECT |

### 読み書きの一貫性

テナントスコーピングは読み取りと書き込みの両方に適用する。片方だけでは、参照できないが変更できる状態が生まれる。

読み取りにテナントフィルタを追加したら、対応する書き込みも必ずテナント検証する。

### 書き込みのテナント検証

書き込み操作では、リクエストボディのテナントIDではなく認証済みユーザーから解決したテナントIDを使う。

```kotlin
// NG - クライアント提供のテナントIDを信頼
fun create(request: CreateRequest) {
    service.create(request.tenantId, request.data)
}

// OK - 認証情報からテナントを解決
fun create(request: CreateRequest) {
    val tenantId = tenantResolver.resolve()
    service.create(tenantId, request.data)
}
```

### 認可とリゾルバーの整合性

テナントリゾルバーが特定ロール（例: スタッフ）を前提とする場合、エンドポイントに対応する認可制御が必要。認可なしだと、前提外のロールがアクセスしてリゾルバーが失敗する。

```kotlin
// NG - リゾルバーが STAFF を前提とするが認可制御なし
fun getSettings(): SettingsResponse {
    val tenantId = tenantResolver.resolve()  // STAFF 以外で失敗
    return settingsService.getByTenant(tenantId)
}

// OK - 認可制御でロールを保証
@Authorized(roles = ["STAFF"])
fun getSettings(): SettingsResponse {
    val tenantId = tenantResolver.resolve()
    return settingsService.getByTenant(tenantId)
}
```

ロール分岐があるエンドポイントでは、全パスでテナント解決が成功するか検証する。

## OWASP Top 10 チェックリスト

| カテゴリ | 確認事項 |
|---------|---------|
| A01 Broken Access Control | 認可チェック、CORS設定 |
| A02 Cryptographic Failures | 暗号化、機密データ保護 |
| A03 Injection | SQL, コマンド, XSS |
| A04 Insecure Design | セキュリティ設計パターン |
| A05 Security Misconfiguration | デフォルト設定、不要な機能 |
| A06 Vulnerable Components | 依存関係の脆弱性 |
| A07 Auth Failures | 認証メカニズム |
| A08 Software Integrity | コード署名、CI/CD |
| A09 Logging Failures | セキュリティログ |
| A10 SSRF | サーバーサイドリクエスト |


---

# アーキテクチャ知識

## 構造・設計

**ファイル分割**

| 基準           | 判定 |
|--------------|------|
| 1ファイル200行超   | 分割を検討 |
| 1ファイル300行超   | REJECT |
| 1ファイルに複数の責務  | REJECT |
| 関連性の低いコードが同居 | REJECT |

**モジュール構成**

- 高凝集: 関連する機能がまとまっているか
- 低結合: モジュール間の依存が最小限か
- 循環依存がないか
- 適切なディレクトリ階層か

**操作の一覧性**

同じ汎用関数への呼び出しがコードベースに散在すると、システムが何をしているか把握できなくなる。操作には目的に応じた名前を付けて関数化し、関連する操作を1つのモジュールにまとめる。そのモジュールを読めば「このシステムが行う操作の全体像」がわかる状態にする。

| 判定 | 基準 |
|------|------|
| REJECT | 同じ汎用関数が目的の異なる3箇所以上から直接呼ばれている |
| REJECT | 呼び出し元を全件 grep しないとシステムの操作一覧がわからない |
| OK | 目的ごとに名前付き関数が定義され、1モジュールに集約されている |

**パブリック API の公開範囲**

パブリック API が公開するのは、ドメインの操作に対応する関数・型のみ。インフラの実装詳細（特定プロバイダーの関数、内部パーサー等）を公開しない。

| 判定 | 基準 |
|------|------|
| REJECT | インフラ層の関数がパブリック API からエクスポートされている |
| REJECT | 内部実装の関数が外部から直接呼び出し可能になっている |
| OK | 外部消費者がドメインレベルの抽象のみを通じて対話する |

**関数設計**

- 1関数1責務になっているか
- 30行を超える関数は分割を検討
- 副作用が明確か

**レイヤー設計**

- 依存の方向: 上位層 → 下位層（逆方向禁止）
- Controller → Service → Repository の流れが守られているか
- 1インターフェース = 1責務（巨大なServiceクラス禁止）

**ディレクトリ構造**

構造パターンの選択:

| パターン | 適用場面 | 例 |
|---------|---------|-----|
| レイヤード | 小規模、CRUD中心 | `controllers/`, `services/`, `repositories/` |
| Vertical Slice | 中〜大規模、機能独立性が高い | `features/auth/`, `features/order/` |
| ハイブリッド | 共通基盤 + 機能モジュール | `core/` + `features/` |

Vertical Slice Architecture（機能単位でコードをまとめる構造）:

```
src/
├── features/
│   ├── auth/
│   │   ├── LoginCommand.ts
│   │   ├── LoginHandler.ts
│   │   ├── AuthRepository.ts
│   │   └── auth.test.ts
│   └── order/
│       ├── CreateOrderCommand.ts
│       ├── CreateOrderHandler.ts
│       └── ...
└── shared/           # 複数featureで共有
    ├── database/
    └── middleware/
```

Vertical Slice の判定基準:

| 基準 | 判定 |
|------|------|
| 1機能が3ファイル以上のレイヤーに跨る | Slice化を検討 |
| 機能間の依存がほぼない | Slice化推奨 |
| 共通処理が50%以上 | レイヤード維持 |
| チームが機能別に分かれている | Slice化必須 |

禁止パターン:

| パターン | 問題 |
|---------|------|
| `utils/` の肥大化 | 責務不明の墓場になる |
| `common/` への安易な配置 | 依存関係が不明確になる |
| 深すぎるネスト（4階層超） | ナビゲーション困難 |
| 機能とレイヤーの混在 | `features/services/` は禁止 |

**責務の分離**

- 読み取りと書き込みの責務が分かれているか
- データ取得はルート（View/Controller）で行い、子に渡しているか
- エラーハンドリングが一元化されているか（各所でtry-catch禁止）
- ビジネスロジックがController/Viewに漏れていないか

## コード品質の検出手法

**説明コメント（What/How）の検出基準**

コードの動作をそのまま言い換えているコメントを検出する。

| 判定 | 基準 |
|------|------|
| REJECT | コードの動作をそのまま自然言語で言い換えている |
| REJECT | 関数名・変数名から明らかなことを繰り返している |
| REJECT | JSDocが関数名の言い換えだけで情報を追加していない |
| OK | なぜその実装を選んだかの設計判断を説明している |
| OK | 一見不自然に見える挙動の理由を説明している |
| 最良 | コメントなしでコード自体が意図を語っている |

```typescript
// REJECT - コードの言い換え（What）
// If interrupted, abort immediately
if (status === 'interrupted') {
  return ABORT_STEP;
}

// REJECT - ループの存在を言い換えただけ
// Check transitions in order
for (const transition of step.transitions) {

// REJECT - 関数名の繰り返し
/** Check if status matches transition condition. */
export function matchesCondition(status: Status, condition: TransitionCondition): boolean {

// OK - 設計判断の理由（Why）
// ユーザー中断はピース定義のトランジションより優先する
if (status === 'interrupted') {
  return ABORT_STEP;
}

// OK - 一見不自然な挙動の理由
// stay はループを引き起こす可能性があるが、ユーザーが明示的に指定した場合のみ使われる
return step.name;
```

**状態の直接変更の検出基準**

配列やオブジェクトの直接変更（ミューテーション）を検出する。

```typescript
// REJECT - 配列の直接変更
const steps: Step[] = getSteps();
steps.push(newStep);           // 元の配列を破壊
steps.splice(index, 1);       // 元の配列を破壊
steps[0].status = 'done';     // ネストされたオブジェクトも直接変更

// OK - イミュータブルな操作
const withNew = [...steps, newStep];
const without = steps.filter((_, i) => i !== index);
const updated = steps.map((s, i) =>
  i === 0 ? { ...s, status: 'done' } : s
);

// REJECT - オブジェクトの直接変更
function updateConfig(config: Config) {
  config.logLevel = 'debug';   // 引数を直接変更
  config.steps.push(newStep);  // ネストも直接変更
  return config;
}

// OK - 新しいオブジェクトを返す
function updateConfig(config: Config): Config {
  return {
    ...config,
    logLevel: 'debug',
    steps: [...config.steps, newStep],
  };
}
```

## セキュリティ（基本チェック）

- インジェクション対策（SQL, コマンド, XSS）
- ユーザー入力の検証
- 機密情報のハードコーディング

## テスタビリティ

- 依存性注入が可能な設計か
- モック可能か
- テストが書かれているか

## アンチパターン検出

以下のパターンを見つけたら REJECT:

| アンチパターン | 問題 |
|---------------|------|
| God Class/Component | 1つのクラスが多くの責務を持っている |
| Feature Envy | 他モジュールのデータを頻繁に参照している |
| Shotgun Surgery | 1つの変更が複数ファイルに波及する構造 |
| 過度な汎用化 | 今使わないバリアントや拡張ポイント |
| 隠れた依存 | 子コンポーネントが暗黙的にAPIを呼ぶ等 |
| 非イディオマティック | 言語・FWの作法を無視した独自実装 |

## 抽象化レベルの評価

**条件分岐の肥大化検出**

| パターン | 判定 |
|---------|------|
| 同じif-elseパターンが3箇所以上 | ポリモーフィズムで抽象化 → REJECT |
| switch/caseが5分岐以上 | Strategy/Mapパターンを検討 |
| フラグ引数で挙動を変える | 別関数に分割 → REJECT |
| 型による分岐（instanceof/typeof） | ポリモーフィズムに置換 → REJECT |
| ネストした条件分岐（3段以上） | 早期リターンまたは抽出 → REJECT |

**抽象度の不一致検出**

| パターン | 問題 | 修正案 |
|---------|------|--------|
| 高レベル処理の中に低レベル詳細 | 読みにくい | 詳細を関数に抽出 |
| 1関数内で抽象度が混在 | 認知負荷 | 同じ粒度に揃える |
| ビジネスロジックにDB操作が混在 | 責務違反 | Repository層に分離 |
| 設定値と処理ロジックが混在 | 変更困難 | 設定を外部化 |

**良い抽象化の例**

```typescript
// 条件分岐の肥大化
function process(type: string) {
  if (type === 'A') { /* 処理A */ }
  else if (type === 'B') { /* 処理B */ }
  else if (type === 'C') { /* 処理C */ }
  // ...続く
}

// Mapパターンで抽象化
const processors: Record<string, () => void> = {
  A: processA,
  B: processB,
  C: processC,
};
function process(type: string) {
  processors[type]?.();
}
```

```typescript
// 抽象度の混在
function createUser(data: UserData) {
  // 高レベル: ビジネスロジック
  validateUser(data);
  // 低レベル: DB操作の詳細
  const conn = await pool.getConnection();
  await conn.query('INSERT INTO users...');
  conn.release();
}

// 抽象度を揃える
function createUser(data: UserData) {
  validateUser(data);
  await userRepository.save(data);  // 詳細は隠蔽
}
```

## その場しのぎの検出

「とりあえず動かす」ための妥協を見逃さない。

| パターン | 例 |
|---------|-----|
| 不要なパッケージ追加 | 動かすためだけに入れた謎のライブラリ |
| テストの削除・スキップ | `@Disabled`、`.skip()`、コメントアウト |
| 空実装・スタブ放置 | `return null`、`// TODO: implement`、`pass` |
| モックデータの本番混入 | ハードコードされたダミーデータ |
| エラー握りつぶし | 空の `catch {}`、`rescue nil` |
| マジックナンバー | 説明なしの `if (status == 3)` |

## TODOコメントの厳格な禁止

「将来やる」は決してやらない。今やらないことは永遠にやらない。

TODOコメントは即REJECT。

```kotlin
// REJECT - 将来を見越したTODO
// TODO: 施設IDによる認可チェックを追加
fun deleteCustomHoliday(@PathVariable id: String) {
    deleteCustomHolidayInputPort.execute(input)
}

// APPROVE - 今実装する
fun deleteCustomHoliday(@PathVariable id: String) {
    val currentUserFacilityId = getCurrentUserFacilityId()
    val holiday = findHolidayById(id)
    require(holiday.facilityId == currentUserFacilityId) {
        "Cannot delete holiday from another facility"
    }
    deleteCustomHolidayInputPort.execute(input)
}
```

TODOが許容される唯一のケース:

| 条件 | 例 | 判定 |
|------|-----|------|
| 外部依存で今は実装不可 + Issue化済み | `// TODO(#123): APIキー取得後に実装` | 許容 |
| 技術的制約で回避不可 + Issue化済み | `// TODO(#456): ライブラリバグ修正待ち` | 許容 |
| 「将来実装」「後で追加」 | `// TODO: バリデーション追加` | REJECT |
| 「時間がないので」 | `// TODO: リファクタリング` | REJECT |

正しい対処:
- 今必要 → 今実装する
- 今不要 → コードを削除する
- 外部要因で不可 → Issue化してチケット番号をコメントに入れる

## DRY違反の検出

基本的に重複は排除する。本質的に同じロジックであり、まとめるべきと判断したら DRY にする。回数で機械的に判断しない。

| パターン | 判定 |
|---------|------|
| 本質的に同じロジックの重複 | REJECT - 関数/メソッドに抽出 |
| 同じバリデーションの重複 | REJECT - バリデーター関数に抽出 |
| 本質的に同じ構造のコンポーネント | REJECT - 共通コンポーネント化 |
| コピペで派生したコード | REJECT - パラメータ化または抽象化 |

DRY にしないケース:
- ドメインが異なる重複は抽象化しない（例: 顧客用バリデーションと管理者用バリデーションは別物）
- 表面的に似ているが、変更理由が異なるコードは別物として扱う

## 仕様準拠の検証

変更が、プロジェクトの文書化された仕様に準拠しているか検証する。

検証対象:

| 対象 | 確認内容 |
|------|---------|
| CLAUDE.md / README.md | スキーマ定義、設計原則、制約に従っているか |
| 型定義・Zodスキーマ | 新しいフィールドがスキーマに反映されているか |
| YAML/JSON設定ファイル | 文書化されたフォーマットに従っているか |

具体的なチェック:

1. 設定ファイル（YAML等）を変更・追加した場合:
   - CLAUDE.md等に記載されたスキーマ定義と突合する
   - 無視されるフィールドや無効なフィールドが含まれていないか
   - 必須フィールドが欠落していないか

2. 型定義やインターフェースを変更した場合:
   - ドキュメントのスキーマ説明が更新されているか
   - 既存の設定ファイルが新しいスキーマと整合するか

このパターンを見つけたら REJECT:

| パターン | 問題 |
|---------|------|
| 仕様に存在しないフィールドの使用 | 無視されるか予期しない動作 |
| 仕様上無効な値の設定 | 実行時エラーまたは無視される |
| 文書化された制約への違反 | 設計意図に反する |

## 呼び出しチェーン検証

新しいパラメータ・フィールドが追加された場合、変更ファイル内だけでなく呼び出し元も検証する。

検証手順:
1. 新しいオプショナルパラメータや interface フィールドを見つけたら、`Grep` で全呼び出し元を検索
2. 全呼び出し元が新しいパラメータを渡しているか確認
3. フォールバック値（`?? default`）がある場合、フォールバックが使われるケースが意図通りか確認

危険パターン:

| パターン | 問題 | 検出方法 |
|---------|------|---------|
| `options.xxx ?? fallback` で全呼び出し元が `xxx` を省略 | 機能が実装されているのに常にフォールバック | grep で呼び出し元を確認 |
| テストがモックで直接値をセット | 実際の呼び出しチェーンを経由しない | テストの構築方法を確認 |
| `executeXxx()` が内部で使う `options` を引数で受け取らない | 上位から値を渡す口がない | 関数シグネチャを確認 |

```typescript
// 配線漏れ: projectCwd を受け取る口がない
export async function executePiece(config, cwd, task) {
  const engine = new PieceEngine(config, cwd, task);  // options なし
}

// 配線済み: projectCwd を渡せる
export async function executePiece(config, cwd, task, options?) {
  const engine = new PieceEngine(config, cwd, task, options);
}
```

呼び出し元の制約による論理的デッドコード:

呼び出しチェーンの検証は「配線漏れ」だけでなく、逆方向——呼び出し元が既に保証している条件に対する不要な防御コード——にも適用する。

| パターン | 問題 | 検出方法 |
|---------|------|---------|
| 呼び出し元がTTY必須なのに関数内でTTYチェック | 到達しない分岐が残る | grep で全呼び出し元の前提条件を確認 |
| 呼び出し元がnullチェック済みなのに再度nullガード | 冗長な防御 | 呼び出し元の制約を追跡 |
| 呼び出し元が型で制約しているのにランタイムチェック | 型安全を信頼していない | TypeScriptの型制約を確認 |

検証手順:
1. 防御的な条件分岐（TTYチェック、nullガード等）を見つけたら、grep で全呼び出し元を確認
2. 全呼び出し元がその条件を既に保証しているなら、防御は不要 → REJECT
3. 一部の呼び出し元が保証していない場合は、防御を残す

## 品質特性

| 特性 | 確認観点 |
|------|---------|
| Scalability | 負荷増加に対応できる設計か |
| Maintainability | 変更・修正が容易か |
| Observability | ログ・監視が可能な設計か |

## 大局観

細かい「クリーンコード」の指摘に終始しない。

確認すべきこと:
- このコードは将来どう変化するか
- スケーリングの必要性は考慮されているか
- 技術的負債を生んでいないか
- ビジネス要件と整合しているか
- 命名がドメインと一貫しているか

## 変更スコープの評価

変更スコープを確認し、レポートに記載する（ブロッキングではない）。

| スコープサイズ | 変更行数 | 対応 |
|---------------|---------|------|
| Small | 〜200行 | そのままレビュー |
| Medium | 200-500行 | そのままレビュー |
| Large | 500行以上 | レビューは継続。分割可能か提案を付記 |

大きな変更が必要なタスクもある。行数だけでREJECTしない。

確認すること:
- 変更が論理的にまとまっているか（無関係な変更が混在していないか）
- Coderのスコープ宣言と実際の変更が一致しているか

提案として記載すること（ブロッキングではない）:
- 分割可能な場合は分割案を提示
