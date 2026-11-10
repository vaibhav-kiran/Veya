"""
Subscription plans: what each plan may do.

This is the single place to change when free / paid plans are introduced
for real. Everything else asks for `plan_config(...)` instead of reading
limits from the environment.

    free  -> conservative limits (configurable below / via env)
    paid  -> everything unlocked
"""

import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Plan(str, Enum):
    FREE = "free"
    PAID = "paid"


@dataclass(frozen=True)
class Entitlements:
    """What a plan may do. Enforced in the conversation service and routes."""

    # Stable Diffusion concept images.
    image_generation: bool = True
    # Saved projects per user. None = unlimited.
    max_projects: Optional[int] = None


@dataclass(frozen=True)
class PlanConfig:
    plan: Plan
    label: str
    entitlements: Entitlements = field(default_factory=Entitlements)


def _optional_int(name: str) -> Optional[int]:
    value = os.getenv(name, "").strip()
    return int(value) if value else None


def build_plan_configs() -> dict[Plan, PlanConfig]:
    """Read once at startup (and in tests). Env vars only override limits."""

    free = PlanConfig(
        plan=Plan.FREE,
        label="Free",
        entitlements=Entitlements(
            # Tighten the free plan here when billing exists.
            image_generation=os.getenv("VEYA_FREE_IMAGES", "true").strip().lower() != "false",
            max_projects=_optional_int("VEYA_FREE_MAX_PROJECTS"),
        ),
    )
    paid = PlanConfig(plan=Plan.PAID, label="Pro", entitlements=Entitlements(image_generation=True, max_projects=None))
    return {Plan.FREE: free, Plan.PAID: paid}


PLAN_CONFIGS: dict[Plan, PlanConfig] = build_plan_configs()


def plan_config(plan: Plan | str) -> PlanConfig:
    return PLAN_CONFIGS[Plan(plan)]


class PlanResolver:
    """
    Decides a user's plan from their user id (the X-Veya-User header).

    Today: VEYA_DEFAULT_PLAN for everyone, and VEYA_PAID_USERS (comma
    separated user ids) for testing the paid plan. Later: replace
    plan_for() with a lookup in your billing system or Clerk metadata —
    nothing else needs to change.
    """

    def __init__(self, default_plan: Optional[str] = None, paid_users: Optional[set[str]] = None):
        self.default_plan = Plan((default_plan or os.getenv("VEYA_DEFAULT_PLAN", "free")).strip().lower())
        if paid_users is None:
            paid_users = {item.strip() for item in os.getenv("VEYA_PAID_USERS", "").split(",") if item.strip()}
        self.paid_users = paid_users

    def plan_for(self, owner_id: Optional[str]) -> Plan:
        if owner_id and owner_id in self.paid_users:
            return Plan.PAID
        return self.default_plan
