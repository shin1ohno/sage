/**
 * Recurrence validator tests
 *
 * Tests for RRULE validation, parsing, and description generation.
 * Covers all validation scenarios and edge cases.
 */

import { describe, expect, test } from '@jest/globals';
import {
  parseRRULE,
  validateRecurrenceRules,
  createRRULE,
  describeRecurrence,
  type ParsedRRULE,
} from '../../src/utils/recurrence-validator.js';

describe('parseRRULE', () => {
  describe('Valid RRULE patterns', () => {
    test('should parse DAILY frequency', () => {
      // Arrange
      const rrule = 'FREQ=DAILY';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('DAILY');
      expect(result?.interval).toBeUndefined();
    });

    test('should parse WEEKLY frequency', () => {
      // Arrange
      const rrule = 'FREQ=WEEKLY';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('WEEKLY');
    });

    test('should parse MONTHLY frequency', () => {
      // Arrange
      const rrule = 'FREQ=MONTHLY';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('MONTHLY');
    });

    test('should parse YEARLY frequency', () => {
      // Arrange
      const rrule = 'FREQ=YEARLY';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('YEARLY');
    });

    test('should parse RRULE with INTERVAL', () => {
      // Arrange
      const rrule = 'FREQ=WEEKLY;INTERVAL=2';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('WEEKLY');
      expect(result?.interval).toBe(2);
    });

    test('should parse RRULE with COUNT', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;COUNT=10';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('DAILY');
      expect(result?.count).toBe(10);
    });

    test('should parse RRULE with UNTIL in YYYYMMDD format', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;UNTIL=20251231';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('DAILY');
      expect(result?.until).toBe('20251231');
    });

    test('should parse RRULE with UNTIL in ISO 8601 format', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;UNTIL=2025-12-31T23:59:59Z';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('DAILY');
      expect(result?.until).toBe('2025-12-31T23:59:59Z');
    });

    test('should parse RRULE with BYDAY', () => {
      // Arrange
      const rrule = 'FREQ=WEEKLY;BYDAY=MO,WE,FR';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('WEEKLY');
      expect(result?.byday).toEqual(['MO', 'WE', 'FR']);
    });

    test('should parse RRULE with BYDAY with ordinal prefix', () => {
      // Arrange
      const rrule = 'FREQ=MONTHLY;BYDAY=1MO,-1FR';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('MONTHLY');
      expect(result?.byday).toEqual(['1MO', '-1FR']);
    });

    test('should parse RRULE with BYMONTHDAY', () => {
      // Arrange
      const rrule = 'FREQ=MONTHLY;BYMONTHDAY=1,15,30';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('MONTHLY');
      expect(result?.bymonthday).toEqual([1, 15, 30]);
    });

    test('should parse RRULE with negative BYMONTHDAY', () => {
      // Arrange
      const rrule = 'FREQ=MONTHLY;BYMONTHDAY=-1,-5';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('MONTHLY');
      expect(result?.bymonthday).toEqual([-1, -5]);
    });

    test('should parse complex RRULE with multiple components', () => {
      // Arrange
      const rrule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=20';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('WEEKLY');
      expect(result?.interval).toBe(2);
      expect(result?.byday).toEqual(['MO', 'WE', 'FR']);
      expect(result?.count).toBe(20);
    });

    test('should handle RRULE: prefix', () => {
      // Arrange
      const rrule = 'RRULE:FREQ=DAILY';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('DAILY');
    });

    test('should handle case-insensitive RRULE', () => {
      // Arrange
      const rrule = 'freq=daily;interval=1';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('DAILY');
      expect(result?.interval).toBe(1);
    });

    test('should handle whitespace in RRULE', () => {
      // Arrange
      const rrule = ' FREQ = DAILY ; INTERVAL = 2 ';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.freq).toBe('DAILY');
      expect(result?.interval).toBe(2);
    });
  });

  describe('Invalid RRULE patterns', () => {
    test('should return null for empty string', () => {
      // Arrange
      const rrule = '';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for null input', () => {
      // Arrange
      const rrule = null as any;

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for undefined input', () => {
      // Arrange
      const rrule = undefined as any;

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for missing FREQ', () => {
      // Arrange
      const rrule = 'INTERVAL=2;COUNT=10';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for invalid FREQ value', () => {
      // Arrange
      const rrule = 'FREQ=HOURLY';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for invalid INTERVAL value', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;INTERVAL=abc';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for negative INTERVAL', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;INTERVAL=-1';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for zero INTERVAL', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;INTERVAL=0';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for invalid COUNT value', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;COUNT=xyz';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for negative COUNT', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;COUNT=-5';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for zero COUNT', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;COUNT=0';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for invalid UNTIL date format', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;UNTIL=2025-13-45';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for invalid BYDAY value', () => {
      // Arrange
      const rrule = 'FREQ=WEEKLY;BYDAY=XX,YY';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for invalid BYMONTHDAY value', () => {
      // Arrange
      const rrule = 'FREQ=MONTHLY;BYMONTHDAY=abc';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for out-of-range BYMONTHDAY', () => {
      // Arrange
      const rrule = 'FREQ=MONTHLY;BYMONTHDAY=32';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for invalid part format', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;INVALID_PART';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for missing key in part', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;=VALUE';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });

    test('should return null for missing value in part', () => {
      // Arrange
      const rrule = 'FREQ=DAILY;KEY=';

      // Act
      const result = parseRRULE(rrule);

      // Assert
      expect(result).toBeNull();
    });
  });
});

describe('validateRecurrenceRules', () => {
  describe('Valid rules', () => {
    test('should accept empty array', () => {
      // Arrange
      const rules: string[] = [];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept valid DAILY rule', () => {
      // Arrange
      const rules = ['FREQ=DAILY'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept valid WEEKLY rule', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;BYDAY=MO,WE,FR'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept valid MONTHLY rule', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=15'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept valid YEARLY rule', () => {
      // Arrange
      const rules = ['FREQ=YEARLY;INTERVAL=1'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept rule with COUNT', () => {
      // Arrange
      const rules = ['FREQ=DAILY;COUNT=10'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept rule with UNTIL', () => {
      // Arrange
      const rules = ['FREQ=DAILY;UNTIL=20251231'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept multiple valid rules', () => {
      // Arrange
      const rules = ['FREQ=DAILY', 'FREQ=WEEKLY;BYDAY=MO'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid input', () => {
    test('should reject null input', () => {
      // Arrange
      const rules = null as any;

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_INPUT');
    });

    test('should reject undefined input', () => {
      // Arrange
      const rules = undefined as any;

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_INPUT');
    });

    test('should reject non-array input', () => {
      // Arrange
      const rules = 'FREQ=DAILY' as any;

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_INPUT');
    });

    test('should reject array with non-string element', () => {
      // Arrange
      const rules = [123] as any;

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_RULE_TYPE');
    });
  });

  describe('Missing FREQ', () => {
    test('should reject rule without FREQ', () => {
      // Arrange
      const rules = ['INTERVAL=2;COUNT=10'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('MISSING_FREQ');
      expect(result.errors[0]?.message).toContain('FREQ is required');
    });
  });

  describe('Invalid FREQ', () => {
    test('should reject invalid FREQ value', () => {
      // Arrange
      const rules = ['FREQ=HOURLY'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_FREQ');
      expect(result.errors[0]?.message).toContain('Invalid FREQ value');
    });

    test('should include valid frequencies in error message', () => {
      // Arrange
      const rules = ['FREQ=HOURLY'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors[0]?.message).toContain('DAILY');
      expect(result.errors[0]?.message).toContain('WEEKLY');
      expect(result.errors[0]?.message).toContain('MONTHLY');
      expect(result.errors[0]?.message).toContain('YEARLY');
    });
  });

  describe('COUNT and UNTIL mutual exclusivity', () => {
    test('should reject rule with both COUNT and UNTIL', () => {
      // Arrange
      const rules = ['FREQ=DAILY;COUNT=10;UNTIL=20251231'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('MUTUALLY_EXCLUSIVE');
      expect(result.errors[0]?.message).toContain('COUNT and UNTIL are mutually exclusive');
    });

    test('should accept rule with only COUNT', () => {
      // Arrange
      const rules = ['FREQ=DAILY;COUNT=10'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept rule with only UNTIL', () => {
      // Arrange
      const rules = ['FREQ=DAILY;UNTIL=20251231'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept rule with neither COUNT nor UNTIL', () => {
      // Arrange
      const rules = ['FREQ=DAILY'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid INTERVAL', () => {
    test('should reject non-numeric INTERVAL', () => {
      // Arrange
      const rules = ['FREQ=DAILY;INTERVAL=abc'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_INTERVAL');
      expect(result.errors[0]?.message).toContain('must be a number');
    });

    test('should reject negative INTERVAL', () => {
      // Arrange
      const rules = ['FREQ=DAILY;INTERVAL=-1'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_INTERVAL');
      expect(result.errors[0]?.message).toContain('positive integer');
    });

    test('should reject zero INTERVAL', () => {
      // Arrange
      const rules = ['FREQ=DAILY;INTERVAL=0'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_INTERVAL');
    });
  });

  describe('Invalid COUNT', () => {
    test('should reject non-numeric COUNT', () => {
      // Arrange
      const rules = ['FREQ=DAILY;COUNT=abc'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_COUNT');
      expect(result.errors[0]?.message).toContain('must be a number');
    });

    test('should reject negative COUNT', () => {
      // Arrange
      const rules = ['FREQ=DAILY;COUNT=-5'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_COUNT');
      expect(result.errors[0]?.message).toContain('positive integer');
    });

    test('should reject zero COUNT', () => {
      // Arrange
      const rules = ['FREQ=DAILY;COUNT=0'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_COUNT');
    });
  });

  describe('Invalid UNTIL', () => {
    test('should reject invalid date format', () => {
      // Arrange
      const rules = ['FREQ=DAILY;UNTIL=invalid-date'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_UNTIL');
    });

    test('should reject invalid month in YYYYMMDD format', () => {
      // Arrange
      const rules = ['FREQ=DAILY;UNTIL=20251345'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_UNTIL');
    });

    test('should reject invalid day in YYYYMMDD format', () => {
      // Arrange
      const rules = ['FREQ=DAILY;UNTIL=20250132'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_UNTIL');
    });
  });

  describe('Invalid BYDAY', () => {
    test('should reject invalid day code', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;BYDAY=XX'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_BYDAY');
    });

    test('should accept valid day codes', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept day codes with ordinal prefix', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYDAY=1MO,2TU,-1FR'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid BYMONTHDAY', () => {
    test('should reject non-numeric BYMONTHDAY', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=abc'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_BYMONTHDAY');
    });

    test('should reject out-of-range BYMONTHDAY', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=32'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_BYMONTHDAY');
    });

    test('should accept valid BYMONTHDAY range', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=1,15,31'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept negative BYMONTHDAY', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=-1,-5'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Empty or malformed rules', () => {
    test('should reject empty string rule', () => {
      // Arrange
      const rules = [''];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('EMPTY_RULE');
    });

    test('should reject rule with invalid syntax', () => {
      // Arrange
      const rules = ['FREQ=DAILY;INVALID_PART'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('INVALID_SYNTAX');
    });
  });

  describe('Multiple errors', () => {
    test('should report all errors in a single rule', () => {
      // Arrange
      const rules = ['INTERVAL=-1;COUNT=-5;UNTIL=invalid'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some((e) => e.code === 'MISSING_FREQ')).toBe(true);
    });

    test('should report errors for multiple rules', () => {
      // Arrange
      const rules = ['FREQ=INVALID', 'FREQ=DAILY;COUNT=-1'];

      // Act
      const result = validateRecurrenceRules(rules);

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});

describe('describeRecurrence', () => {
  describe('Basic frequencies', () => {
    test('should describe DAILY recurrence', () => {
      // Arrange
      const rules = ['FREQ=DAILY'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎日');
    });

    test('should describe WEEKLY recurrence', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎週');
    });

    test('should describe MONTHLY recurrence', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎月');
    });

    test('should describe YEARLY recurrence', () => {
      // Arrange
      const rules = ['FREQ=YEARLY'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎年');
    });
  });

  describe('Frequency with INTERVAL', () => {
    test('should describe every 2 days', () => {
      // Arrange
      const rules = ['FREQ=DAILY;INTERVAL=2'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('2日ごと');
    });

    test('should describe every 2 weeks', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;INTERVAL=2'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('2週間ごと');
    });

    test('should describe every 3 months', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;INTERVAL=3'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('3ヶ月ごと');
    });

    test('should describe every 2 years', () => {
      // Arrange
      const rules = ['FREQ=YEARLY;INTERVAL=2'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('2年ごと');
    });
  });

  describe('Weekly with BYDAY', () => {
    test('should describe weekly on Monday', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;BYDAY=MO'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎週月曜日');
    });

    test('should describe weekly on multiple days', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;BYDAY=MO,WE,FR'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎週月・水・金曜日');
    });

    test('should describe bi-weekly on Monday', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('2週間ごとの月曜日');
    });
  });

  describe('Monthly with BYMONTHDAY', () => {
    test('should describe monthly on 15th', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=15'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎月15日');
    });

    test('should describe monthly on multiple days', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=1,15,30'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎月1日・15日・30日');
    });

    test('should describe monthly on last day', () => {
      // Arrange
      const rules = ['FREQ=MONTHLY;BYMONTHDAY=-1'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toContain('月末');
    });
  });

  describe('Recurrence with COUNT', () => {
    test('should include count in description', () => {
      // Arrange
      const rules = ['FREQ=DAILY;COUNT=10'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎日（10回）');
    });

    test('should include count for weekly recurrence', () => {
      // Arrange
      const rules = ['FREQ=WEEKLY;BYDAY=MO;COUNT=5'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎週月曜日（5回）');
    });
  });

  describe('Recurrence with UNTIL', () => {
    test('should include end date in YYYYMMDD format', () => {
      // Arrange
      const rules = ['FREQ=DAILY;UNTIL=20251231'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎日（2025年12月31日まで）');
    });

    test('should include end date in ISO format', () => {
      // Arrange
      // Note: When UNTIL contains colons (ISO format), RRULE: prefix is required
      // Use a date that doesn't change across timezones (midday UTC)
      const rules = ['RRULE:FREQ=DAILY;UNTIL=2026-01-01T12:00:00Z'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      // The date should be 2026年1月1日 in any timezone (UTC midday avoids day boundary issues)
      expect(result).toBe('毎日（2026年1月1日まで）');
    });
  });

  describe('Edge cases', () => {
    test('should return empty string for empty array', () => {
      // Arrange
      const rules: string[] = [];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('');
    });

    test('should return empty string for null', () => {
      // Arrange
      const rules = null as any;

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('');
    });

    test('should return empty string for undefined', () => {
      // Arrange
      const rules = undefined as any;

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('');
    });

    test('should return empty string for invalid RRULE', () => {
      // Arrange
      const rules = ['INVALID'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('');
    });

    test('should handle RRULE: prefix', () => {
      // Arrange
      const rules = ['RRULE:FREQ=DAILY'];

      // Act
      const result = describeRecurrence(rules);

      // Assert
      expect(result).toBe('毎日');
    });
  });
});

describe('createRRULE', () => {
  test('should create simple DAILY RRULE', () => {
    // Arrange
    const parsed: ParsedRRULE = { freq: 'DAILY' };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=DAILY');
  });

  test('should create RRULE with INTERVAL', () => {
    // Arrange
    const parsed: ParsedRRULE = { freq: 'WEEKLY', interval: 2 };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=WEEKLY;INTERVAL=2');
  });

  test('should omit INTERVAL=1', () => {
    // Arrange
    const parsed: ParsedRRULE = { freq: 'DAILY', interval: 1 };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=DAILY');
  });

  test('should create RRULE with COUNT', () => {
    // Arrange
    const parsed: ParsedRRULE = { freq: 'DAILY', count: 10 };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=DAILY;COUNT=10');
  });

  test('should create RRULE with UNTIL', () => {
    // Arrange
    const parsed: ParsedRRULE = { freq: 'DAILY', until: '20251231' };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=DAILY;UNTIL=20251231');
  });

  test('should create RRULE with BYDAY', () => {
    // Arrange
    const parsed: ParsedRRULE = { freq: 'WEEKLY', byday: ['MO', 'WE', 'FR'] };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  test('should create RRULE with BYMONTHDAY', () => {
    // Arrange
    const parsed: ParsedRRULE = { freq: 'MONTHLY', bymonthday: [1, 15, 30] };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=MONTHLY;BYMONTHDAY=1,15,30');
  });

  test('should create complex RRULE with all components', () => {
    // Arrange
    const parsed: ParsedRRULE = {
      freq: 'WEEKLY',
      interval: 2,
      byday: ['MO', 'WE', 'FR'],
      count: 20,
    };

    // Act
    const result = createRRULE(parsed);

    // Assert
    expect(result).toBe('FREQ=WEEKLY;INTERVAL=2;COUNT=20;BYDAY=MO,WE,FR');
  });
});
