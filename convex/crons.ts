// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "purge expired sessions",
  { hours: 6 },
  internal.sessions.purgeExpiredInternal,
  {},
);

export default crons;
