import json
from pathlib import Path
import tempfile
import unittest
from training_contract import pack_tokens, validate_config, dataset_text
from solution_policy import SolutionPolicy
from klein_verifier import KleinVerifier


SPEC = {
    'facts': [['traveler', 'is_a', 'visitor'], ['visitor', 'is_a', 'person']],
    'transitive_relations': ['is_a'],
    'goals': [['traveler', 'at', 'forest']],
    'forbidden': [['traveler', 'state', 'injured']],
    'actions': {
        'force': {'requires': [], 'adds': [['traveler', 'state', 'injured']]},
        'offer': {'requires': [['traveler', 'is_a', 'person']], 'adds': [['guardian', 'state', 'welcoming']]},
        'cross': {'requires': [['guardian', 'state', 'welcoming']], 'adds': [['traveler', 'at', 'forest']]},
    },
}


class Contracts(unittest.TestCase):
    def test_token_shift_and_padding(self):
        rows = pack_tokens(list(range(19)), 16, 99)
        self.assertEqual(rows[0]['labels'], rows[0]['input_ids'])
        self.assertEqual(rows[1]['input_ids'][:4], [15, 16, 17, 18])
        self.assertEqual(rows[1]['labels'][4:], [-100] * 12)
        self.assertEqual(rows[1]['attention_mask'][4:], [0] * 12)

    def test_invalid_hyperparameters(self):
        for key, value in [('heads', 0), ('epochs', -1), ('learning_rate', float('nan'))]:
            options = dict(vocab_size=512, context_length=32, layers=1, heads=2,
                           embedding_size=64, epochs=1, batch_size=1, learning_rate=0.001)
            options[key] = value
            with self.assertRaises(ValueError):
                validate_config(**options)

    def test_upload_errors_are_not_training_material(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'invalid.json'
            path.write_text('{broken')
            with self.assertRaises(json.JSONDecodeError):
                dataset_text('', [path])

    def test_klein_inference_is_declared_and_explainable(self):
        verifier = KleinVerifier(SPEC)
        result = verifier.assess(['offer', 'cross'], True)
        self.assertTrue(result['solved'])
        self.assertTrue(result['trace'][0]['inferences'])
        self.assertFalse(verifier.assess(['cross'])['valid'])
        self.assertFalse(verifier.assess(['force'])['valid'])
        self.assertFalse(verifier.verify_text('off')['solved'])
        self.assertFalse(verifier.verify_text('off', True)['valid'])

    def test_next_best_token_can_reject_the_most_probable(self):
        verifier = KleinVerifier(SPEC)
        def propose(prefix):
            return [('force', -0.01), ('offer', -1.0)] if not prefix else [('cross', -0.1)]
        choice = SolutionPolicy(horizon=2).choose([], propose, verifier.assess)
        self.assertEqual(choice['token'], 'offer')
        self.assertEqual(choice['lookahead'], ['offer', 'cross'])
        self.assertTrue(choice['verified_solution'])

    def test_no_feasible_path_does_not_claim_success(self):
        verifier = KleinVerifier(SPEC)
        with self.assertRaises(ValueError):
            SolutionPolicy().choose([], lambda _: [('force', -0.1)], verifier.assess)


if __name__ == '__main__':
    unittest.main()
