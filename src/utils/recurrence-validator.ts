/**
 * RRULE Validation Utilities
 *
 * Provides validation and parsing for iCalendar RRULE recurrence rules.
 * Ensures RRULE syntax is correct before sending to Google Calendar API.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */

/**
 * Valid frequency values for RRULE
 */
export const VALID_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Frequency = (typeof VALID_FREQUENCIES)[number];

/**
 * Valid day codes for BYDAY rule part
 */
export const VALID_DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type DayCode = (typeof VALID_DAY_CODES)[number];

/**
 * Parsed RRULE structure
 * Contains the individual components of a recurrence rule
 */
export interface ParsedRRULE {
  /** Frequency of recurrence (DAILY, WEEKLY, MONTHLY, YEARLY) */
  freq: Frequency;
  /** Interval between recurrences (default: 1) */
  interval?: number;
  /** Number of occurrences */
  count?: number;
  /** End date for recurrence (ISO date string or YYYYMMDD format) */
  until?: string;
  /** Days of the week for recurrence */
  byday?: string[];
  /** Days of the month for recurrence */
  bymonthday?: number[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** The rule or value that caused the error */
  rule?: string;
}

/**
 * Result of RRULE validation
 */
export interface ValidationResult {
  /** Whether all rules are valid */
  success: boolean;
  /** List of validation errors (empty if success is true) */
  errors: ValidationError[];
}

/**
 * Parses an RRULE string into a structured object
 *
 * @param rrule - The RRULE string to parse (e.g., "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR")
 * @returns Parsed RRULE object or null if invalid syntax
 *
 * @example
 * parseRRULE("FREQ=DAILY;INTERVAL=1")
 * // Returns: { freq: "DAILY", interval: 1 }
 *
 * @example
 * parseRRULE("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10")
 * // Returns: { freq: "WEEKLY", byday: ["MO", "WE", "FR"], count: 10 }
 *
 * @example
 * parseRRULE("INVALID")
 * // Returns: null
 */
export function parseRRULE(rrule: string): ParsedRRULE | null {
  if (!rrule || typeof rrule !== 'string') {
    return null;
  }

  // Remove RRULE: prefix if present
  const ruleString = rrule.replace(/^RRULE:/i, '').trim();

  if (!ruleString) {
    return null;
  }

  const parts = ruleString.split(';');
  const parsed: Partial<ParsedRRULE> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');

    if (!key || !value) {
      // Invalid part format
      return null;
    }

    const normalizedKey = key.toUpperCase().trim();
    const trimmedValue = value.trim();

    switch (normalizedKey) {
      case 'FREQ': {
        const upperFreq = trimmedValue.toUpperCase() as Frequency;
        if (!VALID_FREQUENCIES.includes(upperFreq)) {
          return null;
        }
        parsed.freq = upperFreq;
        break;
      }

      case 'INTERVAL': {
        const interval = parseInt(trimmedValue, 10);
        if (isNaN(interval) || interval < 1) {
          return null;
        }
        parsed.interval = interval;
        break;
      }

      case 'COUNT': {
        const count = parseInt(trimmedValue, 10);
        if (isNaN(count) || count < 1) {
          return null;
        }
        parsed.count = count;
        break;
      }

      case 'UNTIL': {
        // Accept both ISO date format and YYYYMMDD format
        if (!isValidUntilDate(trimmedValue)) {
          return null;
        }
        parsed.until = trimmedValue;
        break;
      }

      case 'BYDAY': {
        const days = trimmedValue.split(',').map((d) => d.trim().toUpperCase());
        // BYDAY can have numeric prefixes for MONTHLY/YEARLY (e.g., "1MO", "-1FR")
        const validDays = days.every((day) => isValidByday(day));
        if (!validDays) {
          return null;
        }
        parsed.byday = days;
        break;
      }

      case 'BYMONTHDAY': {
        const monthDays = trimmedValue.split(',').map((d) => parseInt(d.trim(), 10));
        // BYMONTHDAY can be 1-31 or -31 to -1 (negative counts from end of month)
        const validMonthDays = monthDays.every(
          (d) => !isNaN(d) && ((d >= 1 && d <= 31) || (d >= -31 && d <= -1))
        );
        if (!validMonthDays) {
          return null;
        }
        parsed.bymonthday = monthDays;
        break;
      }

      // Skip unknown rule parts (they may be valid extensions)
      default:
        break;
    }
  }

  // FREQ is required
  if (!parsed.freq) {
    return null;
  }

  return parsed as ParsedRRULE;
}

/**
 * Validates an array of RRULE strings
 *
 * @param rules - Array of RRULE strings to validate
 * @returns Validation result with success status and any errors
 *
 * @example
 * validateRecurrenceRules(["FREQ=WEEKLY;BYDAY=MO,WE,FR"])
 * // Returns: { success: true, errors: [] }
 *
 * @example
 * validateRecurrenceRules(["FREQ=WEEKLY;COUNT=5;UNTIL=20251231"])
 * // Returns: { success: false, errors: [{ code: "MUTUALLY_EXCLUSIVE", message: "...", rule: "..." }] }
 */
export function validateRecurrenceRules(rules: string[]): ValidationResult {
  const errors: ValidationError[] = [];

  if (!rules || !Array.isArray(rules)) {
    errors.push({
      code: 'INVALID_INPUT',
      message: 'Rules must be provided as an array',
    });
    return { success: false, errors };
  }

  if (rules.length === 0) {
    // Empty array is valid - no recurrence rules
    return { success: true, errors: [] };
  }

  for (const rule of rules) {
    if (typeof rule !== 'string') {
      errors.push({
        code: 'INVALID_RULE_TYPE',
        message: 'Each rule must be a string',
        rule: String(rule),
      });
      continue;
    }

    const ruleErrors = validateSingleRule(rule);
    errors.push(...ruleErrors);
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Validates a single RRULE string and returns detailed errors
 *
 * @param rule - The RRULE string to validate
 * @returns Array of validation errors (empty if valid)
 */
function validateSingleRule(rule: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const ruleString = rule.replace(/^RRULE:/i, '').trim();

  if (!ruleString) {
    errors.push({
      code: 'EMPTY_RULE',
      message: 'Rule cannot be empty',
      rule,
    });
    return errors;
  }

  const parts = ruleString.split(';');
  const ruleComponents: Map<string, string> = new Map();

  // Parse all components
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) {
      errors.push({
        code: 'INVALID_SYNTAX',
        message: `Invalid rule part format: "${part}". Expected KEY=VALUE`,
        rule,
      });
      continue;
    }

    const key = part.substring(0, eqIndex).toUpperCase().trim();
    const value = part.substring(eqIndex + 1).trim();

    if (!key || !value) {
      errors.push({
        code: 'INVALID_SYNTAX',
        message: `Invalid rule part: "${part}". Both key and value are required`,
        rule,
      });
      continue;
    }

    ruleComponents.set(key, value);
  }

  // Validate FREQ (required)
  if (!ruleComponents.has('FREQ')) {
    errors.push({
      code: 'MISSING_FREQ',
      message: 'FREQ is required in RRULE',
      rule,
    });
  } else {
    const freq = ruleComponents.get('FREQ')!.toUpperCase();
    if (!VALID_FREQUENCIES.includes(freq as Frequency)) {
      errors.push({
        code: 'INVALID_FREQ',
        message: `Invalid FREQ value: "${freq}". Must be one of: ${VALID_FREQUENCIES.join(', ')}`,
        rule,
      });
    }
  }

  // Validate INTERVAL (optional)
  if (ruleComponents.has('INTERVAL')) {
    const interval = parseInt(ruleComponents.get('INTERVAL')!, 10);
    if (isNaN(interval)) {
      errors.push({
        code: 'INVALID_INTERVAL',
        message: `INTERVAL must be a number, got: "${ruleComponents.get('INTERVAL')}"`,
        rule,
      });
    } else if (interval < 1) {
      errors.push({
        code: 'INVALID_INTERVAL',
        message: `INTERVAL must be a positive integer, got: ${interval}`,
        rule,
      });
    }
  }

  // Validate COUNT (optional)
  if (ruleComponents.has('COUNT')) {
    const count = parseInt(ruleComponents.get('COUNT')!, 10);
    if (isNaN(count)) {
      errors.push({
        code: 'INVALID_COUNT',
        message: `COUNT must be a number, got: "${ruleComponents.get('COUNT')}"`,
        rule,
      });
    } else if (count < 1) {
      errors.push({
        code: 'INVALID_COUNT',
        message: `COUNT must be a positive integer, got: ${count}`,
        rule,
      });
    }
  }

  // Validate UNTIL (optional)
  if (ruleComponents.has('UNTIL')) {
    const until = ruleComponents.get('UNTIL')!;
    if (!isValidUntilDate(until)) {
      errors.push({
        code: 'INVALID_UNTIL',
        message: `UNTIL must be a valid ISO date (YYYYMMDD or ISO 8601 format), got: "${until}"`,
        rule,
      });
    }
  }

  // Validate COUNT and UNTIL are mutually exclusive
  if (ruleComponents.has('COUNT') && ruleComponents.has('UNTIL')) {
    errors.push({
      code: 'MUTUALLY_EXCLUSIVE',
      message: 'COUNT and UNTIL are mutually exclusive. Use only one of them.',
      rule,
    });
  }

  // Validate BYDAY (optional)
  if (ruleComponents.has('BYDAY')) {
    const byday = ruleComponents.get('BYDAY')!;
    const days = byday.split(',').map((d) => d.trim().toUpperCase());

    for (const day of days) {
      if (!isValidByday(day)) {
        errors.push({
          code: 'INVALID_BYDAY',
          message: `Invalid BYDAY value: "${day}". Must be one of: ${VALID_DAY_CODES.join(', ')} (optionally prefixed with a number for MONTHLY/YEARLY rules)`,
          rule,
        });
      }
    }
  }

  // Validate BYMONTHDAY (optional)
  if (ruleComponents.has('BYMONTHDAY')) {
    const bymonthday = ruleComponents.get('BYMONTHDAY')!;
    const days = bymonthday.split(',').map((d) => d.trim());

    for (const day of days) {
      const num = parseInt(day, 10);
      if (isNaN(num)) {
        errors.push({
          code: 'INVALID_BYMONTHDAY',
          message: `BYMONTHDAY must contain numbers, got: "${day}"`,
          rule,
        });
      } else if (!(num >= 1 && num <= 31) && !(num >= -31 && num <= -1)) {
        errors.push({
          code: 'INVALID_BYMONTHDAY',
          message: `BYMONTHDAY values must be between 1-31 or -31 to -1, got: ${num}`,
          rule,
        });
      }
    }
  }

  return errors;
}

/**
 * Validates a BYDAY value (day code with optional numeric prefix)
 *
 * @param day - The BYDAY value to validate (e.g., "MO", "1MO", "-1FR")
 * @returns True if valid, false otherwise
 */
function isValidByday(day: string): boolean {
  if (!day) return false;

  // Extract day code (last 2 characters)
  const dayCode = day.slice(-2).toUpperCase();

  if (!VALID_DAY_CODES.includes(dayCode as DayCode)) {
    return false;
  }

  // Check numeric prefix if present
  if (day.length > 2) {
    const prefix = day.slice(0, -2);
    const num = parseInt(prefix, 10);

    // Valid prefixes are -53 to -1 and 1 to 53 (week of year range)
    if (isNaN(num) || num === 0 || num < -53 || num > 53) {
      return false;
    }
  }

  return true;
}

/**
 * Validates an UNTIL date value
 *
 * Accepts:
 * - YYYYMMDD format (basic ISO date)
 * - YYYYMMDDTHHMMSSZ format (UTC datetime)
 * - ISO 8601 format (e.g., 2025-12-31T23:59:59Z)
 *
 * @param until - The UNTIL value to validate
 * @returns True if valid, false otherwise
 */
function isValidUntilDate(until: string): boolean {
  if (!until) return false;

  // Check YYYYMMDD format
  if (/^\d{8}$/.test(until)) {
    const year = parseInt(until.substring(0, 4), 10);
    const month = parseInt(until.substring(4, 6), 10);
    const day = parseInt(until.substring(6, 8), 10);

    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    );
  }

  // Check YYYYMMDDTHHMMSSZ format
  if (/^\d{8}T\d{6}Z?$/.test(until)) {
    const year = parseInt(until.substring(0, 4), 10);
    const month = parseInt(until.substring(4, 6), 10);
    const day = parseInt(until.substring(6, 8), 10);
    const hour = parseInt(until.substring(9, 11), 10);
    const minute = parseInt(until.substring(11, 13), 10);
    const second = parseInt(until.substring(13, 15), 10);

    // Basic sanity check for year (reasonable calendar range)
    if (year < 1970 || year > 9999) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (hour < 0 || hour > 23) return false;
    if (minute < 0 || minute > 59) return false;
    if (second < 0 || second > 59) return false;

    return true;
  }

  // Try parsing as ISO 8601 format
  const date = new Date(until);
  return !isNaN(date.getTime());
}

/**
 * Creates a simple RRULE string from parsed components
 *
 * @param parsed - Parsed RRULE object
 * @returns RRULE string
 *
 * @example
 * createRRULE({ freq: "WEEKLY", interval: 2, byday: ["MO", "WE", "FR"] })
 * // Returns: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR"
 */
export function createRRULE(parsed: ParsedRRULE): string {
  const parts: string[] = [`FREQ=${parsed.freq}`];

  if (parsed.interval !== undefined && parsed.interval !== 1) {
    parts.push(`INTERVAL=${parsed.interval}`);
  }

  if (parsed.count !== undefined) {
    parts.push(`COUNT=${parsed.count}`);
  }

  if (parsed.until !== undefined) {
    parts.push(`UNTIL=${parsed.until}`);
  }

  if (parsed.byday !== undefined && parsed.byday.length > 0) {
    parts.push(`BYDAY=${parsed.byday.join(',')}`);
  }

  if (parsed.bymonthday !== undefined && parsed.bymonthday.length > 0) {
    parts.push(`BYMONTHDAY=${parsed.bymonthday.join(',')}`);
  }

  return parts.join(';');
}

/**
 * Day code to Japanese mapping
 */
const DAY_CODE_TO_JAPANESE: Record<DayCode, string> = {
  MO: '月',
  TU: '火',
  WE: '水',
  TH: '木',
  FR: '金',
  SA: '土',
  SU: '日',
};

/**
 * Frequency to Japanese mapping (base form)
 */
const FREQ_TO_JAPANESE: Record<Frequency, string> = {
  DAILY: '毎日',
  WEEKLY: '毎週',
  MONTHLY: '毎月',
  YEARLY: '毎年',
};

/**
 * Frequency to Japanese interval suffix mapping
 */
const FREQ_TO_INTERVAL_SUFFIX: Record<Frequency, string> = {
  DAILY: '日ごと',
  WEEKLY: '週間ごと',
  MONTHLY: 'ヶ月ごと',
  YEARLY: '年ごと',
};

/**
 * Converts a day code to its Japanese representation
 *
 * @param dayCode - The day code (e.g., "MO", "1MO", "-1FR")
 * @returns Japanese day name with any ordinal prefix
 */
function dayCodeToJapanese(dayCode: string): string {
  // Extract the base day code (last 2 characters)
  const baseDayCode = dayCode.slice(-2).toUpperCase() as DayCode;
  const japaneseDayName = DAY_CODE_TO_JAPANESE[baseDayCode] || dayCode;

  // Check for ordinal prefix
  if (dayCode.length > 2) {
    const prefix = dayCode.slice(0, -2);
    const num = parseInt(prefix, 10);
    if (!isNaN(num)) {
      if (num > 0) {
        return `第${num}${japaneseDayName}曜日`;
      } else {
        // Negative means from end of month
        return `最終から${Math.abs(num)}番目の${japaneseDayName}曜日`;
      }
    }
  }

  return japaneseDayName;
}

/**
 * Formats UNTIL date to Japanese format
 *
 * @param until - UNTIL value (YYYYMMDD or ISO format)
 * @returns Japanese date string
 */
function formatUntilToJapanese(until: string): string {
  let year: number, month: number, day: number;

  if (/^\d{8}/.test(until)) {
    // YYYYMMDD format
    year = parseInt(until.substring(0, 4), 10);
    month = parseInt(until.substring(4, 6), 10);
    day = parseInt(until.substring(6, 8), 10);
  } else {
    // ISO format
    const date = new Date(until);
    if (isNaN(date.getTime())) {
      return until;
    }
    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
  }

  return `${year}年${month}月${day}日`;
}

/**
 * Generates a human-readable Japanese description for RRULE patterns
 *
 * @param rules - Array of RRULE strings to describe
 * @returns Japanese description of the recurrence pattern
 *
 * @example
 * describeRecurrence(["FREQ=DAILY"])
 * // Returns: "毎日"
 *
 * @example
 * describeRecurrence(["FREQ=WEEKLY;BYDAY=MO,WE,FR"])
 * // Returns: "毎週月・水・金曜日"
 *
 * @example
 * describeRecurrence(["FREQ=MONTHLY;BYMONTHDAY=15"])
 * // Returns: "毎月15日"
 *
 * @example
 * describeRecurrence(["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"])
 * // Returns: "2週間ごとの月曜日"
 *
 * @example
 * describeRecurrence(["FREQ=DAILY;COUNT=10"])
 * // Returns: "毎日（10回）"
 *
 * @example
 * describeRecurrence(["FREQ=WEEKLY;UNTIL=20251231"])
 * // Returns: "毎週（2025年12月31日まで）"
 */
export function describeRecurrence(rules: string[]): string {
  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return '';
  }

  // Process only the first RRULE (ignore EXDATE, etc.)
  const rrule = rules.find((r) => r.toUpperCase().startsWith('RRULE:') || !r.includes(':'));
  if (!rrule) {
    return '';
  }

  const parsed = parseRRULE(rrule);
  if (!parsed) {
    return '';
  }

  const parts: string[] = [];
  let suffix = '';

  // Handle INTERVAL
  const interval = parsed.interval ?? 1;

  if (interval === 1) {
    // Simple frequency (毎日, 毎週, etc.)
    parts.push(FREQ_TO_JAPANESE[parsed.freq]);
  } else {
    // Interval-based (2週間ごと, etc.)
    parts.push(`${interval}${FREQ_TO_INTERVAL_SUFFIX[parsed.freq]}`);
  }

  // Handle BYDAY
  if (parsed.byday && parsed.byday.length > 0) {
    const japaneseDays = parsed.byday.map(dayCodeToJapanese);

    if (interval === 1) {
      // For simple frequency: 毎週月・水・金曜日
      parts.push(japaneseDays.join('・') + '曜日');
    } else {
      // For interval: 2週間ごとの月曜日
      parts[0] = parts[0] + 'の';
      parts.push(japaneseDays.join('・') + '曜日');
    }
  }

  // Handle BYMONTHDAY
  if (parsed.bymonthday && parsed.bymonthday.length > 0) {
    const dayList = parsed.bymonthday
      .map((d) => {
        if (d < 0) {
          return `月末から${Math.abs(d)}日前`;
        }
        return `${d}日`;
      })
      .join('・');
    parts.push(dayList);
  }

  // Handle COUNT
  if (parsed.count !== undefined) {
    suffix = `（${parsed.count}回）`;
  }

  // Handle UNTIL
  if (parsed.until !== undefined) {
    const japaneseDate = formatUntilToJapanese(parsed.until);
    suffix = `（${japaneseDate}まで）`;
  }

  return parts.join('') + suffix;
}
