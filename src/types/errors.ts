/**
 * Error type definitions
 */

export enum ErrorType {
  SETUP_ERROR = 'SETUP_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTEGRATION_ERROR = 'INTEGRATION_ERROR',
  ANALYSIS_ERROR = 'ANALYSIS_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
}

export interface SageError {
  type: ErrorType;
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
  suggestions?: string[];
}

export class SageErrorImpl extends Error implements SageError {
  type: ErrorType;
  code: string;
  recoverable: boolean;
  details?: unknown;
  suggestions?: string[];

  constructor(
    type: ErrorType,
    code: string,
    message: string,
    options?: {
      details?: unknown;
      recoverable?: boolean;
      suggestions?: string[];
    }
  ) {
    super(message);
    this.name = 'SageError';
    this.type = type;
    this.code = code;
    this.recoverable = options?.recoverable ?? true;
    this.details = options?.details;
    this.suggestions = options?.suggestions;
  }

  toJSON(): SageError {
    return {
      type: this.type,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      suggestions: this.suggestions,
    };
  }
}

export class ErrorHandler {
  static handle(error: Error, context: string): SageError {
    if (error instanceof SageErrorImpl) {
      return error.toJSON();
    }

    // Classify unknown errors
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return {
        type: ErrorType.NETWORK_ERROR,
        code: 'NETWORK_FAILURE',
        message: `ネットワークエラーが発生しました: ${context}`,
        details: error.message,
        recoverable: true,
        suggestions: ['インターネット接続を確認してください', 'しばらく待ってから再試行してください'],
      };
    }

    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized')) {
      return {
        type: ErrorType.AUTH_ERROR,
        code: 'AUTH_FAILURE',
        message: `認証エラーが発生しました: ${context}`,
        details: error.message,
        recoverable: true,
        suggestions: ['APIキーが正しく設定されているか確認してください', '認証情報を再設定してください'],
      };
    }

    return {
      type: ErrorType.INTEGRATION_ERROR,
      code: 'UNKNOWN_ERROR',
      message: `予期しないエラーが発生しました: ${context}`,
      details: error.message,
      recoverable: false,
      suggestions: ['エラーが続く場合は設定を確認してください'],
    };
  }

  static shouldRetry(error: SageError): boolean {
    return error.recoverable && error.type === ErrorType.NETWORK_ERROR;
  }

  static getSuggestions(error: SageError): string[] {
    return error.suggestions ?? [];
  }
}
