# Core Specifications

コア機能（タスク分析、優先度エンジン等）に関する仕様。

## Components

| Component | Description | Source |
|-----------|-------------|--------|
| TaskAnalyzer | タスクの包括的分析 | `src/core/task-analyzer.ts` |
| TaskSplitter | 複雑なタスクの分割 | `src/core/task-splitter.ts` |
| PriorityEngine | 優先度判定ロジック | `src/core/priority-engine.ts` |
| TimeEstimator | 所要時間見積もり | `src/core/time-estimator.ts` |
| StakeholderExtractor | 関係者の識別 | `src/core/stakeholder-extractor.ts` |
| SetupWizard | 初回セットアップ | `src/core/setup-wizard.ts` |
| ConfigManager | 設定管理 | `src/config/config-manager.ts` |

## Features

- **Task Analysis**: タスクの自動分析・優先度付け
- **Time Estimation**: 25分単位での時間見積もり
- **Stakeholder Detection**: @mentions、マネージャー検出
- **Task Splitting**: 複雑なタスクの自動分割

## Related Requirements

ルートの `requirements.md` から:
- 要件1: 初期セットアップと設定
- 要件2: タスク分析と優先順位付け
- 要件3: 時間見積もりとスケジューリング
- 要件4: 関係者の識別
- 要件10: 設定管理
- 要件11: タスク分割と整理
- 要件12: TODOリスト管理

## See Also

- [Shared Architecture](../shared/architecture.md)
- [Components Detail](../components.md)
