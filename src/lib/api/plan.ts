import type { PlanResponse } from "@/types/api";

import { apiRequest } from "./client";

/** The signed-in user's plan and entitlements, for plan badges, limits and upgrade prompts. */
export function getPlan(): Promise<PlanResponse> {
  return apiRequest("/plan");
}
