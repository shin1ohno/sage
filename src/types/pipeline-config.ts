/**
 * Meeting Intelligence Pipeline Configuration
 */

import { z } from 'zod';

export const MeetingIntelligenceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  briefingLeadTimeMinutes: z.number().default(30),
  postMeetingDelayMinutes: z.number().default(15),
  schedulerIntervalMinutes: z.number().default(5),
});

export type MeetingIntelligenceConfig = z.infer<typeof MeetingIntelligenceConfigSchema>;
