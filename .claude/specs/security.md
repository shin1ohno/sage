# セキュリティ仕様

このドキュメントでは、sageシステムのセキュリティ考慮事項とベストプラクティスを定義します。

## 1. データ保護

### 設定ファイルの保護

```typescript
// ファイルパーミッション設定 (Unix系)
const CONFIG_FILE_MODE = 0o600; // Owner read/write only

async function saveConfig(config: UserConfig, filePath: string): Promise<void> {
  const configJson = JSON.stringify(config, null, 2);
  await fs.writeFile(filePath, configJson, { mode: CONFIG_FILE_MODE });
}
```

### 機密情報の暗号化

```typescript
import crypto from 'crypto';

class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32;

  async encrypt(data: string, key: Buffer): Promise<EncryptedData> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  async decrypt(encryptedData: EncryptedData, key: Buffer): Promise<string> {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

## 2. API セキュリティ

### JWT認証

```typescript
import jwt from 'jsonwebtoken';

interface JWTPayload {
  userId: string;
  permissions: string[];
  iat: number;
  exp: number;
}

class AuthenticationService {
  private secret: string;
  private expiresIn: string = '24h';

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters');
    }
    this.secret = secret;
  }

  generateToken(userId: string, permissions: string[]): string {
    const payload: JWTPayload = {
      userId,
      permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24時間
    };

    return jwt.sign(payload, this.secret);
  }

  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.secret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
}
```

### レート制限

```typescript
interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
  whitelistedIPs: string[];
}

class RateLimiter {
  private requestCounts: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  isAllowed(clientId: string, clientIP: string): boolean {
    // ホワイトリストIPはチェックをスキップ
    if (this.config.whitelistedIPs.includes(clientIP)) {
      return true;
    }

    const now = Date.now();
    const requests = this.requestCounts.get(clientId) || [];

    // 1分以内のリクエストをカウント
    const recentRequests = requests.filter(time => now - time < 60000);

    if (recentRequests.length >= this.config.requestsPerMinute) {
      return false;
    }

    // 1時間以内のリクエストをカウント
    const hourlyRequests = requests.filter(time => now - time < 3600000);

    if (hourlyRequests.length >= this.config.requestsPerHour) {
      return false;
    }

    // バースト制限
    const burstRequests = requests.filter(time => now - time < 1000);

    if (burstRequests.length >= this.config.burstLimit) {
      return false;
    }

    // リクエストを記録
    recentRequests.push(now);
    this.requestCounts.set(clientId, recentRequests);

    return true;
  }
}
```

### CORS設定

```typescript
interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  credentials: boolean;
}

function setupCORS(config: CORSConfig): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const origin = req.headers.origin;

    if (config.allowedOrigins.includes('*') ||
        (origin && config.allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));

    if (config.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  };
}
```

## 3. 入力検証

### スキーマ検証

```typescript
import { z } from 'zod';

// タスク入力の検証スキーマ
const TaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  deadline: z.string().datetime().optional(),
  dependencies: z.array(z.string()).optional(),
  tags: z.array(z.string().max(50)).max(20).optional()
});

// セットアップ質問の回答検証
const SetupAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string(),
  answer: z.union([
    z.string(),
    z.array(z.string()),
    z.number(),
    z.boolean()
  ])
});

// リマインダー作成の検証
const ReminderRequestSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(5000).optional(),
  dueDate: z.string().datetime().optional(),
  list: z.string().max(100).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional()
});

class InputValidator {
  validateTask(input: unknown): Task {
    return TaskSchema.parse(input);
  }

  validateSetupAnswer(input: unknown): SetupAnswer {
    return SetupAnswerSchema.parse(input);
  }

  validateReminderRequest(input: unknown): ReminderRequest {
    return ReminderRequestSchema.parse(input);
  }
}
```

### サニタイゼーション

```typescript
class InputSanitizer {
  sanitizeString(input: string): string {
    // HTMLタグの除去
    return input
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  sanitizeAppleScriptString(input: string): string {
    // AppleScript用のエスケープ
    return input
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  sanitizeShellCommand(input: string): string {
    // シェルコマンド用のエスケープ
    return input
      .replace(/[;&|`$()]/g, '')
      .trim();
  }
}
```

### パストラバーサル防止

```typescript
import path from 'path';

class PathValidator {
  private allowedBasePaths: string[];

  constructor(allowedBasePaths: string[]) {
    this.allowedBasePaths = allowedBasePaths.map(p => path.resolve(p));
  }

  isPathAllowed(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);

    return this.allowedBasePaths.some(basePath =>
      resolvedPath.startsWith(basePath)
    );
  }

  validateConfigPath(configPath: string): string {
    const resolved = path.resolve(configPath);
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const sageDir = path.join(homeDir!, '.sage');

    if (!resolved.startsWith(sageDir)) {
      throw new Error('Config file must be in ~/.sage directory');
    }

    if (path.extname(resolved) !== '.json') {
      throw new Error('Config file must be a JSON file');
    }

    return resolved;
  }
}
```

## 4. OAuth 2.1 セキュリティ

OAuth 2.1認証の詳細は`oauth-spec.md`を参照してください。

### 主要セキュリティ要件

1. **PKCE (S256)**: すべてのOAuth認可フローでPKCE必須
2. **HTTPS必須**: すべてのOAuthエンドポイントはHTTPS経由のみ
3. **State検証**: CSRF対策としてstateパラメータ必須
4. **Redirect URI完全一致**: redirect_uriは登録済みURIと完全一致
5. **トークンローテーション**: リフレッシュトークン使用時にローテーション
6. **Audience検証**: トークンのaudクレームを検証

## 5. セキュリティベストプラクティス

### 環境変数の使用

```typescript
// ❌ Bad: ハードコードされたシークレット
const API_KEY = 'secret_123456789';

// ✅ Good: 環境変数からロード
const API_KEY = process.env.NOTION_API_KEY;
if (!API_KEY) {
  throw new Error('NOTION_API_KEY environment variable is required');
}
```

### シークレットのログ出力防止

```typescript
class SecureLogger {
  private sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key'];

  log(message: string, data?: any): void {
    if (data) {
      const sanitized = this.sanitizeData(data);
      console.log(message, sanitized);
    } else {
      console.log(message);
    }
  }

  private sanitizeData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized: any = Array.isArray(data) ? [] : {};

    for (const key in data) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof data[key] === 'object') {
        sanitized[key] = this.sanitizeData(data[key]);
      } else {
        sanitized[key] = data[key];
      }
    }

    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
  }
}
```

### 依存関係のセキュリティ

```bash
# 定期的な脆弱性スキャン
npm audit

# 自動修正
npm audit fix

# package-lock.jsonのコミット
git add package-lock.json
git commit -m "chore: Update dependencies for security patches"
```

## 6. セキュリティチェックリスト

### デプロイ前チェック

- [ ] すべてのシークレットが環境変数で管理されている
- [ ] JWT秘密鍵が32文字以上
- [ ] HTTPS設定が有効（本番環境）
- [ ] CORS設定が適切
- [ ] レート制限が設定されている
- [ ] 入力検証が全エンドポイントで実装されている
- [ ] エラーメッセージに機密情報が含まれていない
- [ ] ログ出力にシークレットが含まれていない
- [ ] 依存関係に既知の脆弱性がない
- [ ] OAuth 2.1 PKCE (S256) が実装されている
