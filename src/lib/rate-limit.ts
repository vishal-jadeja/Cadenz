import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/** 10 signups per IP per hour */
export const waitlistLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  analytics: true,
  prefix: "cadenz:waitlist",
})

/** 100 requests per user per minute */
export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(100, "1 m"),
  analytics: true,
  prefix: "cadenz:api",
})

/** 10 stats lookups per IP per minute */
export const statsLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
  prefix: "cadenz:stats",
})

/** 20 token verifications per IP per hour */
export const verifyTokenLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"),
  analytics: true,
  prefix: "cadenz:verify-token",
})

/** 20 OAuth connect/disconnect operations per user per hour */
export const connectionsLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"),
  analytics: true,
  prefix: "cadenz:connections",
})

/** 5 invite acceptance attempts per IP per hour */
export const acceptInviteLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: true,
  prefix: "cadenz:accept-invite",
})

export async function checkRateLimit(
  identifier: string,
  limiter: Ratelimit
): Promise<{ success: boolean; reset: number; remaining: number }> {
  const result = await limiter.limit(identifier)
  return {
    success: result.success,
    reset: result.reset,
    remaining: result.remaining,
  }
}
