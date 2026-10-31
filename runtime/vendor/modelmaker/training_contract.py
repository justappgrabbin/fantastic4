"""Dependency-free input validation, token packing and artifact contracts."""
import json
import math
import re
from pathlib import Path

MAX_CORPUS_BYTES = 8 * 1024 * 1024
TEXT_TYPES = {'.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.csv', '.json', '.jsonl'}


def safe_name(name):
    cleaned = re.sub(r'[^a-zA-Z0-9_.-]+', '-', (name or '').strip()).strip('-._')
    return cleaned[:80] or 'synthia-seed'


def dataset_text(pasted_text, files):
    pieces, total = [], 0
    for text in [pasted_text or '']:
        total += len(text.encode('utf-8'))
        if text.strip():
            pieces.append(text.strip())
    for item in files or []:
        path = Path(item if isinstance(item, (str, Path)) else getattr(item, 'name', None) or str(item))
        if not path.is_file() or path.suffix.lower() not in TEXT_TYPES:
            raise ValueError(f'Unsupported training file: {path.name}')
        if path.stat().st_size > MAX_CORPUS_BYTES:
            raise ValueError(f'Training file exceeds 8 MB: {path.name}')
        text = path.read_text(encoding='utf-8', errors='strict')
        total += len(text.encode('utf-8'))
        if total > MAX_CORPUS_BYTES:
            raise ValueError('Combined training corpus exceeds 8 MB')
        if path.suffix == '.json':
            json.loads(text)
        elif path.suffix == '.jsonl':
            for line in text.splitlines():
                if line.strip():
                    json.loads(line)
        if text.strip():
            pieces.append(text.strip())
    if total > MAX_CORPUS_BYTES:
        raise ValueError('Combined training corpus exceeds 8 MB')
    if not pieces:
        raise ValueError('Add training text or UTF-8 files')
    return '\n\n'.join(pieces)


def validate_config(vocab_size, context_length, layers, heads, embedding_size, epochs, batch_size, learning_rate):
    raw = dict(vocab_size=vocab_size, context_length=context_length, layers=layers, heads=heads,
               embedding_size=embedding_size, epochs=epochs, batch_size=batch_size)
    bounds = {'vocab_size': (512, 16000), 'context_length': (16, 512), 'layers': (1, 12),
              'heads': (1, 8), 'embedding_size': (32, 512), 'epochs': (1, 20), 'batch_size': (1, 16)}
    out = {}
    for key, value in raw.items():
        low, high = bounds[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or int(value) != value or not low <= value <= high:
            raise ValueError(f'{key} must be an integer between {low} and {high}')
        out[key] = int(value)
    if out['embedding_size'] % out['heads']:
        raise ValueError('Embedding size must divide evenly by attention heads')
    if not isinstance(learning_rate, (int, float)) or not math.isfinite(learning_rate) or not 0 < learning_rate <= 0.1:
        raise ValueError('Learning rate must be greater than 0 and at most 0.1')
    out['learning_rate'] = float(learning_rate)
    estimate = out['vocab_size'] * out['embedding_size'] + 12 * out['layers'] * out['embedding_size'] ** 2
    if estimate > 50_000_000:
        raise ValueError('This configuration exceeds the 50M parameter local training budget; reduce layers or width')
    out['estimated_parameters'] = estimate
    return out


def pack_tokens(ids, context_length, pad_id):
    """Identical input/label sequences: GPT-2 performs the only target shift.

    Overlap one boundary token so no next-token transition between windows is
    discarded. Mask padding in labels; keep the short final window.
    """
    if len(ids) < 3:
        raise ValueError('Training text tokenized to fewer than three tokens')
    rows = []
    for start in range(0, len(ids) - 1, context_length - 1):
        tokens = list(ids[start:start + context_length])
        padding = context_length - len(tokens)
        rows.append({'input_ids': tokens + [pad_id] * padding,
                     'attention_mask': [1] * len(tokens) + [0] * padding,
                     'labels': tokens + [-100] * padding})
    return rows
