import { BriefingGenerator } from '../../src/services/briefing-generator.js';
import type { CalendarEvent } from '../../src/types/google-calendar-types.js';

jest.mock('../../src/utils/slack-blocks.js', () => ({
  formatBriefing: jest.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'briefing' } }]),
}));

const mockSlackService = {
  sendDirectMessage: jest.fn().mockResolvedValue(undefined),
  getChannelHistory: jest.fn().mockResolvedValue([]),
  listBotChannels: jest.fn().mockResolvedValue([]),
};
const mockChannelDiscovery = { discoverChannels: jest.fn().mockResolvedValue([]) };
const mockSamplingService = { sendSamplingRequest: jest.fn().mockResolvedValue({ content: { text: 'Test briefing content' } }) };
const mockStateStore = {
  getBriefingStatus: jest.fn().mockReturnValue(null),
  setBriefingStatus: jest.fn(),
  getActionItemsForRecurring: jest.fn().mockReturnValue([]),
};
const mockPromptTemplateManager = { getPrompt: jest.fn().mockReturnValue('test prompt') };
const testConfig = {
  enabled: true,
  briefingWindow: 15,
  preMeetingPollInterval: 5,
  postMeetingPollInterval: 15,
  postMeetingTimeout: 24,
  postMeetingDelay: 30,
  meetingEndBuffer: 10,
  slackLookbackDays: 7,
  slackMessageBatchSize: 50,
  minimumAttendees: 2,
  excludePatterns: [],
  dailySummaryEnabled: true,
  promptsDir: '~/.sage/prompts/',
};

const testEvent: CalendarEvent = {
  id: 'evt-1',
  title: 'Team Standup',
  start: '2026-02-28T09:00:00Z',
  end: '2026-02-28T09:30:00Z',
  isAllDay: false,
  source: 'google',
  description: '',
};

describe('BriefingGenerator', () => {
  let generator: BriefingGenerator;

  beforeEach(() => {
    jest.clearAllMocks();
    generator = new BriefingGenerator(
      mockSlackService as never,
      mockChannelDiscovery as never,
      mockSamplingService as never,
      mockStateStore as never,
      mockPromptTemplateManager as never,
      testConfig as never,
    );
  });

  describe('generateBriefing', () => {
    it('generates briefing and sends via Slack DM', async () => {
      // Use a far-future deadline to avoid "deadline passed" check
      const deadline = new Date('2099-12-31T23:59:59Z');

      const result = await generator.generateBriefing(testEvent, deadline);

      expect(result.status).toBe('sent');
      expect(mockSlackService.sendDirectMessage).toHaveBeenCalled();
    });

    it('returns skipped when deadline passed', async () => {
      const deadline = new Date('2020-01-01T00:00:00Z');

      const result = await generator.generateBriefing(testEvent, deadline);

      expect(result.status).toBe('skipped');
      if (result.status === 'skipped') {
        expect(result.reason).toBe('deadline passed');
      }
    });

    it('updates state store on success', async () => {
      const deadline = new Date('2099-12-31T23:59:59Z');

      await generator.generateBriefing(testEvent, deadline);

      expect(mockStateStore.setBriefingStatus).toHaveBeenCalledWith('evt-1', {
        status: 'sent',
        sentAt: expect.any(String),
      });
    });

    it('returns skipped on error', async () => {
      mockSamplingService.sendSamplingRequest.mockRejectedValue(new Error('LLM error'));
      const deadline = new Date('2099-12-31T23:59:59Z');

      const result = await generator.generateBriefing(testEvent, deadline);

      expect(result.status).toBe('skipped');
    });
  });

  describe('gatherContext', () => {
    it('collects data in parallel', async () => {
      const deadline = new Date('2099-12-31T23:59:59Z');

      await generator.generateBriefing(testEvent, deadline);

      expect(mockChannelDiscovery.discoverChannels).toHaveBeenCalledWith(testEvent);
    });
  });
});
