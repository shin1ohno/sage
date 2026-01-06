# Implementation Plan: Hot Config Reload

## Task Overview

Hot Config Reload機能を実装するためのタスク一覧です。設計ドキュメントに基づき、以下の順序で実装を進めます：

1. 基盤コンポーネント（型定義、差分計算）
2. ファイル監視（ConfigWatcher）
3. サービス管理（ServiceRegistry、ReloadableService）
4. リロードオーケストレーション（ConfigReloadService）
5. 既存サービスのアダプター実装
6. MCPツール統合
7. エントリーポイント統合
8. テスト実装

## Steering Document Compliance

- **structure.md**: 新規ファイルは`src/config/`、`src/services/`、`tests/`に配置
- **tech.md**: TypeScript strict mode、Zod検証、pino logging使用

## Atomic Task Requirements

各タスクは以下の基準を満たします：
- **File Scope**: 1-3ファイル
- **Time Boxing**: 15-30分
- **Single Purpose**: 1つのテスト可能な成果
- **Specific Files**: 具体的なファイルパス指定
- **Agent-Friendly**: 明確な入出力

## Task Format Guidelines

- Use checkbox format: `- [ ] Task number. Task description`
- **Specify files**: Always include exact file paths to create/modify
- **Include implementation details** as bullet points
- Reference requirements using: `_Requirements: X.Y_`
- Reference existing code to leverage using: `_Leverage: path/to/file.ts_`

## Tasks

### Phase 1: Foundation

- [x] 1. Create hot reload type definitions in src/types/hot-reload.ts
  - File: `src/types/hot-reload.ts`
  - Define `ReloadResult`, `WatcherState`, `ReloadStatus` interfaces
  - Define `ReloadableService` interface
  - Define `ConfigWatcherOptions`, `ConfigReloadServiceOptions` interfaces
  - Export all types for use by other modules
  - _Leverage: src/types/config.ts for UserConfig type reference_
  - _Requirements: 3.1, 4.4, 6.2_

- [x] 2. Create ConfigDiffer utility in src/config/config-differ.ts
  - File: `src/config/config-differ.ts`
  - Implement `ConfigDiff` interface with changedSections, addedKeys, removedKeys, modifiedKeys
  - Implement `diffConfig(oldConfig, newConfig)` function using deep comparison
  - Implement `hasSignificantChanges(diff)` helper function
  - Handle nested object comparison for all config sections
  - _Leverage: src/types/config.ts for UserConfig structure_
  - _Requirements: 3.1, 6.2_

- [x] 3. Create ConfigDiffer unit tests in tests/unit/config/config-differ.test.ts
  - File: `tests/unit/config/config-differ.test.ts`
  - Test section change detection (user, calendar, integrations, etc.)
  - Test nested object diff handling
  - Test empty config edge cases
  - Test hasSignificantChanges function
  - _Leverage: tests/helpers/mock-config.ts for test fixtures_
  - _Requirements: 3.1_

### Phase 2: File Watching

- [x] 4. Create ConfigWatcher class skeleton in src/config/config-watcher.ts
  - File: `src/config/config-watcher.ts`
  - Implement ConfigWatcher extending EventEmitter
  - Define constructor with ConfigWatcherOptions
  - Watch both `~/.sage/config.json` AND `~/.sage/remote-config.json` paths
  - Implement `isWatching()` getter
  - _Leverage: src/config/loader.ts for getConfigPath(), src/cli/remote-config-loader.ts for getRemoteConfigPath()_
  - _Requirements: 1.1, 5.1_

- [x] 5. Implement ConfigWatcher start/stop methods in src/config/config-watcher.ts
  - File: `src/config/config-watcher.ts` (continue from task 4)
  - Implement `start()` method using fs.watch with error handling
  - Implement `stop()` method to close watchers
  - Emit 'error' event on watch failures
  - _Leverage: src/utils/logger.ts for pino logging_
  - _Requirements: 1.4_

- [x] 6. Implement ConfigWatcher debounce and file handling in src/config/config-watcher.ts
  - File: `src/config/config-watcher.ts` (continue from task 5)
  - Implement debounce logic (default 500ms, configurable)
  - Emit 'change' event with file path after debounce
  - Handle file deletion (log warning, continue with current config)
  - Handle file recreation (resume watching)
  - _Leverage: src/utils/logger.ts for pino logging_
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 7. Create ConfigWatcher unit tests in tests/unit/config/config-watcher.test.ts
  - File: `tests/unit/config/config-watcher.test.ts`
  - Test debounce behavior with mocked timers (jest.useFakeTimers)
  - Test start/stop lifecycle
  - Test event emission (change, error)
  - Test file deletion handling
  - Mock fs.watch for unit testing
  - _Leverage: tests/helpers/mock-fs.ts for file system mocking_
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

### Phase 3: Service Management

- [x] 8. Create ServiceRegistry class in src/services/service-registry.ts
  - File: `src/services/service-registry.ts`
  - Implement `register(service: ReloadableService)` method
  - Implement `unregister(name: string)` method
  - Implement `getServicesForSections(sections: string[])` method
  - Implement `reinitializeForSections(sections, config)` with sequential execution
  - Implement `shutdownAll()` for graceful shutdown
  - Add logging for service lifecycle events
  - _Leverage: src/types/hot-reload.ts for ReloadableService interface, src/utils/logger.ts_
  - _Requirements: 3.1, 3.5_

- [x] 9. Create ServiceRegistry unit tests in tests/unit/services/service-registry.test.ts
  - File: `tests/unit/services/service-registry.test.ts`
  - Test service registration and unregistration
  - Test getServicesForSections filtering logic
  - Test reinitializeForSections execution order
  - Test shutdownAll behavior
  - Test error isolation during re-initialization
  - _Leverage: tests/helpers/mock-services.ts for mock ReloadableService_
  - _Requirements: 3.1, 3.5_

### Phase 4: Reload Orchestration

- [x] 10. Create ConfigReloadService class skeleton in src/config/config-reload-service.ts
  - File: `src/config/config-reload-service.ts`
  - Define class with constructor accepting ConfigWatcher and ServiceRegistry
  - Store dependencies and current config state
  - Implement `start()` to subscribe to watcher 'change' events
  - Implement `stop()` to unsubscribe and stop watcher
  - Implement `isAutoReloadEnabled()` getter
  - _Leverage: src/config/loader.ts for ConfigLoader patterns_
  - _Requirements: 1.1_

- [x] 11. Implement ConfigReloadService reload() method in src/config/config-reload-service.ts
  - File: `src/config/config-reload-service.ts` (continue from task 10)
  - Implement `reload()` with config loading via ConfigLoader.load()
  - Add validation using existing Zod schemas
  - Calculate diff using ConfigDiffer
  - Call serviceRegistry.reinitializeForSections() for changed sections
  - Update internal current config state
  - Return ReloadResult with details
  - _Leverage: src/config/config-differ.ts, src/config/validation.ts_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1_

- [x] 12. Add reload lock mechanism to ConfigReloadService in src/config/config-reload-service.ts
  - File: `src/config/config-reload-service.ts` (continue from task 11)
  - Add private `isReloading` flag
  - Add pending reload queue (Promise-based)
  - Implement `getLastReloadResult()` getter
  - Add comprehensive logging for reload lifecycle
  - _Leverage: src/utils/logger.ts for pino logging_
  - _Requirements: 4.3_

- [x] 13. Create ConfigReloadService unit tests in tests/unit/config/config-reload-service.test.ts
  - File: `tests/unit/config/config-reload-service.test.ts`
  - Test successful reload flow
  - Test validation failure handling (keep previous config)
  - Test JSON parse error handling
  - Test reload lock behavior (concurrent reload prevention)
  - Test service re-initialization ordering
  - Mock ConfigLoader, ConfigWatcher, ServiceRegistry
  - _Leverage: tests/helpers/mock-config.ts, tests/helpers/mock-services.ts_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 4.3_

### Phase 5: Reloadable Service Adapters

- [x] 14. Create ReloadableCalendarSourceManager adapter in src/services/reloadable/calendar-source-manager-adapter.ts
  - File: `src/services/reloadable/calendar-source-manager-adapter.ts`
  - Implement ReloadableService interface
  - Set `name = 'CalendarSourceManager'`
  - Set `dependsOnSections = ['integrations', 'calendar']`
  - Implement `shutdown()` to clean up existing instance
  - Implement `reinitialize(config)` to create new CalendarSourceManager instance
  - Provide getter for current instance
  - _Leverage: src/integrations/calendar-source-manager.ts, src/types/hot-reload.ts_
  - _Requirements: 3.2_

- [x] 15. Create ReloadableReminderManager adapter in src/services/reloadable/reminder-manager-adapter.ts
  - File: `src/services/reloadable/reminder-manager-adapter.ts`
  - Implement ReloadableService interface
  - Set `name = 'ReminderManager'`
  - Set `dependsOnSections = ['integrations', 'reminders']`
  - Implement `shutdown()` and `reinitialize(config)` methods
  - Provide getter for current instance
  - _Leverage: src/integrations/reminder-manager.ts, src/types/hot-reload.ts_
  - _Requirements: 3.2_

- [x] 16. Create ReloadableWorkingCadenceService adapter in src/services/reloadable/working-cadence-adapter.ts
  - File: `src/services/reloadable/working-cadence-adapter.ts`
  - Implement ReloadableService interface
  - Set `name = 'WorkingCadenceService'`
  - Set `dependsOnSections = ['calendar']`
  - Implement `shutdown()` and `reinitialize(config)` methods
  - Handle CalendarSourceManager dependency during reinitialize
  - _Leverage: src/services/working-cadence.ts, src/types/hot-reload.ts_
  - _Requirements: 3.3_

- [x] 17. Create ReloadableNotionService adapter in src/services/reloadable/notion-service-adapter.ts
  - File: `src/services/reloadable/notion-service-adapter.ts`
  - Implement ReloadableService interface
  - Set `name = 'NotionMCPService'`
  - Set `dependsOnSections = ['integrations']`
  - Implement `shutdown()` and `reinitialize(config)` methods
  - _Leverage: src/integrations/notion-mcp.ts, src/types/hot-reload.ts_
  - _Requirements: 3.2_

- [x] 18. Create ReloadableTodoListManager adapter in src/services/reloadable/todo-list-manager-adapter.ts
  - File: `src/services/reloadable/todo-list-manager-adapter.ts`
  - Implement ReloadableService interface
  - Set `name = 'TodoListManager'`
  - Set `dependsOnSections = ['integrations']`
  - Implement `shutdown()` and `reinitialize(config)` methods
  - _Leverage: src/integrations/todo-list-manager.ts, src/types/hot-reload.ts_
  - _Requirements: 3.2_

- [x] 19. Create ReloadablePriorityEngine adapter in src/services/reloadable/priority-engine-adapter.ts
  - File: `src/services/reloadable/priority-engine-adapter.ts`
  - Implement ReloadableService interface
  - Set `name = 'PriorityEngine'`
  - Set `dependsOnSections = ['priorityRules']`
  - Implement `shutdown()` (no-op for stateless engine)
  - Implement `reinitialize(config)` to update priority rules reference
  - _Leverage: src/utils/priority.ts, src/types/hot-reload.ts_
  - _Requirements: 3.4_

- [x] 20. Create adapter barrel export in src/services/reloadable/index.ts
  - File: `src/services/reloadable/index.ts`
  - Export all reloadable service adapters
  - Create `createAllReloadableAdapters(services)` factory function
  - _Leverage: All adapter files from tasks 14-19_
  - _Requirements: 3.2_

- [x] 21. Create adapter unit tests in tests/unit/services/reloadable/adapters.test.ts
  - File: `tests/unit/services/reloadable/adapters.test.ts`
  - Test each adapter's shutdown and reinitialize methods
  - Test dependsOnSections correctness
  - Mock underlying service implementations
  - _Leverage: tests/helpers/mock-services.ts_
  - _Requirements: 3.2, 3.3, 3.4_

### Phase 6: MCP Tool Integration

- [x] 22. Add reload_config MCP tool definition in src/index.ts
  - File: `src/index.ts` (modify existing)
  - Add `reload_config` tool to server.setRequestHandler for 'tools/list' (around line 130-200)
  - Define inputSchema with optional `force` boolean parameter
  - _Leverage: Existing MCP tool definitions in src/index.ts (e.g., analyze_tasks, set_reminder)_
  - _Requirements: 4.2_

- [x] 23. Create reload_config tool handler in src/tools/config/reload-handler.ts
  - File: `src/tools/config/reload-handler.ts`
  - Implement handler function for reload_config tool
  - Call ConfigReloadService.reload()
  - Return formatted ReloadResult with success/failure details
  - Log reload request and result
  - _Leverage: src/config/config-reload-service.ts, src/tools/integrations/handlers.ts for handler patterns_
  - _Requirements: 4.2, 4.4_

- [x] 24. Update check_setup_status to include hot reload status in src/tools/integrations/handlers.ts
  - File: `src/tools/integrations/handlers.ts` (modify existing)
  - Locate `checkSetupStatus` function (around line 30-100)
  - Add `hotReload` section to response object
  - Include enabled, watching, lastReload fields
  - Get status from ConfigReloadService via context
  - _Leverage: Existing checkSetupStatus function, src/types/hot-reload.ts_
  - _Requirements: 6.2, Non-functional Usability_

- [x] 25. Create reload_config tool tests in tests/unit/tools/reload-config.test.ts
  - File: `tests/unit/tools/reload-config.test.ts`
  - Test successful reload via tool
  - Test reload failure handling
  - Test force parameter behavior
  - Mock ConfigReloadService
  - _Leverage: tests/helpers/mock-services.ts_
  - _Requirements: 4.2, 4.4_

### Phase 7: Signal and Entry Point Integration

- [x] 26. Add SIGHUP signal handler in src/cli/signal-handler.ts
  - File: `src/cli/signal-handler.ts`
  - Create `setupSignalHandlers(configReloadService)` function
  - Handle SIGHUP to trigger config reload
  - Log signal receipt and reload result
  - Handle graceful shutdown on SIGTERM/SIGINT
  - _Leverage: src/config/config-reload-service.ts, src/utils/logger.ts_
  - _Requirements: 4.1_

- [x] 27. Add environment variable support in src/config/hot-reload-config.ts
  - File: `src/config/hot-reload-config.ts`
  - Read `SAGE_DISABLE_HOT_RELOAD` environment variable
  - Read `SAGE_HOT_RELOAD_DEBOUNCE` environment variable
  - Export `getHotReloadConfig()` function
  - _Leverage: process.env, src/types/hot-reload.ts_
  - _Requirements: Non-functional Performance (debounce configurable)_

- [x] 28. Create ServiceRegistry and register adapters in src/index.ts (stdio transport)
  - File: `src/index.ts` (modify existing)
  - Import ServiceRegistry and reloadable adapters
  - Create ServiceRegistry instance in `main()` function (around line 190-220)
  - Create adapter instances using existing services
  - Register all adapters with ServiceRegistry
  - _Leverage: src/services/service-registry.ts, src/services/reloadable/index.ts_
  - _Requirements: 3.1_

- [x] 29. Create and start ConfigReloadService in src/index.ts (stdio transport)
  - File: `src/index.ts` (modify existing, continue from task 28)
  - Create ConfigWatcher instance with hot reload config
  - Create ConfigReloadService with watcher and registry
  - Start ConfigReloadService after initial service setup
  - Call setupSignalHandlers with reload service
  - _Leverage: src/config/config-watcher.ts, src/config/config-reload-service.ts, src/cli/signal-handler.ts_
  - _Requirements: 1.1, 4.1_

- [x] 30. Update context factory to use reloadable instances in src/index.ts
  - File: `src/index.ts` (modify existing, continue from task 29)
  - Update service getters in context factory to return adapter instances
  - Add ConfigReloadService to context for tool handlers
  - _Leverage: Existing context factory pattern in src/index.ts (around line 220-280)_
  - _Requirements: 3.1_

- [x] 31. Create ServiceRegistry and register adapters in src/cli/mcp-handler.ts (HTTP transport)
  - File: `src/cli/mcp-handler.ts` (modify existing)
  - Import ServiceRegistry and reloadable adapters
  - Create ServiceRegistry instance in `initialize()` method (around line 150-170)
  - Register all adapters
  - _Leverage: src/services/service-registry.ts, src/services/reloadable/index.ts_
  - _Requirements: 3.1, 5.3_

- [x] 32. Create and start ConfigReloadService in src/cli/mcp-handler.ts (HTTP transport)
  - File: `src/cli/mcp-handler.ts` (modify existing, continue from task 31)
  - Create ConfigReloadService in `initialize()` method
  - Start watching after initialization
  - Update service getters to use reloadable instances
  - _Leverage: src/config/config-reload-service.ts_
  - _Requirements: 1.1, 5.3_

### Phase 8: Integration and E2E Tests

- [x] 33. Create integration tests for config reload flow in tests/integration/config-reload.test.ts
  - File: `tests/integration/config-reload.test.ts`
  - Test end-to-end reload with real ConfigLoader
  - Test service re-initialization verification
  - Test config persistence after reload
  - Test multiple reload cycles
  - Use temp config files for isolation
  - _Leverage: tests/helpers/temp-file.ts, fs/promises_
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 34. Create integration tests for file watcher in tests/integration/config-watcher.test.ts
  - File: `tests/integration/config-watcher.test.ts`
  - Test real file system watching with temp files
  - Test file deletion and recreation scenarios
  - Test debounce behavior with real timers
  - _Leverage: tests/helpers/temp-file.ts, fs/promises_
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 35. Create E2E tests for reload_config MCP tool in tests/e2e/reload-config-tool.test.ts
  - File: `tests/e2e/reload-config-tool.test.ts`
  - Test reload_config tool invocation via MCP protocol
  - Test status reporting via check_setup_status
  - Test error message formatting
  - _Leverage: tests/e2e/mcp-over-http.test.ts for MCP E2E patterns_
  - _Requirements: 4.2, 4.4, 6.2_

### Phase 9: Documentation

- [x] 36. Update CONFIGURATION.md with hot reload documentation
  - File: `docs/CONFIGURATION.md` (modify existing)
  - Add "Hot Reload" section explaining the feature
  - Document environment variables (SAGE_DISABLE_HOT_RELOAD, SAGE_HOT_RELOAD_DEBOUNCE)
  - Document SIGHUP signal usage for manual reload
  - Document reload_config MCP tool usage
  - _Leverage: Existing documentation patterns in docs/_
  - _Requirements: Non-functional Usability_

## Task Dependencies

```
Phase 1: [1] → [2] → [3]
Phase 2: [1] → [4] → [5] → [6] → [7]
Phase 3: [1] → [8] → [9]
Phase 4: [2, 6, 8] → [10] → [11] → [12] → [13]
Phase 5: [1, 8] → [14, 15, 16, 17, 18, 19] → [20] → [21]
Phase 6: [12, 20] → [22, 23, 24] → [25]
Phase 7: [12, 20] → [26, 27] → [28] → [29] → [30]
                             → [31] → [32]
Phase 8: [30, 32] → [33, 34, 35]
Phase 9: [All above] → [36]
```

## Summary

- **Total Tasks**: 36
- **Foundation Tasks**: 3 (Phase 1)
- **File Watching Tasks**: 4 (Phase 2)
- **Service Management Tasks**: 2 (Phase 3)
- **Reload Orchestration Tasks**: 4 (Phase 4)
- **Adapter Tasks**: 8 (Phase 5)
- **MCP Tool Tasks**: 4 (Phase 6)
- **Integration Tasks**: 7 (Phase 7)
- **Testing Tasks**: 3 (Phase 8)
- **Documentation Tasks**: 1 (Phase 9)
