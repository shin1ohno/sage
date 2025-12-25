# sage (賢者)

AI Task Management Assistant MCP Server for Claude Desktop and Claude Code.

## Features

- **Task Analysis**: Automatic priority assignment (P0-P3), time estimation, stakeholder extraction
- **Task Splitting**: Break complex tasks into actionable subtasks
- **Apple Reminders Integration**: Create reminders via AppleScript (macOS) or native API (iOS/iPadOS)
- **Notion Integration**: Sync long-term tasks (8+ days) to Notion via MCP
- **Calendar Integration**: Find available time slots based on your schedule
- **Smart Routing**: Automatically route tasks to Apple Reminders (≤7 days) or Notion (8+ days)

## Installation

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sage": {
      "command": "npx",
      "args": ["-y", "@shin1ohno/sage"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add sage -- npx -y @shin1ohno/sage
```

### Manual Installation

```bash
npm install -g @shin1ohno/sage
```

## Setup

On first use, sage will guide you through setup:

1. Run `check_setup_status` to see if configuration is needed
2. Run `start_setup_wizard` to begin interactive setup
3. Answer questions about your preferences (name, working hours, team, etc.)
4. Run `save_config` to save your configuration

Configuration is stored at `~/.sage/config.json`.

## Tools

### Setup & Configuration

| Tool | Description |
|------|-------------|
| `check_setup_status` | Check if sage has been configured |
| `start_setup_wizard` | Start the interactive setup wizard |
| `answer_wizard_question` | Answer a setup wizard question |
| `save_config` | Save configuration after setup |
| `update_config` | Update sage configuration |

### Task Management

| Tool | Description |
|------|-------------|
| `analyze_tasks` | Analyze tasks for priority, time estimation, and stakeholders |
| `set_reminder` | Set a reminder in Apple Reminders or Notion |
| `find_available_slots` | Find available time slots in calendar |
| `sync_to_notion` | Sync a task to Notion database |

## Example Usage

### Analyze Tasks

```
analyze_tasks with tasks:
- title: "Review PR from Alice"
  deadline: "2025-01-02T17:00:00"
- title: "Prepare quarterly report"
  description: "Q4 summary for manager"
```

### Set Reminder

```
set_reminder with:
- taskTitle: "Submit expense report"
- dueDate: "2025-01-03T12:00:00"
- priority: "P1"
```

### Find Available Slots

```
find_available_slots with:
- durationMinutes: 60
- preferDeepWork: true
```

## Platform Support

| Platform | Apple Reminders | Calendar | Notion |
|----------|----------------|----------|--------|
| macOS | AppleScript | AppleScript | MCP |
| iOS/iPadOS | Native API | Native API | Fallback |
| Windows/Linux | Fallback text | Manual input | MCP |

## Configuration

Example `~/.sage/config.json`:

```json
{
  "user": {
    "name": "Your Name",
    "timezone": "Asia/Tokyo"
  },
  "calendar": {
    "workingHours": {
      "start": "09:00",
      "end": "18:00"
    },
    "deepWorkDays": ["Tuesday", "Thursday"],
    "meetingHeavyDays": ["Monday", "Friday"]
  },
  "integrations": {
    "appleReminders": {
      "enabled": true,
      "defaultList": "Reminders"
    },
    "notion": {
      "enabled": true,
      "databaseId": "your-database-id",
      "threshold": 8
    }
  }
}
```

## Requirements

- Node.js >= 18.0.0
- macOS (for Apple Reminders/Calendar integration)
- Notion MCP server (for Notion integration)

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build
npm run build
```

## License

MIT
