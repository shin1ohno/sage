/**
 * Sage Skill Implementation
 * Lightweight JavaScript implementation for Claude Skills
 * Works on iOS/iPadOS and Web platforms
 */

// Priority keywords for task analysis
const PRIORITY_KEYWORDS = {
  P0: ['緊急', 'urgent', 'critical', '至急', 'ASAP', '今すぐ', '障害', 'down', 'broken'],
  P1: ['重要', 'important', '優先', 'high priority', 'マネージャー', '上司', '顧客'],
  P2: ['確認', 'review', 'check', '対応', 'respond', 'follow up'],
  P3: ['いつでも', 'whenever', 'eventually', '余裕があれば', 'nice to have'],
};

// Time estimation keywords
const TIME_KEYWORDS = {
  quick: { keywords: ['簡単', 'quick', '確認', 'check', 'review'], minutes: 15 },
  short: { keywords: ['メール', 'email', '返信', 'reply', 'respond'], minutes: 30 },
  medium: { keywords: ['報告', 'report', '資料', 'document', '作成'], minutes: 60 },
  long: { keywords: ['実装', 'implement', '開発', 'develop', '設計'], minutes: 120 },
};

/**
 * Analyze tasks from text input
 */
function analyzeTasks(input) {
  const tasks = extractTasks(input);

  return {
    success: true,
    taskCount: tasks.length,
    tasks: tasks.map(task => ({
      title: task.title,
      priority: determinePriority(task.title),
      estimatedMinutes: estimateTime(task.title),
      stakeholders: extractStakeholders(task.title),
      deadline: task.deadline,
    })),
    summary: formatSummary(tasks),
  };
}

/**
 * Extract individual tasks from text
 */
function extractTasks(text) {
  const tasks = [];
  const lines = text.split(/\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for task indicators
    if (
      trimmed.match(/^[-•*]\s/) ||
      trimmed.match(/^\d+[.)]\s/) ||
      trimmed.match(/^☐|^□|^\[\s*\]/) ||
      trimmed.includes('TODO') ||
      trimmed.includes('タスク')
    ) {
      const title = trimmed
        .replace(/^[-•*]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/^☐|^□|^\[\s*\]/, '')
        .replace(/^TODO:?\s*/i, '')
        .replace(/^タスク:?\s*/, '')
        .trim();

      if (title) {
        tasks.push({
          title,
          deadline: extractDeadline(trimmed),
        });
      }
    }
  }

  // If no structured tasks found, treat each sentence as a task
  if (tasks.length === 0) {
    const sentences = text.split(/[。.！!？?]/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed && trimmed.length > 5) {
        tasks.push({
          title: trimmed,
          deadline: extractDeadline(trimmed),
        });
      }
    }
  }

  return tasks;
}

/**
 * Determine priority based on keywords
 */
function determinePriority(text) {
  const lowerText = text.toLowerCase();

  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return priority;
      }
    }
  }

  return 'P2'; // Default priority
}

/**
 * Estimate time based on keywords
 */
function estimateTime(text) {
  const lowerText = text.toLowerCase();

  for (const { keywords, minutes } of Object.values(TIME_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return minutes;
      }
    }
  }

  return 30; // Default 30 minutes
}

/**
 * Extract stakeholders from text
 */
function extractStakeholders(text) {
  const stakeholders = [];

  // @mention pattern
  const mentions = text.match(/@[\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g);
  if (mentions) {
    stakeholders.push(...mentions.map(m => m.slice(1)));
  }

  // Common role keywords in Japanese
  const rolePatterns = [
    /([^\s,、]+)さん/g,
    /([^\s,、]+)部長/g,
    /([^\s,、]+)課長/g,
    /([^\s,、]+)マネージャー/g,
  ];

  for (const pattern of rolePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && !stakeholders.includes(match[1])) {
        stakeholders.push(match[1]);
      }
    }
  }

  return stakeholders;
}

/**
 * Extract deadline from text
 */
function extractDeadline(text) {
  // Common date patterns
  const patterns = [
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/,
    /(\d{1,2})[月/](\d{1,2})[日]?/,
    /(今日|明日|明後日)/,
    /(月曜|火曜|水曜|木曜|金曜|土曜|日曜)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Format summary for display
 */
function formatSummary(tasks) {
  if (tasks.length === 0) {
    return 'タスクが見つかりませんでした。';
  }

  const priorities = { P0: 0, P1: 0, P2: 0, P3: 0 };
  let totalMinutes = 0;

  for (const task of tasks) {
    const priority = determinePriority(task.title);
    priorities[priority]++;
    totalMinutes += estimateTime(task.title);
  }

  let summary = `📋 ${tasks.length}件のタスクを検出\n\n`;
  summary += `🔴 P0（緊急）: ${priorities.P0}件\n`;
  summary += `🟠 P1（高）: ${priorities.P1}件\n`;
  summary += `🟡 P2（中）: ${priorities.P2}件\n`;
  summary += `🟢 P3（低）: ${priorities.P3}件\n\n`;
  summary += `⏱️ 合計見積時間: ${Math.floor(totalMinutes / 60)}時間${totalMinutes % 60}分`;

  return summary;
}

/**
 * Format task for Apple Reminders (fallback text)
 */
function formatForReminders(options) {
  let text = `📝 Apple Remindersに追加:\n\n`;
  text += `タイトル: ${options.title}\n`;

  if (options.notes) {
    text += `メモ: ${options.notes}\n`;
  }

  if (options.dueDate) {
    text += `期限: ${options.dueDate}\n`;
  }

  if (options.priority) {
    const priorityMap = { high: '高', medium: '中', low: '低' };
    text += `優先度: ${priorityMap[options.priority] || options.priority}\n`;
  }

  return { success: true, text };
}

/**
 * Format task for Notion (fallback text)
 */
function formatForNotion(options) {
  let text = `📋 Notionに追加するタスク\n\n`;
  text += `**タイトル:** ${options.title}\n`;

  if (options.priority) {
    text += `**優先度:** ${options.priority}\n`;
  }

  if (options.deadline) {
    text += `**期限:** ${options.deadline}\n`;
  }

  if (options.estimatedMinutes) {
    text += `**見積時間:** ${options.estimatedMinutes}分\n`;
  }

  if (options.stakeholders && options.stakeholders.length > 0) {
    text += `**関係者:** ${options.stakeholders.join(', ')}\n`;
  }

  text += `\n---\nこのテキストをNotionにコピーしてページを作成してください。`;

  return { success: true, text };
}

// Export for use in Skills environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzeTasks,
    formatForReminders,
    formatForNotion,
    determinePriority,
    estimateTime,
    extractStakeholders,
  };
}

// Make available globally for browser/Skills environment
if (typeof window !== 'undefined') {
  window.sage = {
    analyzeTasks,
    formatForReminders,
    formatForNotion,
    determinePriority,
    estimateTime,
    extractStakeholders,
  };
}
