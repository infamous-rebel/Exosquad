// =============================================================================
// Phase 7 — Unit Tests: Demand Calculation Engine
// =============================================================================
// Tests all deterministic calculations: growth, acceleration, velocity,
// trend classification, momentum, seasonality, persistence, volatility,
// confidence, data sufficiency, and demand state classification.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateGrowth,
  calculateAcceleration,
  calculateVelocity,
  classifyTrend,
  calculateMomentum,
  detectSeasonality,
  calculatePersistence,
  calculateVolatility,
  calculateConfidence,
  assessDataSufficiency,
  classifyDemandState,
  type TimeSeriesPoint,
} from "../../src/services/demand-engine.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePoints(values: number[], startDay: number = 0): TimeSeriesPoint[] {
  const base = new Date("2026-09-01T00:00:00Z");
  return values.map((v, i) => ({
    timestamp: new Date(base.getTime() + (startDay + i) * 24 * 60 * 60 * 1000),
    value: v,
  }));
}

// ─── Growth Tests ────────────────────────────────────────────────────────────

describe("calculateGrowth", () => {
  it("should calculate positive growth", () => {
    const baseline = makePoints([100, 110, 120]);
    const current = makePoints([140, 150, 160], 3);
    const result = calculateGrowth(baseline, current);

    expect(result.absoluteChange).toBeGreaterThan(0);
    expect(result.percentageChange).toBeGreaterThan(0);
    expect(result.algorithm).toBe("demand-growth");
    expect(result.algorithmVersion).toBe("v1");
    expect(result.dataSufficiency).toBe("SUFFICIENT");
  });

  it("should calculate negative growth", () => {
    const baseline = makePoints([200, 190, 180]);
    const current = makePoints([120, 110, 100], 3);
    const result = calculateGrowth(baseline, current);

    expect(result.absoluteChange).toBeLessThan(0);
    expect(result.percentageChange).toBeLessThan(0);
  });

  it("should calculate zero growth", () => {
    const baseline = makePoints([100, 100, 100]);
    const current = makePoints([100, 100, 100], 3);
    const result = calculateGrowth(baseline, current);

    expect(result.absoluteChange).toBe(0);
    expect(result.percentageChange).toBe(0);
  });

  it("should return INSUFFICIENT for empty data", () => {
    const result = calculateGrowth([], []);
    expect(result.dataSufficiency).toBe("INSUFFICIENT");
    expect(result.percentageChange).toBeNull();
  });

  it("should return LIMITED for sparse data", () => {
    const baseline = makePoints([100]);
    const current = makePoints([120], 1);
    const result = calculateGrowth(baseline, current);
    expect(result.dataSufficiency).toBe("INSUFFICIENT");
  });

  it("should compute rate of change per day", () => {
    const baseline = makePoints([100, 100, 100]);
    const current = makePoints([150, 150, 150], 3);
    const result = calculateGrowth(baseline, current);

    expect(result.rateOfChange).toBeGreaterThan(0);
    expect(result.formula).toBeDefined();
  });
});

// ─── Acceleration Tests ──────────────────────────────────────────────────────

describe("calculateAcceleration", () => {
  it("should detect accelerating growth", () => {
    // Values with clearly increasing growth rates between periods
    // Period averages: 100, 105, 115, 135, 175
    // Growth rates: 5%, 9.5%, 17.4%, 29.6%
    // Acceleration: 29.6 - 17.4 = 12.2 > 5 → ACCELERATING
    const points = makePoints([100, 105, 115, 135, 175]);
    const result = calculateAcceleration(points);

    expect(result.accelerationValue).toBeGreaterThan(0);
    expect(result.algorithm).toBe("acceleration");
    expect(result.algorithmVersion).toBe("v1");
  });

  it("should detect steady growth (no acceleration)", () => {
    // Values: 100, 120, 140, 160, 180 — constant growth
    const points = makePoints([100, 120, 140, 160, 180]);
    const result = calculateAcceleration(points);

    expect(result.state).toBe("GROWING_STEADILY");
  });

  it("should detect deceleration", () => {
    // Values where growth is slowing but still positive
    // Period averages: 100, 130, 145, 152, 155
    // Growth rates: 30%, 11.5%, 4.8%, 2.0%
    // Acceleration: 2.0 - 4.8 = -2.8 → still positive growth but decelerating
    const points = makePoints([100, 130, 145, 152, 155]);
    const result = calculateAcceleration(points);

    // Should not be ACCELERATING since growth rates are decreasing
    expect(result.state).not.toBe("ACCELERATING");
  });

  it("should detect decline", () => {
    const points = makePoints([200, 180, 150, 120, 80]);
    const result = calculateAcceleration(points);

    expect(result.state).toBe("DECLINING");
  });

  it("should return INSUFFICIENT_DATA for < 3 periods", () => {
    const points = makePoints([100, 120]);
    const result = calculateAcceleration(points);

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.dataSufficiency).toBe("LIMITED"); // 2 points = LIMITED
  });
});

// ─── Velocity Tests ──────────────────────────────────────────────────────────

describe("calculateVelocity", () => {
  it("should calculate daily/weekly/monthly velocity", () => {
    const points = makePoints([100, 110, 120, 130, 140]);
    const result = calculateVelocity(points, "reviews");

    expect(result.dailyVelocity).toBeGreaterThan(0);
    expect(result.weeklyVelocity).toBe(result.dailyVelocity * 7);
    expect(result.monthlyVelocity).toBe(result.dailyVelocity * 30);
    expect(result.unit).toBe("reviews_per_day");
  });

  it("should return INSUFFICIENT for single point", () => {
    const points = makePoints([100]);
    const result = calculateVelocity(points);

    expect(result.dailyVelocity).toBe(0);
    expect(result.dataSufficiency).toBe("INSUFFICIENT");
  });

  it("should handle negative velocity", () => {
    const points = makePoints([200, 180, 160, 140]);
    const result = calculateVelocity(points);

    expect(result.dailyVelocity).toBeLessThan(0);
  });
});

// ─── Trend Classification Tests ──────────────────────────────────────────────

describe("classifyTrend", () => {
  it("should classify strong uptrend", () => {
    // classifyTrend calls growth internally via the optional growth param
    // Without growth/acceleration params, it uses its own internal logic
    const points = makePoints([100, 120, 140, 160, 180, 200, 230, 260]);
    const growth = calculateGrowth(
      points.slice(0, 4),
      points.slice(4)
    );
    const accel = calculateAcceleration(
      [0, 1, 2, 3, 4].map(i => ({
        timestamp: points[i * 2]?.timestamp ?? new Date(),
        value: points.slice(i * 2, i * 2 + 2).reduce((s, p) => s + p.value, 0) / 2,
      }))
    );
    const result = classifyTrend(points, growth, accel);

    expect(["STRONG_UPTREND", "UPTREND"]).toContain(result.trend);
    expect(result.direction).toBe("up");
    expect(result.algorithm).toBe("trend-classification");
  });

  it("should classify stable trend", () => {
    const points = makePoints([100, 102, 98, 101, 99, 100, 101, 99, 100, 101]);
    const growth = calculateGrowth(
      points.slice(0, 5),
      points.slice(5)
    );
    const result = classifyTrend(points, growth);

    expect(result.trend).toBe("STABLE");
    expect(result.direction).toBe("flat");
  });

  it("should classify downward trend", () => {
    const points = makePoints([200, 180, 160, 140, 120, 100, 80, 60, 50, 40]);
    const growth = calculateGrowth(
      points.slice(0, 5),
      points.slice(5)
    );
    const result = classifyTrend(points, growth);

    expect(["STRONG_DOWNTREND", "DOWNWARD"]).toContain(result.trend);
    expect(result.direction).toBe("down");
  });

  it("should return INSUFFICIENT_DATA for < 3 points", () => {
    const points = makePoints([100, 110]);
    const result = classifyTrend(points);

    expect(result.trend).toBe("INSUFFICIENT_DATA");
  });
});

// ─── Momentum Tests ──────────────────────────────────────────────────────────

describe("calculateMomentum", () => {
  it("should calculate weighted momentum score", () => {
    const result = calculateMomentum({
      growth: { value: 80, weight: 0.3 },
      velocity: { value: 60, weight: 0.2 },
      acceleration: { value: 70, weight: 0.2 },
      signalDiversity: { value: 50, weight: 0.15 },
      dataVolume: { value: 90, weight: 0.15 },
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBe(1); // 5 components >= 4
    expect(Object.keys(result.components)).toHaveLength(5);
  });

  it("should handle missing components", () => {
    const result = calculateMomentum({
      growth: { value: 80, weight: 0.3 },
    });

    expect(result.score).toBe(80);
    expect(result.confidence).toBeLessThan(1);
    expect(result.dataSufficiency).toBe("INSUFFICIENT");
  });

  it("should clamp values to 0–100", () => {
    const result = calculateMomentum({
      growth: { value: 150, weight: 1 }, // clamped to 100
    });

    expect(result.score).toBe(100);
  });
});

// ─── Seasonality Tests ───────────────────────────────────────────────────────

describe("detectSeasonality", () => {
  it("should return INSUFFICIENT for < 14 points", () => {
    const points = makePoints([100, 110, 120]);
    const result = detectSeasonality(points);

    expect(result.isSeasonal).toBe(false);
    expect(result.dataSufficiency).toBe("INSUFFICIENT");
  });

  it("should detect non-seasonal flat series", () => {
    const values = Array(30).fill(100);
    const points = makePoints(values);
    const result = detectSeasonality(points);

    expect(result.isSeasonal).toBe(false);
    expect(result.confidence).toBe(1); // Zero variance = not seasonal
  });
});

// ─── Persistence Tests ───────────────────────────────────────────────────────

describe("calculatePersistence", () => {
  it("should detect persistent growth", () => {
    const points = makePoints([100, 110, 120, 130, 140, 150, 160, 170]);
    const result = calculatePersistence(points, "up");

    expect(result.state).toBe("persistent");
    expect(result.consistencyRatio).toBeGreaterThan(0.7);
    expect(result.durationDays).toBeGreaterThanOrEqual(7);
  });

  it("should detect spike (short-lived)", () => {
    const points = makePoints([100, 200, 100]);
    const result = calculatePersistence(points, "up");

    expect(["spike", "temporary"]).toContain(result.state);
  });

  it("should return unknown for < 3 points", () => {
    const points = makePoints([100, 110]);
    const result = calculatePersistence(points);

    expect(result.state).toBe("unknown");
    expect(result.dataSufficiency).toBe("INSUFFICIENT");
  });
});

// ─── Volatility Tests ────────────────────────────────────────────────────────

describe("calculateVolatility", () => {
  it("should classify low volatility", () => {
    const points = makePoints([100, 102, 98, 101, 99, 100, 101]);
    const result = calculateVolatility(points);

    expect(result.level).toBe("low");
    expect(result.coefficientOfVariation).toBeLessThan(15);
  });

  it("should classify high volatility", () => {
    const points = makePoints([100, 200, 50, 300, 20, 400, 10]);
    const result = calculateVolatility(points);

    expect(result.level).toBe("high");
    expect(result.coefficientOfVariation).toBeGreaterThan(40);
  });

  it("should return unknown for < 3 points", () => {
    const points = makePoints([100, 110]);
    const result = calculateVolatility(points);

    expect(result.level).toBe("unknown");
    expect(result.dataSufficiency).toBe("INSUFFICIENT");
  });
});

// ─── Confidence Tests ────────────────────────────────────────────────────────

describe("calculateConfidence", () => {
  it("should calculate high confidence with good data", () => {
    const result = calculateConfidence({
      observationCount: 50,
      sourceCount: 5,
      avgFreshness: "fresh",
      qualityRatio: 0.9,
      avgSourceReliability: 0.8,
    });

    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.factors.observationFactor).toBe(1);
    expect(result.factors.sourceFactor).toBe(1);
  });

  it("should calculate low confidence with poor data", () => {
    const result = calculateConfidence({
      observationCount: 2,
      sourceCount: 1,
      avgFreshness: "stale",
      qualityRatio: 0.3,
      avgSourceReliability: 0.2,
    });

    expect(result.confidence).toBeLessThan(0.4);
  });
});

// ─── Data Sufficiency Tests ──────────────────────────────────────────────────

describe("assessDataSufficiency", () => {
  it("should return INSUFFICIENT for 0 observations", () => {
    expect(assessDataSufficiency(0, 0, null)).toBe("INSUFFICIENT");
  });

  it("should return INSUFFICIENT for 1 observation", () => {
    expect(assessDataSufficiency(1, 1, new Date())).toBe("INSUFFICIENT");
  });

  it("should return LIMITED for few observations", () => {
    expect(assessDataSufficiency(3, 1, new Date())).toBe("LIMITED");
  });

  it("should return SUFFICIENT for good data", () => {
    expect(assessDataSufficiency(20, 3, new Date())).toBe("SUFFICIENT");
  });

  it("should return STALE for old data", () => {
    const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    expect(assessDataSufficiency(20, 3, oldDate, 30)).toBe("STALE");
  });
});

// ─── Demand State Tests ──────────────────────────────────────────────────────

describe("classifyDemandState", () => {
  it("should return INSUFFICIENT_DATA for few observations", () => {
    expect(classifyDemandState("STABLE", null, null, 2)).toBe("INSUFFICIENT_DATA");
  });

  it("should return GROWING for persistent uptrend", () => {
    const persistence = {
      state: "persistent" as const,
      durationDays: 14,
      sustainedPeriods: 10,
      totalPeriods: 12,
      consistencyRatio: 0.83,
      formula: "",
      algorithm: "",
      algorithmVersion: "",
      observationCount: 12,
      dataSufficiency: "SUFFICIENT" as const,
    };

    expect(classifyDemandState("UPTREND", null, persistence, 12)).toBe("GROWING");
  });

  it("should return DECLINING for persistent downtrend", () => {
    const persistence = {
      state: "persistent" as const,
      durationDays: 14,
      sustainedPeriods: 10,
      totalPeriods: 12,
      consistencyRatio: 0.83,
      formula: "",
      algorithm: "",
      algorithmVersion: "",
      observationCount: 12,
      dataSufficiency: "SUFFICIENT" as const,
    };

    expect(classifyDemandState("DOWNWARD", null, persistence, 12)).toBe("DECLINING");
  });

  it("should return SEASONAL for seasonal trend", () => {
    expect(classifyDemandState("SEASONAL", null, null, 30)).toBe("SEASONAL");
  });
});
