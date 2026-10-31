"""Bounded next-best-token planning with a caller-supplied outcome verifier.

Model probability proposes candidates. The verifier, not probability, defines
which continuation serves the task. This cannot guarantee a solution beyond
the candidates, horizon and verifier supplied by the caller.
"""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class Candidate:
    tokens: tuple
    log_probability: float
    assessment: dict


class SolutionPolicy:
    def __init__(self, beam_width=4, horizon=4, likelihood_weight=0.05, max_expansions=256):
        if not 1 <= beam_width <= 16 or not 1 <= horizon <= 16 or not 1 <= max_expansions <= 4096:
            raise ValueError('Invalid bounded planning budget')
        if not math.isfinite(likelihood_weight) or likelihood_weight < 0:
            raise ValueError('Likelihood weight must be finite and nonnegative')
        self.beam_width, self.horizon = beam_width, horizon
        self.likelihood_weight, self.max_expansions = likelihood_weight, max_expansions

    def choose(self, prefix, propose, verify):
        """propose(tokens)->(token,log_probability) pairs; verify(tokens,final).

        Assessment must have valid:bool, score:finite float, solved:bool.
        Invalid paths are excluded. solved must mean checked completion, not
        a confidence claim. Return the selected first token with its trace.
        """
        prefix = tuple(prefix); beam = [Candidate(prefix, 0.0, {'valid': True, 'score': 0.0, 'solved': False})]
        expanded = 0; solved = []
        for depth in range(self.horizon):
            candidates = []
            for path in beam:
                for token, logp in list(propose(path.tokens))[:self.beam_width]:
                    if expanded >= self.max_expansions:
                        break
                    if not math.isfinite(logp) or logp > 0:
                        raise ValueError('Proposer must return finite log probabilities <= 0')
                    tokens = path.tokens + (token,)
                    assessment = verify(tokens, depth == self.horizon - 1)
                    score = assessment.get('score')
                    if not isinstance(assessment.get('valid'), bool) or not isinstance(assessment.get('solved'), bool) or not isinstance(score, (int, float)) or not math.isfinite(score):
                        raise ValueError('Verifier must return valid, finite score, and solved')
                    expanded += 1
                    if assessment['valid']:
                        item = Candidate(tokens, path.log_probability + logp, assessment)
                        (solved if assessment['solved'] else candidates).append(item)
                if expanded >= self.max_expansions:
                    break
            if solved or not candidates or expanded >= self.max_expansions:
                beam = candidates or beam
                break
            beam = sorted(candidates, key=self.rank, reverse=True)[:self.beam_width]
        eligible = solved or [c for c in beam if len(c.tokens) > len(prefix)]
        if not eligible:
            raise ValueError('No continuation passed the supplied constraints')
        winner = max(eligible, key=self.rank)
        return {'token': winner.tokens[len(prefix)], 'lookahead': list(winner.tokens[len(prefix):]),
                'assessment': winner.assessment, 'log_probability': winner.log_probability,
                'expansions': expanded, 'verified_solution': bool(winner.assessment['solved'])}

    def rank(self, candidate):
        return candidate.assessment['score'] + self.likelihood_weight * candidate.log_probability
