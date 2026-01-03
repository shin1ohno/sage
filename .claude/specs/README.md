# Sage Specification Documents

**Version**: 0.8.0 | **Status**: ✅ Production Ready | **Last Updated**: 2026-01-03

---

## Directory Structure

```
.claude/specs/
├── README.md                    # This file
├── spec.md                      # Main specification hub
├── status.md                    # Project status
├── requirements.md              # All requirements (32 total)
├── design.md                    # Design overview
├── tasks.md                     # Implementation tasks
├── components.md                # Component definitions (20 components)
│
├── shared/                      # Cross-cutting documents
│   ├── architecture.md          # System architecture
│   ├── data-models.md           # Data model definitions
│   ├── security.md              # Security design
│   └── testing.md               # Test strategy
│
├── core/                        # Core features (task analysis)
│   └── README.md                # Core feature overview
│
├── calendar/                    # Calendar features
│   ├── README.md                # Calendar feature overview
│   └── google-calendar/         # Google Calendar integration
│       ├── requirements.md      # 11 requirements
│       ├── design.md            # Technical design
│       └── tasks.md             # 43 implementation tasks
│
├── oauth/                       # OAuth 2.1
│   ├── README.md                # OAuth overview
│   └── oauth-spec.md            # OAuth 2.1 detailed spec
│
├── remote-mcp/                  # Remote MCP Server
│   └── README.md                # Remote MCP overview
│
└── integrations/                # External integrations
    ├── README.md                # Integrations overview
    └── integrations.md          # Integration design
```

---

## Quick Navigation

### Start Here
- **[spec.md](./spec.md)** - Main specification hub (overview, architecture, status)
- **[status.md](./status.md)** - Current project status and progress

### By Feature

| Feature | Directory | Description |
|---------|-----------|-------------|
| **Core** | [core/](./core/) | Task analysis, priority engine, time estimation |
| **Calendar** | [calendar/](./calendar/) | EventKit + Google Calendar integration |
| **OAuth** | [oauth/](./oauth/) | OAuth 2.1 authentication |
| **Remote MCP** | [remote-mcp/](./remote-mcp/) | Remote access via HTTP |
| **Integrations** | [integrations/](./integrations/) | Notion, Apple Reminders |

### By Document Type

| Type | Documents |
|------|-----------|
| **Requirements** | [requirements.md](./requirements.md), [calendar/google-calendar/requirements.md](./calendar/google-calendar/requirements.md) |
| **Design** | [design.md](./design.md), [calendar/google-calendar/design.md](./calendar/google-calendar/design.md) |
| **Tasks** | [tasks.md](./tasks.md), [calendar/google-calendar/tasks.md](./calendar/google-calendar/tasks.md) |
| **Components** | [components.md](./components.md) (20 components) |
| **Architecture** | [shared/architecture.md](./shared/architecture.md) |
| **Data Models** | [shared/data-models.md](./shared/data-models.md) |
| **Security** | [shared/security.md](./shared/security.md) |
| **Testing** | [shared/testing.md](./shared/testing.md) |

---

## For Different Roles

### New Team Members
1. [spec.md](./spec.md) - Overview
2. [requirements.md](./requirements.md) - What we're building
3. [shared/architecture.md](./shared/architecture.md) - System design
4. [status.md](./status.md) - Current progress

### Developers
1. [components.md](./components.md) - Component interfaces
2. [shared/data-models.md](./shared/data-models.md) - Data structures
3. [tasks.md](./tasks.md) - Implementation checklist
4. [shared/testing.md](./shared/testing.md) - Testing approach

### Product Owners
1. [spec.md](./spec.md) - High-level overview
2. [requirements.md](./requirements.md) - Feature requirements
3. [status.md](./status.md) - Progress metrics

### Security Review
1. [shared/security.md](./shared/security.md) - Security design
2. [oauth/oauth-spec.md](./oauth/oauth-spec.md) - OAuth 2.1 spec
3. [integrations/integrations.md](./integrations/integrations.md) - External systems

---

## Specification Workflow

```
1. Requirements Phase
   └── Define requirements (EARS format)

2. Design Phase
   ├── System architecture
   ├── Component design
   └── Data models

3. Implementation Phase
   ├── Break down into tasks
   └── Track progress

4. Testing Phase
   └── Verify requirements
```

**Current Status**: ✅ Phase 5 Complete (Production Ready)

---

## Related Documentation

### User Documentation
- [docs/SETUP-LOCAL.md](../../docs/SETUP-LOCAL.md) - Local setup
- [docs/SETUP-REMOTE.md](../../docs/SETUP-REMOTE.md) - Remote server setup
- [docs/CONFIGURATION.md](../../docs/CONFIGURATION.md) - Configuration reference

### Project Root
- [README.md](../../README.md) - Project README
- [CHANGELOG.md](../../CHANGELOG.md) - Version history

---

## Commands

```bash
# List all specs
/spec-list

# Check spec status
/spec-status <feature-name>

# Create new spec
/spec-create <feature-name>

# Execute spec tasks
/spec-execute <feature-name>
```

---

**Last Updated**: 2026-01-03 | **Contact**: @shin1ohno
