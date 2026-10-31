from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
import traceback
import time
import hashlib
import uuid
import threading
import zipfile
from pathlib import Path
from typing import Iterable

import gradio as gr
import torch
from huggingface_hub import HfApi
from tokenizers import ByteLevelBPETokenizer
from transformers import GPT2Config, GPT2LMHeadModel, GPT2TokenizerFast
from training_contract import dataset_text, safe_name, validate_config, pack_tokens

APP_TITLE = "Modelmaker"
DEFAULT_NAMESPACE = "stellarproximology"


_dataset_text = dataset_text
_safe_name = safe_name
DATA_ROOT = Path(os.getenv('MODELMAKER_DATA_DIR', '/data/modelmaker' if Path('/data').is_dir() else str(Path(__file__).parent / 'data')))
DATA_ROOT.mkdir(parents=True, exist_ok=True)
_CANCEL_EVENTS = {}
_CANCEL_LOCK = threading.Lock()


def _write_status(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2), encoding='utf-8')
    temp.replace(path)


def _build_tokenizer(text_path: Path, output_dir: Path, vocab_size: int) -> GPT2TokenizerFast:
    tokenizer_dir = output_dir / "tokenizer_build"
    tokenizer_dir.mkdir(parents=True, exist_ok=True)

    trainer = ByteLevelBPETokenizer()
    trainer.train(
        files=[str(text_path)],
        vocab_size=max(256, int(vocab_size)),
        min_frequency=1,
        special_tokens=["<|pad|>", "<|bos|>", "<|eos|>", "<|unk|>"],
    )
    trainer.save_model(str(tokenizer_dir))

    tokenizer = GPT2TokenizerFast(
        vocab_file=str(tokenizer_dir / "vocab.json"),
        merges_file=str(tokenizer_dir / "merges.txt"),
        bos_token="<|bos|>",
        eos_token="<|eos|>",
        unk_token="<|unk|>",
        pad_token="<|pad|>",
    )
    return tokenizer


def _make_sequences(token_ids, context_length, pad_id=0):
    return pack_tokens(token_ids, context_length, pad_id)


def _zip_dir(directory: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in directory.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(directory))


def _push_model(model_dir: Path, model_name: str) -> str:
    token = os.getenv("HF_TOKEN", "").strip()
    if not token:
        return "HF_TOKEN is not set, so the model was built locally but not pushed."

    repo_id = model_name if "/" in model_name else f"{DEFAULT_NAMESPACE}/{model_name}"
    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, repo_type="model", exist_ok=True)
    api.upload_folder(folder_path=str(model_dir), repo_id=repo_id, repo_type="model")
    return f"Pushed to https://huggingface.co/{repo_id}"


def train_model(
    model_name: str,
    pasted_text: str,
    files,
    vocab_size: int,
    context_length: int,
    layers: int,
    heads: int,
    embedding_size: int,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    push_to_hub: bool,
    progress=gr.Progress(track_tqdm=False),
    request: gr.Request = None,
):
    options = validate_config(vocab_size, context_length, layers, heads, embedding_size, epochs, batch_size, learning_rate)
    work_root = DATA_ROOT / f"{_safe_name(model_name)}-{uuid.uuid4().hex[:12]}"
    work_root.mkdir(parents=True, exist_ok=False)
    status_path = work_root / 'status.json'
    session_id = request.session_hash if request else uuid.uuid4().hex
    stop_event = threading.Event()
    with _CANCEL_LOCK:
        _CANCEL_EVENTS[session_id] = stop_event
    started = time.monotonic()
    max_seconds = int(os.getenv('MODELMAKER_MAX_SECONDS', '900'))
    _write_status(status_path, {'status': 'starting', 'elapsed_seconds': 0})
    try:
        name = _safe_name(model_name)
        model_dir = work_root / name
        model_dir.mkdir(parents=True, exist_ok=True)

        text = _dataset_text(pasted_text, files)
        if len(text.strip()) < 200:
            raise ValueError("Add more training material. Modelmaker needs at least about 200 characters to begin.")

        text_path = work_root / "corpus.txt"
        text_path.write_text(text, encoding="utf-8")

        progress(0.08, desc="Training tokenizer")
        tokenizer = _build_tokenizer(text_path, model_dir, int(vocab_size))
        tokenizer.save_pretrained(model_dir)

        ids = tokenizer.encode(text, add_special_tokens=False)
        sequences = _make_sequences(ids, int(context_length), tokenizer.pad_token_id)

        if int(embedding_size) % int(heads) != 0:
            raise ValueError("Embedding size must divide evenly by the number of attention heads.")

        config = GPT2Config(
            vocab_size=len(tokenizer),
            n_positions=int(context_length),
            n_ctx=int(context_length),
            n_embd=int(embedding_size),
            n_layer=int(layers),
            n_head=int(heads),
            bos_token_id=tokenizer.bos_token_id,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.pad_token_id,
        )

        torch.manual_seed(42)
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = GPT2LMHeadModel(config).to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=float(learning_rate))

        total_params = sum(p.numel() for p in model.parameters())
        # Disjoint sequence holdout. One boundary token overlaps by packing
        # design; adjacent validation windows do not share full training chunks.
        generator = torch.Generator().manual_seed(42)
        order = torch.randperm(len(sequences), generator=generator).tolist()
        validation_count = max(1, len(order) // 10) if len(order) >= 10 else 0
        validation_rows = [sequences[i] for i in order[:validation_count]]
        train_rows = [sequences[i] for i in order[validation_count:]]
        num_batches = max(1, math.ceil(len(train_rows) / int(batch_size)))
        def tensor_batch(rows):
            return {key: torch.tensor([row[key] for row in rows], dtype=torch.long, device=device)
                    for key in ('input_ids', 'attention_mask', 'labels')}
        losses: list[float] = []

        progress(0.16, desc=f"Training {total_params:,} parameters on {device.type}")
        model.train()
        for epoch in range(int(epochs)):
            permutation = torch.randperm(len(train_rows)).tolist()
            epoch_loss = 0.0
            epoch_steps = 0

            for start in range(0, len(train_rows), int(batch_size)):
                idx = permutation[start : start + int(batch_size)]
                if stop_event.is_set():
                    raise InterruptedError('Training cancelled; completed epoch checkpoint is retained')
                if time.monotonic() - started > max_seconds:
                    raise TimeoutError(f'Training exceeded {max_seconds}s; completed epoch checkpoint is retained in {work_root}')
                batch = tensor_batch([train_rows[i] for i in idx])

                optimizer.zero_grad(set_to_none=True)
                out = model(**batch)
                loss = out.loss
                if not torch.isfinite(loss):
                    raise ValueError('Training loss became non-finite; reduce learning rate')
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()

                epoch_loss += float(loss.detach().cpu())
                epoch_steps += 1

                completed = epoch * num_batches + epoch_steps
                total_steps = max(1, int(epochs) * num_batches)
                progress(0.16 + 0.68 * (completed / total_steps), desc=f"Epoch {epoch + 1}/{int(epochs)} · step {completed}/{total_steps} · loss {float(loss.detach()):.4f}")
                _write_status(status_path, {'status': 'training', 'epoch': epoch + 1, 'step': completed,
                                          'steps': total_steps, 'loss': float(loss.detach()),
                                          'elapsed_seconds': round(time.monotonic() - started, 1)})

            losses.append(epoch_loss / max(1, epoch_steps))
            checkpoint = work_root / 'checkpoint'
            model.save_pretrained(checkpoint, safe_serialization=True)
            tokenizer.save_pretrained(checkpoint)
            _write_status(work_root / 'checkpoint.json', {'completed_epochs': epoch + 1, 'loss_history': losses})

        validation_loss = None
        if validation_rows:
            model.eval()
            with torch.no_grad():
                values = []
                for start in range(0, len(validation_rows), int(batch_size)):
                    values.append(float(model(**tensor_batch(validation_rows[start:start + int(batch_size)])).loss))
                validation_loss = sum(values) / len(values)
            model.train()

        progress(0.88, desc="Saving Hugging Face model")
        model.save_pretrained(model_dir, safe_serialization=True)
        tokenizer.save_pretrained(model_dir)

        model_card = f"""# {name}\n\nBuilt with **stellarproximology/Modelmaker**.\n\n- Architecture: GPT-2 style causal language model\n- Parameters: {total_params:,}\n- Context length: {int(context_length)}\n- Layers: {int(layers)}\n- Attention heads: {int(heads)}\n- Embedding size: {int(embedding_size)}\n- Vocabulary size: {len(tokenizer)}\n- Epochs: {int(epochs)}\n- Final training loss: {losses[-1]:.6f}\n\nThis model was trained on user-supplied material. Review its outputs before production use.\n"""
        (model_dir / "README.md").write_text(model_card, encoding="utf-8")

        build_meta = {
            "name": name,
            "parameters": total_params,
            "device": device.type,
            "context_length": int(context_length),
            "layers": int(layers),
            "heads": int(heads),
            "embedding_size": int(embedding_size),
            "vocab_size": len(tokenizer),
            "epochs": int(epochs),
            "loss_history": losses,
            "validation_loss": validation_loss,
            "training_sequences": len(train_rows),
            "validation_sequences": len(validation_rows),
            "seed": 42,
            "pretrained_weights": False,
            "elapsed_seconds": round(time.monotonic() - started, 2),
            "corpus_sha256": hashlib.sha256(text.encode('utf-8')).hexdigest(),
        }
        (model_dir / "modelmaker_build.json").write_text(json.dumps(build_meta, indent=2), encoding="utf-8")

        push_message = "Push disabled."
        if push_to_hub:
            progress(0.93, desc="Pushing to Hugging Face")
            push_message = _push_model(model_dir, name)

        zip_path = work_root / f"{name}.zip"
        _zip_dir(model_dir, zip_path)
        progress(1.0, desc="Done")
        _write_status(status_path, {'status': 'completed', 'artifact': str(zip_path), **build_meta})

        summary = (
            f"### Built {name}\n"
            f"- Parameters: **{total_params:,}**\n"
            f"- Training sequences: **{len(sequences):,}**\n"
            f"- Final loss: **{losses[-1]:.6f}**\n"
            f"- Device: **{device.type}**\n"
            f"- {push_message}"
        )
        return summary, str(zip_path)

    except Exception as exc:
        _write_status(status_path, {'status': 'failed', 'error': str(exc), 'elapsed_seconds': round(time.monotonic() - started, 2)})
        detail = traceback.format_exc(limit=5)
        return f"### Build failed\n**{type(exc).__name__}:** {exc}\n\n```text\n{detail}\n```", None

    finally:
        with _CANCEL_LOCK:
            _CANCEL_EVENTS.pop(session_id, None)


def cancel_training(request: gr.Request):
    with _CANCEL_LOCK:
        event = _CANCEL_EVENTS.get(request.session_hash)
        if event:
            event.set()
    return 'Stop requested. Training will stop after the current batch; completed epoch checkpoints remain saved.'


def run_solution(model_name, prompt, task_json):
    from solution_inference import generate_solution
    name = _safe_name(model_name)
    paths = list(DATA_ROOT.glob(f'{name}-*/{name}/modelmaker_build.json'))
    if not paths:
        raise gr.Error('Build this model locally first')
    path = max(paths, key=lambda p: p.stat().st_mtime).parent
    return generate_solution(path, prompt, json.loads(task_json))


def build_ui():
    with gr.Blocks(title=APP_TITLE, theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            "# 🧬 Modelmaker\n"
            "Build a compact causal LLM from your own material. The result is saved in Hugging Face `save_pretrained()` format."
        )

        with gr.Row():
            with gr.Column(scale=3):
                model_name = gr.Textbox(label="Model name", value="synthia-seed")
                pasted_text = gr.Textbox(
                    label="Training text",
                    lines=14,
                    placeholder="Paste training material here, or upload files below.",
                )
                files = gr.File(
                    label="Training files",
                    file_count="multiple",
                    file_types=[".txt", ".md", ".json", ".jsonl", ".py", ".js", ".ts", ".html", ".css", ".csv"],
                )

            with gr.Column(scale=2):
                gr.Markdown("### Model shape")
                vocab_size = gr.Slider(512, 16000, value=4096, step=256, label="Vocabulary")
                context_length = gr.Slider(32, 512, value=128, step=32, label="Context length")
                layers = gr.Slider(1, 12, value=2, step=1, label="Transformer layers")
                heads = gr.Dropdown([1, 2, 4, 8], value=4, label="Attention heads")
                embedding_size = gr.Dropdown([64, 128, 256, 512], value=256, label="Embedding size")

                gr.Markdown("### Training")
                epochs = gr.Slider(1, 20, value=2, step=1, label="Epochs")
                batch_size = gr.Dropdown([1, 2, 4, 8, 16], value=4, label="Batch size")
                learning_rate = gr.Number(value=0.0003, label="Learning rate")
                push_to_hub = gr.Checkbox(
                    value=False,
                    label="Push model to Hugging Face after training (requires HF_TOKEN Space secret)",
                )

        with gr.Row():
            build = gr.Button("Build model", variant="primary")
            stop = gr.Button("Stop training", variant="stop")
        status = gr.Markdown()
        artifact = gr.File(label="Built model package")
        stop.click(cancel_training, outputs=status, queue=False, api_name=False)

        build.click(
            fn=train_model,
            inputs=[
                model_name,
                pasted_text,
                files,
                vocab_size,
                context_length,
                layers,
                heads,
                embedding_size,
                epochs,
                batch_size,
                learning_rate,
                push_to_hub,
            ],
            outputs=[status, artifact],
            concurrency_limit=1,
            concurrency_id='modelmaker-compute',
        )

        with gr.Accordion('Klein-guided next BEST token', open=False):
            gr.Markdown('Use your own trained model to propose continuations. Explicit grammar, semantic facts, action consequences and goals select among them. A verified solution means the declared symbolic goals were reached; it is not a guarantee about an arbitrary real-world task.')
            solution_prompt = gr.Textbox(label='Planning prompt', value='Actions to reach the goal: ')
            task_spec = gr.Textbox(label='Klein task specification (JSON)', lines=12, value=json.dumps({
                'facts': [['traveler', 'is_a', 'person']],
                'goals': [['traveler', 'at', 'forest']],
                'actions': {
                    'offer': {'requires': [['traveler', 'is_a', 'person']], 'adds': [['guardian', 'state', 'welcoming']]},
                    'cross': {'requires': [['guardian', 'state', 'welcoming']], 'adds': [['traveler', 'at', 'forest']]}
                }
            }, indent=2))
            plan = gr.Button('Plan with this trained model')
            solution = gr.JSON(label='Continuation, verified state and inference trace')
            plan.click(run_solution, inputs=[model_name, solution_prompt, task_spec], outputs=solution,
                       concurrency_limit=1, concurrency_id='modelmaker-compute')

        gr.Markdown(
            "Small models are intentional here: Modelmaker should create testable specialized brains first, then scale only when the data and role justify it."
        )

    return demo.queue(max_size=4, default_concurrency_limit=1)


if __name__ == "__main__":
    build_ui().launch(server_name=os.getenv('GRADIO_SERVER_NAME', '0.0.0.0' if os.getenv('SPACE_ID') else '127.0.0.1'))

