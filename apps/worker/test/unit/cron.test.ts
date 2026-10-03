import { describe, it, expect } from "vitest";
import { parseCronExpression, cronMatches, isSourceDue } from "../../src/scheduler/cron";

describe("parseCronExpression", () => {
  it("parses wildcard expression", () => {
    const result = parseCronExpression("* * * * *");
    expect(result).not.toBeNull();
    expect(result!.minutes.length).toBe(60);
    expect(result!.hours.length).toBe(24);
  });

  it("parses specific values", () => {
    const result = parseCronExpression("30 12 * * *");
    expect(result).not.toBeNull();
    expect(result!.minutes).toEqual([30]);
    expect(result!.hours).toEqual([12]);
  });

  it("parses ranges", () => {
    const result = parseCronExpression("0 9-17 * * *");
    expect(result).not.toBeNull();
    expect(result!.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("parses lists", () => {
    const result = parseCronExpression("0,15,30,45 * * * *");
    expect(result).not.toBeNull();
    expect(result!.minutes).toEqual([0, 15, 30, 45]);
  });

  it("parses step values", () => {
    const result = parseCronExpression("*/15 * * * *");
    expect(result).not.toBeNull();
    expect(result!.minutes).toEqual([0, 15, 30, 45]);
  });

  it("parses combined range + step", () => {
    const result = parseCronExpression("*/10 9-17 * * 1-5");
    expect(result).not.toBeNull();
    expect(result!.minutes).toEqual([0, 10, 20, 30, 40, 50]);
    expect(result!.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns null for invalid expressions", () => {
    expect(parseCronExpression("")).toBeNull();
    expect(parseCronExpression("* *")).toBeNull();
    expect(parseCronExpression("* * * *")).toBeNull(); // 4 fields
    expect(parseCronExpression("60 * * * *")).toBeNull(); // minute > 59
  });

  it("normalizes day-of-week 7 to 0 (Sunday)", () => {
    const result = parseCronExpression("0 0 * * 7");
    expect(result).not.toBeNull();
    expect(result!.daysOfWeek).toEqual([0]); // 7 → 0
  });
});

describe("cronMatches", () => {
  it("matches wildcard expression for any date", () => {
    const date = new Date("2026-10-02T12:30:00");
    expect(cronMatches("* * * * *", date)).toBe(true);
  });

  it("matches specific time", () => {
    const date = new Date("2026-10-02T12:30:00");
    expect(cronMatches("30 12 * * *", date)).toBe(true);
    expect(cronMatches("0 12 * * *", date)).toBe(false);
  });

  it("matches day of week", () => {
    // October 2, 2026 is a Friday (day 5)
    const friday = new Date("2026-10-02T12:00:00");
    expect(cronMatches("0 12 * * 5", friday)).toBe(true);
    expect(cronMatches("0 12 * * 1", friday)).toBe(false);
  });

  it("returns false for invalid expressions", () => {
    const date = new Date();
    expect(cronMatches("invalid", date)).toBe(false);
  });
});

describe("isSourceDue", () => {
  it("is due when never run before", () => {
    expect(isSourceDue("*/15 * * * *", null)).toBe(true);
  });

  it("is due when cron matches a minute since last run", () => {
    // Last run 20 minutes ago, cron runs every 15 minutes
    const lastRun = new Date(Date.now() - 20 * 60 * 1000);
    const now = new Date();
    expect(isSourceDue("*/15 * * * *", lastRun, now)).toBe(true);
  });

  it("is not due when cron hasn't matched since last run", () => {
    // Last run 1 minute ago, cron runs daily at midnight
    const lastRun = new Date(Date.now() - 1 * 60 * 1000);
    const now = new Date();
    // Unless it's exactly midnight, this shouldn't be due
    if (now.getHours() !== 0 || now.getMinutes() !== 0) {
      expect(isSourceDue("0 0 * * *", lastRun, now)).toBe(false);
    }
  });

  it("returns false for invalid cron expression", () => {
    expect(isSourceDue("invalid", null)).toBe(false);
    expect(isSourceDue("invalid", new Date())).toBe(false);
  });

  it("handles hourly schedule correctly", () => {
    // Last run 2 hours ago, schedule is every hour at :00
    const lastRun = new Date();
    lastRun.setHours(lastRun.getHours() - 2);
    lastRun.setMinutes(0);
    lastRun.setSeconds(0);

    const now = new Date();
    expect(isSourceDue("0 * * * *", lastRun, now)).toBe(true);
  });
});
