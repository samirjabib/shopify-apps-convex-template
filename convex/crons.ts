import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sweep rate limits",
  { minutes: 5 },
  internal.lib.rateLimit.sweepRateLimitsInternal,
  {},
);

crons.interval(
  "delete expired sessions",
  { hours: 1 },
  internal.sessions.deleteExpiredInternal,
  {},
);

export default crons;
