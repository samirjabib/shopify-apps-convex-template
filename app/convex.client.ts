// app/convex.client.ts
import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error("VITE_CONVEX_URL not set");

export const convexClient = new ConvexReactClient(url);
