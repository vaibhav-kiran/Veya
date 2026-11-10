"""
The discovery pipeline: runs the ten stages for one session in the background.

It is not a rigid line. Research runs in bounded rounds: if a round yields no
problem or no gap with enough evidence, the next round searches the categories,
keywords and open questions not tried yet (up to MAX_RESEARCH_ROUNDS). Each
candidate idea is checked for feasibility (with one scope-reduction attempt if
it is not feasible), compared with similar work, and challenged by the critic
(with at most MAX_CRITIC_ROUNDS - 1 revisions).
"""

import asyncio
import logging
import uuid
from typing import Optional

from app.core.exceptions import EngineError, IdeaNotFoundError, InvalidSessionStateError, LLMOutputError
from app.repositories.session_repository import SessionRepository
from app.schemas.ideas import CandidateIdea, EvaluatedIdea
from app.schemas.session import STAGES, DiscoverySession
from app.schemas.student import StudentProfile
from app.services.candidate_generator import generate_candidates, revise_idea
from app.services.context import EngineContext
from app.services.critic import critique_idea
from app.services.feasibility_analyzer import assess_feasibility, scope_reduction_instructions
from app.services.gap_analyzer import find_gaps, usable_gaps
from app.services.problem_discovery import extract_problems, gather_problem_evidence
from app.services.profile_review import has_research_direction, review_profile
from app.services.ranking import rank_and_select
from app.services.research_planner import follow_up_queries, plan_research
from app.services.similarity_checker import check_similarity
from app.services.solution_research import research_solutions

logger = logging.getLogger(__name__)

NO_DIRECTION = "Add at least one interest, preferred domain or academic field before starting research."
NOT_ENOUGH_EVIDENCE = (
    "Not enough evidence was found to support any gap, so no ideas were generated. "
    "Weak ideas are not invented to fill the list. Try adding more interests or details."
)


class DiscoveryPipeline:
    def __init__(self, ctx: EngineContext, sessions: SessionRepository):
        self.ctx = ctx
        self.sessions = sessions
        self._busy: set[str] = set()
        self._tasks: set[asyncio.Task] = set()

    # ---------------- session lifecycle ----------------

    def create_session(self, profile: StudentProfile) -> DiscoverySession:
        session = DiscoverySession(session_id=f"ses_{uuid.uuid4().hex[:16]}", profile=profile, review=review_profile(profile))
        return self.sessions.save(session)

    def get_session(self, session_id: str) -> DiscoverySession:
        session = self.sessions.get(session_id)
        if session.status == "running" and session_id not in self._busy:
            # The process restarted while this session was running.
            session.status, session.error = "failed", "Research was interrupted. Start it again."
            self.sessions.save(session)
        return session

    def is_busy(self, session_id: str) -> bool:
        return session_id in self._busy

    def start(self, session_id: str, profile_update: Optional[StudentProfile] = None) -> DiscoverySession:
        session = self.get_session(session_id)
        if self.is_busy(session_id):
            raise InvalidSessionStateError("Research is already running for this session.")
        if profile_update is not None:
            session.profile = session.profile.merged_with(profile_update)
            session.review = review_profile(session.profile)
        if not has_research_direction(session.profile):
            raise InvalidSessionStateError(NO_DIRECTION)
        # A new run starts from a clean slate (stored evidence and cache are reused).
        session.plan, session.problems, session.landscapes, session.gaps, session.ideas = None, [], [], [], []
        session.warnings, session.error, session.research_rounds_used = [], None, 0
        session.status, session.stage, session.progress = "running", "profile", 0.0
        self.sessions.save(session)
        self._launch(session_id)
        return session

    def _launch(self, session_id: str) -> None:
        self._busy.add(session_id)
        task = asyncio.create_task(self.run(session_id))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def shutdown(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    def _stage(self, session: DiscoverySession, stage: str, progress: Optional[float] = None) -> None:
        session.stage = stage
        session.progress = round(progress if progress is not None else STAGES.index(stage) / (len(STAGES) - 1), 2)
        self.sessions.save(session)

    # ---------------- the run ----------------

    async def run(self, session_id: str) -> None:
        session = self.sessions.get(session_id)
        try:
            await self._research(session)
            usable = usable_gaps(session.gaps)
            if usable:
                await self._ideas(session, usable)
            else:
                session.warn(NOT_ENOUGH_EVIDENCE)
            session.status = "completed"
            self._stage(session, "done", 1.0)
        except EngineError as error:
            logger.warning("Session %s failed: %s", session_id, error.user_message)
            session.status, session.error = "failed", error.user_message
            self.sessions.save(session)
        except asyncio.CancelledError:
            session.status, session.error = "failed", "Research was interrupted. Start it again."
            self.sessions.save(session)
            raise
        except Exception:
            logger.exception("Session %s crashed", session_id)
            session.status, session.error = "failed", "Something went wrong during research. Please try again."
            self.sessions.save(session)
        finally:
            self._busy.discard(session_id)

    async def _research(self, session: DiscoverySession) -> None:
        settings = self.ctx.settings
        self._stage(session, "planning")
        session.plan = await plan_research(self.ctx, session)
        self.sessions.save(session)

        used: set[str] = set()
        for research_round in range(1, settings.max_research_rounds + 1):
            if research_round == 1:
                web, academic, github = session.plan.web_queries, session.plan.academic_queries, session.plan.github_queries
            else:
                follow_up = follow_up_queries(session, used, settings.max_queries_per_source)
                if not follow_up:
                    break
                web, academic, github = follow_up, follow_up[:2], []
            used.update(query.lower() for query in [*web, *academic, *github])
            session.research_rounds_used = research_round

            self._stage(session, "problem_discovery")
            found = await gather_problem_evidence(self.ctx, session, web, academic, github)
            new_problems = await extract_problems(self.ctx, session, found, len(session.problems))
            session.problems += new_problems
            self.sessions.save(session)
            if not new_problems:
                continue

            self._stage(session, "solution_research")
            for problem in new_problems:
                session.landscapes.append(await research_solutions(self.ctx, session, problem))
                self.sessions.save(session)

            self._stage(session, "gap_analysis")
            session.gaps += await find_gaps(self.ctx, session, new_problems, len(session.gaps))
            self.sessions.save(session)

            if usable_gaps(session.gaps) or len(session.problems) >= settings.max_problems:
                break

    async def _ideas(self, session: DiscoverySession, gaps) -> None:
        self._stage(session, "candidate_generation")
        candidates = await generate_candidates(self.ctx, session, gaps)
        if not candidates:
            session.warn("No candidate ideas could be grounded in the investigated gaps.")
        start, span = 0.6, 0.3
        for index, idea in enumerate(candidates):
            session.progress = round(start + span * index / len(candidates), 2)
            session.ideas.append(await self.evaluate_candidate(session, idea, self.ctx.settings.max_critic_rounds))
            self.sessions.save(session)

        self._stage(session, "ranking")
        self._rank(session)

    def _rank(self, session: DiscoverySession) -> None:
        settings = self.ctx.settings
        rank_and_select(session.ideas, session.gaps, settings.ranking_weights, settings.min_final_score, settings.max_final_ideas)
        selected = [e for e in session.ideas if e.status == "selected"]
        if session.ideas and len(selected) < settings.max_final_ideas:
            session.warn(f"Only {len(selected)} idea(s) met the quality bar; weaker ideas were not added to fill the list.")

    # ---------------- evaluation of one idea (stages 7–9) ----------------

    async def evaluate_candidate(self, session: DiscoverySession, idea: CandidateIdea, critic_rounds: int) -> EvaluatedIdea:
        evaluated = EvaluatedIdea(idea=idea)
        try:
            session.stage = "feasibility"
            evaluated.feasibility = await assess_feasibility(self.ctx, session, idea)
            if evaluated.feasibility.verdict == "not_feasible":
                # Adaptive: try a smaller, cheaper version once.
                evaluated.idea = await revise_idea(self.ctx, session, idea, scope_reduction_instructions(evaluated.feasibility))
                evaluated.feasibility = await assess_feasibility(self.ctx, session, evaluated.idea)

            session.stage = "similarity"
            evaluated.similarity = await check_similarity(self.ctx, session, evaluated.idea)

            session.stage = "critic"
            for critic_round in range(1, max(1, critic_rounds) + 1):
                evaluated.critic_rounds = critic_round
                evaluated.critique = await critique_idea(self.ctx, session, evaluated)
                if evaluated.critique.verdict != "revise" or critic_round >= critic_rounds:
                    break
                evaluated.idea = await revise_idea(self.ctx, session, evaluated.idea, evaluated.critique.revision_instructions)
                evaluated.feasibility = await assess_feasibility(self.ctx, session, evaluated.idea)
                if evaluated.similarity.label == "significant_existing_overlap":
                    # The revision may have changed the differentiator: compare again.
                    evaluated.similarity = await check_similarity(self.ctx, session, evaluated.idea)
        except LLMOutputError:
            evaluated.critique = None
            evaluated.status = "rejected"
            evaluated.rejection_reason = "Could not be evaluated: the model's answer could not be understood."
        return evaluated

    # ---------------- follow-up actions on one idea ----------------

    def _find(self, idea_id: str) -> tuple[DiscoverySession, int]:
        session = self.sessions.session_for_idea(idea_id)
        for index, evaluated in enumerate(session.ideas):
            if evaluated.idea.idea_id == idea_id:
                return session, index
        raise IdeaNotFoundError()

    def get_idea(self, idea_id: str) -> EvaluatedIdea:
        session, index = self._find(idea_id)
        return session.ideas[index]

    async def _update_idea(self, idea_id: str, profile_update: Optional[StudentProfile], feedback: Optional[str]) -> EvaluatedIdea:
        session, index = self._find(idea_id)
        if self.is_busy(session.session_id):
            raise InvalidSessionStateError("This session is busy. Wait for the current research or refinement to finish.")
        self._busy.add(session.session_id)
        try:
            if profile_update is not None:
                session.profile = session.profile.merged_with(profile_update)
                session.review = review_profile(session.profile)
            idea = session.ideas[index].idea
            if feedback:
                idea = await revise_idea(self.ctx, session, idea, [f"Student feedback: {feedback}"])
            session.ideas[index] = await self.evaluate_candidate(session, idea, critic_rounds=1)
            self._rank(session)
            session.stage = "done"
            self.sessions.save(session)
            return session.ideas[index]
        finally:
            self._busy.discard(session.session_id)

    async def refine(self, idea_id: str, feedback: str) -> EvaluatedIdea:
        """Revise an idea with the student's feedback, then evaluate and re-rank it."""
        return await self._update_idea(idea_id, None, feedback)

    async def reevaluate(self, idea_id: str, profile_update: Optional[StudentProfile]) -> EvaluatedIdea:
        """Re-run feasibility, similarity and the critic (e.g. after the student's situation changed)."""
        return await self._update_idea(idea_id, profile_update, None)


