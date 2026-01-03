# Sage Specification Documents

**Version**: 0.7.8
**Status**: ✅ Production Ready
**Last Updated**: 2026-01-03

---

## Quick Navigation

### 📖 Start Here
- **[spec.md](./spec.md)** - Main specification hub (overview, architecture, status)

### 📋 Requirements
- **[requirements.md](./requirements.md)** - 32 requirements in EARS format
- **[oauth-spec.md](./oauth-spec.md)** - OAuth 2.1 detailed specification
- **[mcp-over-sse-spec.md](./mcp-over-sse-spec.md)** - SSE transport specification

### 🏗️ Design
- **[design.md](./design.md)** - Design hub (architecture, components, data models)
- **[architecture.md](./architecture.md)** - System architecture details
- **[components.md](./components.md)** - Component design specifications
- **[data-models.md](./data-models.md)** - Data model definitions
- **[integrations.md](./integrations.md)** - External integration specifications
- **[security.md](./security.md)** - Security design and practices

### 📝 Implementation
- **[tasks.md](./tasks.md)** - 47 implementation tasks (all complete)

### 🧪 Testing
- **[testing.md](./testing.md)** - Test strategy and coverage

### 📊 Status
- **[status.md](./status.md)** - Current project status and progress tracking

---

## Document Purpose

### For New Team Members
1. Start with **[spec.md](./spec.md)** for overview
2. Read **[requirements.md](./requirements.md)** to understand what we're building
3. Review **[design.md](./design.md)** to see how it's built
4. Check **[status.md](./status.md)** for current progress

### For Developers
1. **[design.md](./design.md)** - Understand system architecture
2. **[components.md](./components.md)** - Component details
3. **[tasks.md](./tasks.md)** - Implementation checklist
4. **[testing.md](./testing.md)** - Testing approach

### For Product Owners
1. **[spec.md](./spec.md)** - High-level overview
2. **[requirements.md](./requirements.md)** - Feature requirements
3. **[status.md](./status.md)** - Current status and metrics

### For Security Review
1. **[security.md](./security.md)** - Security design
2. **[oauth-spec.md](./oauth-spec.md)** - OAuth 2.1 implementation
3. **[integrations.md](./integrations.md)** - External system interactions

---

## Specification Workflow

This project follows the **claude-code-spec-workflow**:

```
1. Requirements Phase
   ├── Define requirements (requirements.md)
   ├── Create detailed specs (oauth-spec.md, etc.)
   └── Validate with stakeholders

2. Design Phase
   ├── System architecture (architecture.md)
   ├── Component design (components.md)
   ├── Data models (data-models.md)
   └── Integration design (integrations.md)

3. Implementation Phase
   ├── Break down into tasks (tasks.md)
   ├── Implement features
   └── Track progress (status.md)

4. Testing Phase
   ├── Write tests (testing.md)
   ├── Achieve coverage goals
   └── Verify requirements

5. Documentation Phase
   ├── Update all specs
   ├── Create user guides
   └── Production ready
```

**Current Status**: ✅ Phase 5 Complete (Production Ready)

---

## Document Maintenance

### Responsibility
- **Technical Lead**: @shin1ohno
- **Update Frequency**: As needed, minimum weekly during active development
- **Review Process**: Pull request for significant changes

### Document Lifecycle

1. **Active Development**
   - Update `status.md` daily
   - Update `tasks.md` when tasks complete
   - Update design docs when architecture changes

2. **Stable/Production**
   - Update `status.md` monthly
   - Update specs when new features added
   - Version all documents with releases

3. **Maintenance**
   - Archive old versions
   - Link to changelog
   - Keep specs minimal but complete

---

## Related Documentation

### User Documentation
- `../../docs/SETUP-LOCAL.md` - Local setup guide
- `../../docs/SETUP-REMOTE.md` - Remote server setup
- `../../docs/CONFIGURATION.md` - Configuration reference
- `../../docs/TROUBLESHOOTING.md` - Common issues and solutions

### Project Root
- `../../README.md` - Project README
- `../../CHANGELOG.md` - Version history
- `../../SESSION_PROGRESS.md` - Development session log

---

## Document Standards

### Formatting
- Markdown with GitHub flavors
- Mermaid diagrams for architecture
- Code blocks with syntax highlighting
- Tables for structured data

### Requirements Format
- EARS notation (Easy Approach to Requirements Syntax)
- User stories with acceptance criteria
- Numbered requirements for traceability

### Design Format
- Component diagrams
- Sequence diagrams
- Data flow diagrams
- Type definitions (TypeScript)

### Task Format
- Checkbox lists for progress tracking
- Links to requirements
- Implementation notes
- Test requirements

---

## Version History

### 0.7.8 (2026-01-03)
- Added platform-aware test mocking
- Updated status.md with test results
- All 914 tests passing

### 0.7.7 (2026-01-03)
- Added cookie-based session support
- Completed OAuth 2.1 implementation
- Updated all specs for production readiness

### 0.7.6 (2026-01-01)
- Added SSE transport support
- Completed calendar operations
- Added working cadence feature

### 0.7.5 (2025-12-30)
- Initial Remote MCP implementation
- OAuth 2.1 foundation
- Platform abstraction layer

---

## Contributing to Specs

### Adding New Requirements
1. Update `requirements.md`
2. Create detailed spec if needed (e.g., `feature-spec.md`)
3. Update `spec.md` to reference new docs
4. Update `status.md` with new requirements

### Updating Design
1. Update relevant design document
2. Update `design.md` hub if needed
3. Ensure diagrams are up-to-date
4. Update component references

### Completing Tasks
1. Check off task in `tasks.md`
2. Update `status.md` progress
3. Add test results if applicable
4. Link to implementation PR

---

## Contact

**Project Maintainer**: @shin1ohno
**Questions**: [Open an issue]
**Documentation Issues**: [Open a PR]

---

**Last Updated**: 2026-01-03
**Document Version**: 1.0
**Spec Format**: claude-code-spec-workflow compatible
