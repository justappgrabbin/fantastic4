"""Explicit symbolic verifier for Klein-style grammar, inference and simulation.

Grounded triples + declared transitive relations provide inference. Action
rules simulate consequences. Goals determine completion. No random semantic
embeddings or model-confidence numbers are accepted as proof.
"""
import copy
import re


def triple(value):
    if not isinstance(value, (list, tuple)) or len(value) != 3 or not all(isinstance(v, str) and v for v in value):
        raise ValueError('Semantic triples must have three nonempty strings')
    return tuple(value)


class KleinVerifier:
    def __init__(self, specification):
        self.facts = set(map(triple, specification.get('facts', [])))
        self.goals = set(map(triple, specification.get('goals', [])))
        self.forbidden = set(map(triple, specification.get('forbidden', [])))
        self.transitive = set(specification.get('transitive_relations', ['is_a']))
        self.actions = copy.deepcopy(specification.get('actions', {}))
        if not self.goals or not self.actions:
            raise ValueError('Klein solution task requires goals and action rules')
        if len(self.facts) > 256 or len(self.goals) > 32 or len(self.actions) > 64:
            raise ValueError('Task exceeds bounded symbolic planning budget')
        for name, rule in self.actions.items():
            if not re.fullmatch(r'[a-z][a-z0-9_-]*', name):
                raise ValueError('Action names must be lowercase grammar words')
            for field in ('requires', 'adds', 'removes'):
                rule[field] = list(map(triple, rule.get(field, [])))
        self.last_trace = []

    def closure(self, facts):
        inferred = set(facts); trace = []
        # Only explicitly declared transitive relations may be composed.
        for _ in range(256):
            additions = set()
            for a, relation, b in inferred:
                if relation not in self.transitive:
                    continue
                for c, other_relation, d in inferred:
                    if b == c and relation == other_relation and (a, relation, d) not in inferred:
                        additions.add((a, relation, d))
                        trace.append({'inference': [a, relation, d], 'from': [[a, relation, b], [c, relation, d]]})
            if not additions:
                return inferred, trace
            inferred |= additions
            if len(inferred) > 4096:
                raise ValueError('Semantic closure exceeds inference budget')
        raise ValueError('Semantic closure did not converge')

    def assess(self, actions, final=False):
        facts = set(self.facts); trace = []
        for action in actions:
            if action not in self.actions:
                return {'valid': False, 'score': -1.0, 'solved': False, 'trace': trace, 'reason': 'Unknown grammar action'}
            rule = self.actions[action]; inferred, proofs = self.closure(facts)
            missing = set(rule['requires']) - inferred
            if missing:
                return {'valid': False, 'score': -1.0, 'solved': False, 'trace': trace, 'reason': 'Action preconditions not met'}
            facts -= set(rule['removes']); facts |= set(rule['adds'])
            inferred, proofs_after = self.closure(facts)
            trace.append({'action': action, 'adds': rule['adds'], 'removes': rule['removes'], 'inferences': proofs + proofs_after})
            if self.forbidden & inferred:
                return {'valid': False, 'score': -1.0, 'solved': False, 'trace': trace, 'reason': 'Forbidden world state'}
        inferred, proofs = self.closure(facts)
        reached = self.goals & inferred
        self.last_trace = trace
        return {'valid': True, 'score': len(reached) / len(self.goals), 'solved': self.goals <= inferred,
                'trace': trace, 'reached': list(reached), 'missing': list(self.goals - inferred)}

    def verify_text(self, text, final=False):
        # AUTOLING-like surface recognition is deliberately bounded to the
        # task's declared action grammar. Free-form prose is not proof.
        words = text.strip().split()
        partial = None
        if words and words[-1] not in self.actions:
            if not final and any(name.startswith(words[-1]) for name in self.actions):
                partial = words.pop()
            else:
                return {'valid': False, 'score': -1.0, 'solved': False, 'reason': 'Text does not match the task action grammar'}
        result = self.assess(words, final)
        if partial:
            result['solved'] = False
        return result
