/**
 * Meeting Filter
 * Pure function to determine if a calendar event should be processed
 * by the Meeting Intelligence Pipeline.
 */

import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { MeetingIntelligenceConfig, ExcludePattern } from '../types/pipeline-config.js';

/**
 * Check if a single exclude pattern matches the given event
 */
function matchesExcludePattern(event: CalendarEvent, pattern: ExcludePattern): boolean {
  if (pattern.type === 'title') {
    // Regex match: pattern wrapped in /slashes/
    if (pattern.pattern.startsWith('/') && pattern.pattern.endsWith('/')) {
      const regex = new RegExp(pattern.pattern.slice(1, -1));
      return regex.test(event.title);
    }
    // Substring match (case-insensitive)
    return event.title.toLowerCase().includes(pattern.pattern.toLowerCase());
  }

  if (pattern.type === 'calendar') {
    if (!event.calendar) return false;
    return event.calendar.toLowerCase().includes(pattern.pattern.toLowerCase());
  }

  return false;
}

/**
 * Determine whether a meeting should be processed by the pipeline.
 *
 * Returns true when all of the following hold:
 *   1. The event is NOT an all-day event
 *   2. The attendee count meets the minimum threshold
 *   3. The event does not match any configured exclude pattern
 *
 * Note: declined meetings are intentionally NOT excluded (R3.9).
 */
export function shouldProcessMeeting(
  event: CalendarEvent,
  config: MeetingIntelligenceConfig
): boolean {
  // All-day events are excluded
  if (event.isAllDay) {
    return false;
  }

  // Minimum attendees check
  const attendeeCount = event.attendees?.length ?? 0;
  if (attendeeCount < config.minimumAttendees) {
    return false;
  }

  // Exclude pattern check
  for (const pattern of config.excludePatterns) {
    if (matchesExcludePattern(event, pattern)) {
      return false;
    }
  }

  return true;
}
