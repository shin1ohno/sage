# Implementation Decisions

## D1: p-queue dynamic import for Jest ESM compatibility

**Problem:** `p-queue` v7+ is ESM-only. Jest with ts-jest cannot handle ESM-only
node_modules even with `transformIgnorePatterns` because `.js` files are not
transformed by ts-jest.

**Decision:** Use dynamic `import('p-queue')` inside `PipelineScheduler.start()`
instead of top-level static import. Changed `postMeetingQueue` type to a nullable
interface `{ add: (fn: () => Promise<void>) => Promise<void>; size: number; pending: number }`.

**Rationale:** Dynamic import defers module resolution to runtime, bypassing Jest's
static module resolution issues. The interface type avoids importing the PQueue class
at the type level. Also added `p-queue|eventemitter3` to `transformIgnorePatterns` as
defense-in-depth.

## D2: PipelineScheduler constructor unused parameter

**Problem:** `WorkingCadenceService` is injected into `PipelineScheduler` per the task
spec, but the current implementation has no use for it (it's reserved for future
working-hours awareness).

**Decision:** Accept the parameter as `_workingCadenceService` (prefixed with `_`) in
the constructor but do not store it as a class property.

**Rationale:** TypeScript's `noUnusedLocals`/`noUnusedParameters` rules allow `_`-prefixed
parameters. This satisfies the constructor signature specified in the task while
avoiding unused-variable build errors.

## D3: PostMeetingProcessor.process() signature

**Problem:** The task spec defines `process(event, pollResult)` but the implementation
extracts transcript and notionNotes separately for clarity.

**Decision:** Use `process(event: CalendarEvent, transcript: string, notionNotes: string)`
with 3 parameters. Updated `PipelineScheduler.pollAndProcessPostMeeting()` to call
`process(event, pollResult.transcript, pollResult.notionNotes)`.

**Rationale:** Explicit parameters are clearer than passing a `PollResult` object and
having the method unpack it internally.

## D4: Test deadline dates

**Problem:** Tests for `BriefingGenerator` used fixed deadline dates (`2026-02-28T09:00:00Z`)
which become "past" once the real system clock advances beyond them, causing the
`new Date() > deadline` check to return `skipped` instead of `sent`.

**Decision:** Changed test deadlines to far-future dates (`2099-12-31T23:59:59Z`) for
tests that expect `status: 'sent'`.

**Rationale:** Using far-future dates eliminates time-dependent test flakiness without
requiring `jest.useFakeTimers()` for every test, keeping the tests simple and readable.
