import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/lib/redis.js", () => ({
  redis: {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  },
}));

import { redis } from "@shared/lib/redis.js";
import { loginAttemptGuard } from "../src/shared/lib/login-attempt-guard.js";

const mockedRedis = vi.mocked(redis, true);

describe("loginAttemptGuard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is not locked when there is no recorded failure", async () => {
    mockedRedis.get.mockResolvedValue(null);
    expect(await loginAttemptGuard.isLocked("mario@example.com")).toBe(false);
  });

  it("is locked once the failure count reaches the threshold", async () => {
    mockedRedis.get.mockResolvedValue("5");
    expect(await loginAttemptGuard.isLocked("mario@example.com")).toBe(true);
  });

  it("sets an expiry only on the first recorded failure", async () => {
    mockedRedis.incr.mockResolvedValue(1);
    await loginAttemptGuard.recordFailure("mario@example.com");
    expect(mockedRedis.expire).toHaveBeenCalledWith("login_attempts:mario@example.com", 900);
  });

  it("does not reset the expiry on subsequent failures", async () => {
    mockedRedis.incr.mockResolvedValue(3);
    await loginAttemptGuard.recordFailure("mario@example.com");
    expect(mockedRedis.expire).not.toHaveBeenCalled();
  });
});
