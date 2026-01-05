/**
 * Task-related type definitions
 */

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface Task {
  title: string;
  description?: string;
  deadline?: string;
  dependencies?: string[];
  status?: TaskStatus;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SubTask extends Task {
  parentTaskId?: string;
  order: number;
}

export interface TaskDependency {
  taskIndex: number;
  dependsOn: number[];
  type: 'sequential' | 'parallel' | 'conditional';
}

export interface SplitResult {
  originalInput: string;
  splitTasks: Task[];
  splitReason: string;
  recommendedOrder: number[];
  dependencies: TaskDependency[];
}

export interface ComplexityAnalysis {
  isComplex: boolean;
  complexity: 'simple' | 'medium' | 'complex' | 'project';
  suggestedSplits?: SubTask[];
  reasoning: string;
}

export interface AnalyzedTask {
  original: Task;
  priority: Priority;
  estimatedMinutes: number;
  stakeholders: string[];
  suggestedReminders: Reminder[];
  suggestedTimeSlot?: TimeSlot;
  reasoning: AnalysisReasoning;
  tags: string[];
}

export interface AnalysisReasoning {
  priorityReason: string;
  estimationReason: string;
  stakeholderReason: string;
  schedulingReason?: string;
}

export interface Reminder {
  type: string;
  time: string;
  message?: string;
}

/**
 * Working location information for a time slot
 * Requirement: 3.7 (google-calendar-event-types spec)
 */
export interface WorkingLocationInfo {
  type: 'homeOffice' | 'officeLocation' | 'customLocation' | 'unknown';
  label?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  durationMinutes: number;
  /**
   * Working location context for the time slot
   * Populated when working location events are present for the slot's date
   * Requirement: 3.7 (google-calendar-event-types spec)
   */
  workingLocation?: WorkingLocationInfo;
}

export interface AvailableSlot extends TimeSlot {
  suitability: 'excellent' | 'good' | 'acceptable';
  reason: string;
  conflicts: string[];
  dayType: 'deep-work' | 'meeting-heavy' | 'normal';
}
