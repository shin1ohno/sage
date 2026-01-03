/**
 * Configuration validation schemas using Zod
 * Provides runtime type validation for user configuration
 */

import { z } from 'zod';

/**
 * EventKit source configuration schema
 */
export const EventKitSourceConfigSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Google Calendar source configuration schema
 */
export const GoogleCalendarSourceConfigSchema = z.object({
  enabled: z.boolean(),
  defaultCalendar: z.string().default('primary'),
  excludedCalendars: z.array(z.string()).default([]),
  syncInterval: z.number().min(60).max(3600).default(300),
  enableNotifications: z.boolean().default(true),
});

/**
 * Calendar sources configuration schema
 * Validates that at least one calendar source is enabled
 */
export const CalendarSourcesSchema = z
  .object({
    eventkit: EventKitSourceConfigSchema,
    google: GoogleCalendarSourceConfigSchema,
  })
  .refine(
    (data) => data.eventkit.enabled || data.google.enabled,
    {
      message: 'At least one calendar source must be enabled',
      path: ['sources'],
    }
  );

/**
 * Validate calendar sources configuration
 * @param sources - The calendar sources configuration to validate
 * @returns Validation result with parsed data or error
 */
export function validateCalendarSources(sources: unknown): {
  success: boolean;
  data?: z.infer<typeof CalendarSourcesSchema>;
  error?: z.ZodError;
} {
  const result = CalendarSourcesSchema.safeParse(sources);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

/**
 * Type exports for validated schemas
 */
export type ValidatedCalendarSources = z.infer<typeof CalendarSourcesSchema>;
export type ValidatedEventKitSourceConfig = z.infer<typeof EventKitSourceConfigSchema>;
export type ValidatedGoogleCalendarSourceConfig = z.infer<typeof GoogleCalendarSourceConfigSchema>;
