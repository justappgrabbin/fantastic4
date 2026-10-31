"""Use your own Modelmaker checkpoint with Klein-guided next-token planning."""
from pathlib import Path
from solution_policy import SolutionPolicy
from klein_verifier import KleinVerifier


def generate_solution(model_dir, prompt, specification, max_new_tokens=64):
    import torch
    from transformers import GPT2LMHeadModel, GPT2TokenizerFast

    root = Path(model_dir).resolve()
    if not (root / 'modelmaker_build.json').is_file():
        raise ValueError('Select a model created by Modelmaker')
    # Strictly local: no pretrained model lookup or network download.
    tokenizer = GPT2TokenizerFast.from_pretrained(root, local_files_only=True)
    model = GPT2LMHeadModel.from_pretrained(root, local_files_only=True).eval()
    verifier = KleinVerifier(specification)
    policy = SolutionPolicy(beam_width=4, horizon=4, max_expansions=64)
    tokens = tokenizer.encode(prompt, add_special_tokens=False) or [tokenizer.bos_token_id]
    initial_length = len(tokens); decisions = []
    if not 1 <= max_new_tokens <= 256:
        raise ValueError('Generation budget must be between 1 and 256 tokens')

    def propose(prefix):
        with torch.no_grad():
            ids = torch.tensor([list(prefix[-model.config.n_positions:])], dtype=torch.long)
            logp = torch.log_softmax(model(ids).logits[0, -1], dim=-1)
            # Special tokens are excluded from the action grammar.
            for special in tokenizer.all_special_ids:
                logp[special] = float('-inf')
            # Grammar masks candidates before beam search. Otherwise a tiny
            # model's four highest-probability tokens might all be invalid,
            # even though lower-probability feasible actions exist.
            candidates = []
            for index in torch.argsort(logp, descending=True).tolist():
                if not torch.isfinite(logp[index]):
                    continue
                text = tokenizer.decode(list(prefix[initial_length:]) + [index], skip_special_tokens=True)
                result = verifier.verify_text(text, False)
                if result['valid'] and text.strip():
                    candidates.append((index, float(logp[index])))
                if len(candidates) == 4:
                    break
            return candidates

    def verify(candidate, final):
        text = tokenizer.decode(candidate[initial_length:], skip_special_tokens=True)
        return verifier.verify_text(text, final)

    for _ in range(max_new_tokens):
        choice = policy.choose(tokens, propose, verify)
        tokens.append(choice['token']); decisions.append(choice)
        actual = verify(tokens, True)
        if actual['solved']:
            return {'text': tokenizer.decode(tokens[initial_length:], skip_special_tokens=True),
                    'verified_solution': True, 'assessment': actual, 'decisions': decisions}
    return {'text': tokenizer.decode(tokens[initial_length:], skip_special_tokens=True),
            'verified_solution': False, 'assessment': verify(tokens, True), 'decisions': decisions,
            'reason': 'No verified solution within the generation budget'}
