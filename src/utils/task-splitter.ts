/**
 * Task Splitter
 * Splits complex tasks or multiple tasks into manageable pieces
 * Requirements: 11.1-11.6
 */

import type {
  Task,
  SubTask,
  SplitResult,
  ComplexityAnalysis,
  TaskDependency,
} from '../types/index.js';

// Patterns that indicate multiple tasks
const MULTI_TASK_PATTERNS = [
  /(?:^|\n)\s*[-•*]\s+/g, // Bullet points
  /(?:^|\n)\s*\d+[.)]\s+/g, // Numbered lists
  /(?:そして|また|さらに|加えて|それから)/g, // Japanese conjunctions
  /(?:and then|also|additionally|furthermore|moreover)/gi, // English conjunctions
  /[。.]\s*(?=[^。.]+[。.])/g, // Sentence boundaries with more content
];

// Keywords indicating complex tasks
const COMPLEXITY_KEYWORDS = {
  project: [
    'システム',
    'アーキテクチャ',
    '設計',
    '構築',
    'プロジェクト',
    'system',
    'architecture',
    'design',
    'build',
    'project',
    'develop',
    '開発',
  ],
  complex: [
    'リファクタ',
    '統合',
    '移行',
    'マイグレーション',
    '最適化',
    'refactor',
    'integrate',
    'migrate',
    'migration',
    'optimize',
    'implement',
    '実装',
  ],
  medium: [
    '修正',
    '更新',
    '変更',
    '追加',
    '作成',
    'fix',
    'update',
    'change',
    'add',
    'create',
    'modify',
  ],
  simple: [
    '確認',
    'レビュー',
    'チェック',
    '読む',
    '返信',
    'confirm',
    'review',
    'check',
    'read',
    'reply',
    'send',
    '送信',
  ],
};

/**
 * Dependency indicator keywords for detecting task relationships.
 * Used by inferDependencies to detect sequential task ordering.
 */
const DEPENDENCY_KEYWORDS = {
  before: ['前に', '先に', 'まず', 'before', 'first', 'prior to'],
  after: ['後に', '次に', 'その後', 'after', 'then', 'following'],
  requires: ['必要', '依存', 'requires', 'depends on', 'needs'],
};

/**
 * TaskSplitter - Decomposes complex tasks into manageable units
 *
 * ## Algorithm Overview
 *
 * The splitter uses a multi-pass approach:
 *
 * 1. **Line Detection**: Parses input for list items (bullets, numbers)
 * 2. **Conjunction Splitting**: Falls back to splitting on conjunctions
 *    (そして, また, and then, also, etc.)
 * 3. **Complexity Analysis**: For single tasks, analyzes keywords to
 *    determine if the task should be split into phases
 * 4. **Dependency Inference**: Detects task relationships using
 *    keywords like "after", "requires", "次に"
 * 5. **Order Calculation**: Performs topological sort based on dependencies
 *
 * ## Complexity Levels
 *
 * Tasks are classified into four complexity levels:
 * - **simple**: Quick tasks (confirm, review, check)
 * - **medium**: Standard development tasks (fix, update, create)
 * - **complex**: Multi-step tasks (refactor, integrate, migrate)
 * - **project**: Large-scale work (system, architecture, build)
 *
 * @example
 * // Split a complex task
 * const result = TaskSplitter.splitTasks('システム設計を行う');
 * // Returns suggested phases: 要件定義, 設計, 実装, テスト, デプロイ
 *
 * @example
 * // Split multiple tasks from bullet list
 * const result = TaskSplitter.splitTasks(`
 *   - メール確認
 *   - レポート作成
 *   - 会議参加
 * `);
 * // Returns 3 separate tasks with sequential dependencies
 */
export class TaskSplitter {
  /**
   * Split input text into individual tasks
   * Requirement: 11.1, 11.4
   */
  static splitTasks(input: string): SplitResult {
    // Handle empty or whitespace-only input
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      return {
        originalInput: input,
        splitTasks: [],
        splitReason: '入力が空です',
        recommendedOrder: [],
        dependencies: [],
      };
    }

    const tasks: Task[] = [];
    const lines = this.splitIntoLines(trimmedInput);

    if (lines.length === 1 && !this.containsMultipleTasks(trimmedInput)) {
      // Single task - check if it needs complexity-based splitting
      const task: Task = { title: input.trim() };
      const complexity = this.analyzeComplexity(task);

      if (complexity.isComplex && complexity.suggestedSplits) {
        return {
          originalInput: input,
          splitTasks: complexity.suggestedSplits,
          splitReason: complexity.reasoning,
          recommendedOrder: complexity.suggestedSplits.map((_, i) => i),
          dependencies: this.inferDependencies(complexity.suggestedSplits),
        };
      }

      return {
        originalInput: input,
        splitTasks: [task],
        splitReason: 'シンプルなタスクのため分割不要',
        recommendedOrder: [0],
        dependencies: [],
      };
    }

    // Multiple lines/tasks detected
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        tasks.push({ title: trimmed });
      }
    }

    const dependencies = this.inferDependencies(tasks);
    const recommendedOrder = this.calculateRecommendedOrder(tasks, dependencies);

    return {
      originalInput: input,
      splitTasks: tasks,
      splitReason: `${tasks.length}個のタスクを検出しました`,
      recommendedOrder,
      dependencies,
    };
  }

  /**
   * Analyze task complexity
   * Requirement: 11.2, 11.3
   */
  static analyzeComplexity(task: Task): ComplexityAnalysis {
    const text = `${task.title} ${task.description ?? ''}`.toLowerCase();

    // Check for project-level complexity
    if (COMPLEXITY_KEYWORDS.project.some((k) => text.includes(k.toLowerCase()))) {
      return {
        isComplex: true,
        complexity: 'project',
        suggestedSplits: this.suggestProjectSplits(task),
        reasoning: 'プロジェクトレベルのタスクです。複数のフェーズに分割することを推奨します。',
      };
    }

    // Check for complex tasks
    if (COMPLEXITY_KEYWORDS.complex.some((k) => text.includes(k.toLowerCase()))) {
      return {
        isComplex: true,
        complexity: 'complex',
        suggestedSplits: this.suggestComplexSplits(task),
        reasoning: '複雑なタスクです。より小さなステップに分割することを推奨します。',
      };
    }

    // Check for medium tasks
    if (COMPLEXITY_KEYWORDS.medium.some((k) => text.includes(k.toLowerCase()))) {
      return {
        isComplex: false,
        complexity: 'medium',
        reasoning: '中程度の複雑さのタスクです。そのまま実行可能です。',
      };
    }

    // Simple task
    return {
      isComplex: false,
      complexity: 'simple',
      reasoning: 'シンプルなタスクです。分割は不要です。',
    };
  }

  /**
   * Split input into individual lines/items
   */
  private static splitIntoLines(input: string): string[] {
    const results: string[] = [];
    let hasListItems = false;

    // Split by newlines first to process each line
    const lines = input.split('\n');

    // Track if we're in a list context
    let currentNonListText = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check for numbered list item (1. or 1))
      const numberedMatch = trimmedLine.match(/^\d+[.)]\s+(.+)/);
      if (numberedMatch) {
        hasListItems = true;
        // Save any accumulated non-list text
        if (currentNonListText.trim()) {
          results.push(currentNonListText.trim());
          currentNonListText = '';
        }
        results.push(numberedMatch[1].trim());
        continue;
      }

      // Check for bullet point (-, *, •)
      const bulletMatch = trimmedLine.match(/^[-•*]\s+(.+)/);
      if (bulletMatch) {
        hasListItems = true;
        // Save any accumulated non-list text
        if (currentNonListText.trim()) {
          results.push(currentNonListText.trim());
          currentNonListText = '';
        }
        results.push(bulletMatch[1].trim());
        continue;
      }

      // Skip section headers and empty lines
      if (trimmedLine === '' || trimmedLine.endsWith(':') || trimmedLine.endsWith('：')) {
        continue;
      }

      // Accumulate non-list text
      currentNonListText += ' ' + trimmedLine;
    }

    // Add any remaining non-list text
    if (currentNonListText.trim()) {
      results.push(currentNonListText.trim());
    }

    // If we found list items, return results
    if (hasListItems && results.length > 0) {
      return results;
    }

    // No list items found, try other splitting methods

    // Try splitting by Japanese conjunctions
    const conjunctionSplit = input.split(/(?:そして|また|さらに|加えて|それから)/);
    if (conjunctionSplit.length > 1) {
      return conjunctionSplit.map((s) => s.trim()).filter(Boolean);
    }

    // Try splitting by newlines (for plain text with multiple lines)
    const newlineSplit = input.split('\n').map((s) => s.trim()).filter(Boolean);
    if (newlineSplit.length > 1) {
      return newlineSplit;
    }

    // Return the entire input as a single item
    return [input];
  }

  /**
   * Check if input contains multiple tasks
   */
  private static containsMultipleTasks(input: string): boolean {
    return MULTI_TASK_PATTERNS.some((pattern) => {
      const matches = input.match(pattern);
      return matches && matches.length > 1;
    });
  }

  /**
   * Suggest splits for project-level tasks
   */
  private static suggestProjectSplits(task: Task): SubTask[] {
    return [
      {
        title: `${task.title} - 要件定義と計画`,
        order: 0,
        status: 'not_started',
      },
      {
        title: `${task.title} - 設計とアーキテクチャ`,
        order: 1,
        status: 'not_started',
      },
      {
        title: `${task.title} - 実装`,
        order: 2,
        status: 'not_started',
      },
      {
        title: `${task.title} - テストと検証`,
        order: 3,
        status: 'not_started',
      },
      {
        title: `${task.title} - デプロイとドキュメント`,
        order: 4,
        status: 'not_started',
      },
    ];
  }

  /**
   * Suggest splits for complex tasks
   */
  private static suggestComplexSplits(task: Task): SubTask[] {
    return [
      {
        title: `${task.title} - 調査と準備`,
        order: 0,
        status: 'not_started',
      },
      {
        title: `${task.title} - 実装`,
        order: 1,
        status: 'not_started',
      },
      {
        title: `${task.title} - 確認とテスト`,
        order: 2,
        status: 'not_started',
      },
    ];
  }

  /**
   * Infer dependencies between tasks from their text content
   *
   * Uses keyword detection to find task relationships:
   * - "after" keywords (後に, 次に, then) → depends on previous task
   * - "requires" keywords (必要, 依存) → scans for title references
   *
   * If no explicit dependencies found, assumes sequential ordering
   * (task N depends on task N-1) to ensure predictable execution.
   *
   * Note: Only references previous tasks (j < i), preventing cycles.
   *
   * @param tasks - Array of tasks to analyze
   * @returns Dependency graph as array of TaskDependency objects
   */
  private static inferDependencies(tasks: Task[]): TaskDependency[] {
    const dependencies: TaskDependency[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const text = `${task.title} ${task.description ?? ''}`.toLowerCase();

      const dependsOn: number[] = [];

      // Check for explicit dependency keywords
      for (const [type, keywords] of Object.entries(DEPENDENCY_KEYWORDS)) {
        if (keywords.some((k) => text.includes(k.toLowerCase()))) {
          if (type === 'after' && i > 0) {
            dependsOn.push(i - 1);
          }
          if (type === 'requires' && i > 0) {
            // Look for references to previous tasks
            for (let j = 0; j < i; j++) {
              const prevTitle = tasks[j].title.toLowerCase();
              if (text.includes(prevTitle.substring(0, 10))) {
                dependsOn.push(j);
              }
            }
          }
        }
      }

      if (dependsOn.length > 0) {
        dependencies.push({
          taskIndex: i,
          dependsOn,
          type: 'sequential',
        });
      }
    }

    // If no explicit dependencies found, assume sequential order
    if (dependencies.length === 0 && tasks.length > 1) {
      for (let i = 1; i < tasks.length; i++) {
        dependencies.push({
          taskIndex: i,
          dependsOn: [i - 1],
          type: 'sequential',
        });
      }
    }

    return dependencies;
  }

  /**
   * Calculate recommended execution order via topological sort
   *
   * Implements Kahn's algorithm variant:
   * 1. Find all tasks with satisfied dependencies (or no dependencies)
   * 2. Add them to the execution order
   * 3. Mark as completed
   * 4. Repeat until all tasks are ordered
   *
   * Guarantees: No circular dependencies possible since inferDependencies
   * only creates forward references (task i depends on tasks < i).
   *
   * @param tasks - Array of tasks to order
   * @param dependencies - Dependency graph from inferDependencies
   * @returns Array of task indices in recommended execution order
   */
  private static calculateRecommendedOrder(
    tasks: Task[],
    dependencies: TaskDependency[]
  ): number[] {
    const order: number[] = [];
    const completed = new Set<number>();

    // Note: Circular dependencies cannot occur with current inferDependencies
    // implementation as it only references previous tasks
    while (order.length < tasks.length) {
      for (let i = 0; i < tasks.length; i++) {
        if (completed.has(i)) continue;

        const dep = dependencies.find((d) => d.taskIndex === i);
        if (!dep || dep.dependsOn.every((d) => completed.has(d))) {
          order.push(i);
          completed.add(i);
        }
      }
    }

    return order;
  }
}
