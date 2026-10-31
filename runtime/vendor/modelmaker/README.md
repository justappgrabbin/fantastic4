# Stellarproximology Modelmaker repair

This trainer initializes its own small GPT language model and tokenizer from your text. It needs no pretrained model or API key for local training. It does not train an image diffusion model.

## Run

Use Python 3.10+ in a virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open the address printed by Gradio. Start with a small configuration. Outputs, epoch checkpoints and status are stored under `data/`, or `MODELMAKER_DATA_DIR`. The default training budget is 900 seconds. Stop training cancels cooperatively between batches. Checkpoints do not contain optimizer state for exact resumption.

## Hugging Face Space

Copy **all Python modules in this directory**, plus requirements.txt, into the Space. Copy the supplied README_FRONTMATTER.txt metadata into the Space README as appropriate. app.py alone is insufficient. Use persistent storage for artifacts; ephemeral Space storage can disappear on restart. Publishing a model is optional and requires a write token only when explicitly enabled.

## Repairs and next BEST token

Training labels now let GPT perform one target shift, padding is masked, malformed inputs and excessive configurations are rejected, losses must be finite, and artifacts record the corpus hash and random initialization. Validation loss is shown only when there is a holdout.

The Klein inference interface uses a model trained here. You declare facts, transitive relations, action preconditions/consequences, forbidden states and goals. A bounded search chooses a token using simulated goal progress as well as model likelihood. A solution is reported only when the emitted actions reach the declared goals. This verifies the symbolic specification, not arbitrary real-world correctness. See test_contracts.py for a complete specification example.

## Verify

```sh
python -m unittest -v test_contracts.py
python smoke_training.py
```

The six dependency-free contract tests passed in the repair environment. smoke_training.py exercises actual training and checkpoint reload, but has **not been executed here** because PyTorch, Transformers and Gradio are unavailable. No trained model is included. Neither the GitHub repository nor the live Space has been updated by this package.
