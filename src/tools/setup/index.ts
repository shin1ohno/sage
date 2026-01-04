/**
 * Setup Tools Module
 *
 * Exports setup-related tool handlers for reuse between
 * index.ts (stdio transport) and mcp-handler.ts (HTTP transport).
 *
 * Requirements: 1.1-1.6
 */

export type { SetupContext, WizardSession } from './handlers.js';

export {
  handleCheckSetupStatus,
  handleStartSetupWizard,
  handleAnswerWizardQuestion,
  handleSaveConfig,
} from './handlers.js';
