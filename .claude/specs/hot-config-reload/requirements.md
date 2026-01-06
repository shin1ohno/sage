# Requirements Document: Hot Config Reload

## Introduction

Hot Config Reload機能は、sageサーバーの実行中に設定ファイル（`~/.sage/config.json`）の変更を検出し、サーバーの再起動なしに新しい設定を適用する機能です。

現状、sageは起動時に一度だけ設定を読み込み、設定変更時には手動でサーバーを再起動する必要があります。この機能により、運用中のサービス中断を最小限に抑え、設定変更の適用を迅速化します。

## Alignment with Product Vision

Product.mdで述べられているように、sageはClaude Desktop、Claude Code、Remoteクライアント向けのAIタスク管理アシスタントです。エンジニアの生産性向上を目指しており、以下の点でHot Config Reload機能は製品ビジョンに合致します：

- **運用効率の向上**: サーバー再起動不要により、サービス中断を回避
- **Developer Experience向上**: 設定変更のテスト・検証サイクルを短縮
- **Production Ready維持**: 本番環境での設定更新をシームレスに実行可能

## Requirements

### Requirement 1: Config File Watching

**User Story:** As a sage administrator, I want the server to automatically detect changes to the config file, so that I don't need to manually trigger config reloads.

#### Acceptance Criteria

1. WHEN the `~/.sage/config.json` file is modified THEN the system SHALL detect the change within 5 seconds
2. WHEN the `~/.sage/config.json` file is deleted THEN the system SHALL log a warning and continue operating with the current configuration
3. WHEN the `~/.sage/config.json` file is recreated after deletion THEN the system SHALL resume watching and apply the new configuration
4. IF the file watching fails to initialize THEN the system SHALL log an error and continue operating in manual reload mode

### Requirement 2: Configuration Validation on Reload

**User Story:** As a sage administrator, I want invalid configuration changes to be rejected without affecting the running server, so that configuration errors don't cause service disruptions.

#### Acceptance Criteria

1. WHEN a config file change is detected THEN the system SHALL validate the new configuration using existing Zod schemas before applying
2. IF the new configuration fails validation THEN the system SHALL log the validation errors and continue operating with the previous valid configuration
3. WHEN a valid configuration is successfully loaded THEN the system SHALL log a success message with a summary of changed sections
4. IF the configuration file contains syntax errors (invalid JSON) THEN the system SHALL log the parse error and continue operating with the previous valid configuration

### Requirement 3: Service Re-initialization

**User Story:** As a sage user, I want my running MCP tools to reflect updated configuration immediately, so that I can verify configuration changes without restarting my Claude session.

#### Acceptance Criteria

1. WHEN the configuration is successfully reloaded THEN the system SHALL re-initialize affected services with the new configuration
2. IF the `integrations` section changes THEN the system SHALL re-initialize CalendarSourceManager, ReminderManager, NotionMCPService, and TodoListManager
3. IF the `calendar` section changes THEN the system SHALL re-initialize WorkingCadenceService with new working hours and patterns
4. IF the `priorityRules` section changes THEN the system SHALL update the priority engine without requiring service restart
5. WHEN services are re-initialized THEN the system SHALL gracefully shutdown existing service instances before creating new ones

### Requirement 4: Manual Reload Trigger

**User Story:** As a sage administrator, I want to manually trigger a config reload without restarting the server, so that I can force a reload when automatic detection fails or is disabled.

#### Acceptance Criteria

1. WHEN the server receives a SIGHUP signal THEN the system SHALL trigger a config reload
2. WHEN the `reload_config` MCP tool is invoked THEN the system SHALL trigger a config reload and return the result
3. IF a manual reload is triggered while another reload is in progress THEN the system SHALL queue the request and execute after the current reload completes
4. WHEN a manual reload completes THEN the system SHALL return a status indicating success or failure with details

### Requirement 5: Remote MCP Server Support

**User Story:** As a remote MCP user accessing sage from iOS/Web, I want configuration changes to be applied to the remote server, so that I have the same hot reload benefits as local users.

#### Acceptance Criteria

1. WHEN the remote config (`~/.sage/remote-config.json`) is modified THEN the system SHALL detect and apply changes to OAuth and HTTP server settings where possible
2. IF OAuth configuration changes require server restart THEN the system SHALL log a warning indicating manual restart is required
3. WHEN user config changes on a remote server THEN the system SHALL re-initialize services identically to local mode
4. IF the remote server is running when config changes THEN the system SHALL apply changes to new sessions while preserving existing session state

### Requirement 6: Logging and Observability

**User Story:** As a sage administrator, I want detailed logs about configuration reloads, so that I can troubleshoot issues and audit configuration changes.

#### Acceptance Criteria

1. WHEN a config file change is detected THEN the system SHALL log the event with timestamp at INFO level
2. WHEN a configuration reload succeeds THEN the system SHALL log which sections were updated and which services were re-initialized
3. WHEN a configuration reload fails THEN the system SHALL log the error at ERROR level with detailed information
4. IF multiple rapid config changes occur THEN the system SHALL debounce and log only the final reload result

## Non-Functional Requirements

### Performance
- Config file watching SHALL consume less than 1% CPU on average
- Configuration reload SHALL complete within 2 seconds
- Debounce delay for rapid changes SHALL be configurable (default: 500ms)

### Security
- File watching SHALL only monitor user-owned configuration files
- Configuration changes SHALL be validated before applying to prevent injection attacks
- Sensitive configuration (OAuth tokens) SHALL NOT be logged during reload

### Reliability
- The server SHALL continue operating if file watching fails
- Service re-initialization failures SHALL be isolated and not crash the server
- Previous valid configuration SHALL always be preserved as fallback

### Usability
- Hot reload status SHALL be visible via `check_setup_status` tool
- Error messages SHALL be clear and actionable
- Documentation SHALL explain how to enable/disable hot reload
