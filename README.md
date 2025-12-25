# sage (賢者)

AI Task Management Assistant - MCP Server for Claude Desktop, Claude Code, and Remote clients.

[![npm version](https://badge.fury.io/js/@shin1ohno%2Fsage.svg)](https://www.npmjs.com/package/@shin1ohno/sage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

sage is an intelligent task management assistant that helps you:

- **Analyze tasks** - Automatically assign priorities (P0-P3), estimate time, and extract stakeholders
- **Split complex tasks** - Break down large tasks into actionable subtasks
- **Smart routing** - Route tasks to Apple Reminders (≤7 days) or Notion (8+ days)
- **Calendar awareness** - Find available time slots based on your schedule

## Quick Start

### For Claude Desktop / Claude Code (Local MCP)

```bash
# Claude Code - one command setup
claude mcp add sage -- npx -y @shin1ohno/sage
```

For Claude Desktop, see [Local MCP Setup Guide](docs/SETUP-LOCAL.md).

### For iOS / iPadOS / Web (Remote MCP)

See [Remote MCP Setup Guide](docs/SETUP-REMOTE.md).

## Documentation

| Document | Description |
|----------|-------------|
| [Local MCP Setup](docs/SETUP-LOCAL.md) | Step-by-step guide for Claude Desktop/Code |
| [Remote MCP Setup](docs/SETUP-REMOTE.md) | Step-by-step guide for iOS/iPadOS/Web |
| [Configuration Guide](docs/CONFIGURATION.md) | Detailed configuration options |
| [Architecture](docs/ARCHITECTURE.md) | System design and components |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and solutions |

## Features

### Task Analysis

Analyze text input (emails, meeting notes, etc.) and get structured task information:

```
User: analyze_tasks with input: "田中さんからの依頼: 明日までに報告書を提出。来週の会議資料も準備してください。"

sage:
  Task 1: 報告書を提出
  - Priority: P0 (due tomorrow)
  - Estimated: 50 minutes
  - Stakeholder: 田中さん

  Task 2: 会議資料を準備
  - Priority: P2 (due next week)
  - Estimated: 90 minutes
```

### Smart Reminder Routing

Tasks are automatically routed to the appropriate system:

| Deadline | Destination | Reason |
|----------|-------------|--------|
| ≤ 7 days | Apple Reminders | Short-term, actionable |
| 8+ days | Notion | Long-term planning |

### Platform Support

| Platform | Apple Reminders | Calendar | Notion |
|----------|----------------|----------|--------|
| macOS (Desktop/Code) | AppleScript | AppleScript | MCP |
| iOS/iPadOS (Remote) | Remote MCP | Remote MCP | Remote MCP |
| Web (Remote) | Remote MCP | Remote MCP | Remote MCP |

## Tools

### Setup & Configuration

| Tool | Description |
|------|-------------|
| `check_setup_status` | Check if sage is configured |
| `start_setup_wizard` | Start interactive setup |
| `save_config` | Save configuration |
| `update_config` | Update configuration |

### Task Management

| Tool | Description |
|------|-------------|
| `analyze_tasks` | Analyze tasks for priority, time, stakeholders |
| `set_reminder` | Create a reminder |
| `list_todos` | List all tasks from all sources |
| `update_task_status` | Update task status |
| `find_available_slots` | Find free time in calendar |
| `sync_to_notion` | Sync task to Notion |

## Requirements

- Node.js >= 18.0.0
- macOS (for Apple Reminders/Calendar via AppleScript)
- Notion MCP server (optional, for Notion integration)

## Development

```bash
# Clone repository
git clone https://github.com/shin1ohno/sage.git
cd sage

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

MIT - see [LICENSE](LICENSE) for details.
