/**
 * Meeting Filter
 *
 * Determines whether a calendar event should be processed by the pipeline
 * based on configuration rules (all-day, minimum attendees, exclude patterns).
 */

import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { MeetingIntelligenceConfig } from '../types/pipeline-config.js';

/**
 * Check if an event should be processed by the pipeline.
 */
export function shouldProcessMeeting(
  event: CalendarEvent,
  config: MeetingIntelligenceConfig,
): boolean {
  if (event.isAllDay === true) {
    return false;
  }

  if ((event.attendees?.length ?? 0) < config.minimumAttendees) {
    return false;
  }

  if (matchesExcludePattern(event, config)) {
    return false;
  }

  return true;
}

/**
 * Check if an event matches any configured exclude pattern.
 */
function matchesExcludePattern(
  event: CalendarEvent,
  config: MeetingIntelligenceConfig,
): boolean {
  for (const pattern of config.excludePatterns) {
    if (pattern.type === 'title') {
      if (pattern.pattern.startsWith('/') && pattern.pattern.endsWith('/')) {
        const regex = new RegExp(pattern.pattern.slice(1, -1));
        if (regex.test(event.title)) {
          return true;
        }
      } else {
        if (event.title.includes(pattern.pattern)) {
          return true;
        }
      }
    } else if (pattern.type === 'calendar') {
      if (event.calendar && event.calendar.includes(pattern.pattern)) {
        return true;
      }
    }
  }
  return false;
}
