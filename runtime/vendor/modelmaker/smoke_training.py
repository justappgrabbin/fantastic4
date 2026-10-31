"""Actual tiny training smoke check; requires requirements.txt dependencies."""
import json
import math
import os
from pathlib import Path
import tempfile
import zipfile

with tempfile.TemporaryDirectory(prefix="modelmaker-smoke-") as temporary:
    os.environ["MODELMAKER_DATA_DIR"] = temporary
    from app import train_model
    from transformers import GPT2LMHeadModel, PreTrainedTokenizerFast
    text = "A traveler offers friendship. The guardian welcomes the traveler. They cross into the forest. " * 40
    summary, artifact = train_model("smoke", text, [], 512, 32, 1, 2, 64, 1, 2, 0.001, False)
    assert artifact, summary
    destination = Path(temporary) / "reload"
    with zipfile.ZipFile(artifact) as archive:
        archive.extractall(destination)
    metadata_path = next(destination.rglob("modelmaker_build.json"))
    metadata = json.loads(metadata_path.read_text())
    model = GPT2LMHeadModel.from_pretrained(metadata_path.parent, local_files_only=True)
    tokenizer = PreTrainedTokenizerFast.from_pretrained(metadata_path.parent, local_files_only=True)
    import torch
    model.eval()
    batch = tokenizer("The traveler welcomes friendship.", return_tensors="pt")
    with torch.no_grad():
        loss = model(**batch, labels=batch["input_ids"]).loss.item()
    assert math.isfinite(loss), loss
    print("PASS: tiny local training, artifact extraction, checkpoint reload and finite inference loss")
