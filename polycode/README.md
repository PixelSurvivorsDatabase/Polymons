# PolyCode

PolyCode is the experimental code-completion model for Poly Studio. The current
configuration is an approximately 28 million parameter decoder-only Transformer
designed for project-owned Polymons scripts and deterministic Luau, C++, and
C# curricula.

The repository does not yet contain enough human-authored scripts to produce a
production-quality coding model, so this remains an experimental autocomplete
system.

## Training

From the repository root:

```powershell
python polycode/build_corpus.py
python polycode/validate_corpus.py
python polycode/train_tokenizer.py
python polycode/train.py
```

The 28M model uses eight 512-wide attention blocks and a 2,304-wide feed-forward
network. The exact parameter count depends on the trained tokenizer vocabulary.
It must train from scratch because its tensor shapes and tokenizer differ from
the earlier 13M checkpoint. The old architecture remains in
`config/model-13m.json`, and its checkpoints remain in `checkpoints/`.
The default run saves `checkpoint-latest.pt` every 250 steps and stores the
optimizer state, so an interrupted run can continue with:

```powershell
python polycode/train.py --resume polycode/checkpoints-28m/checkpoint-latest.pt
```

Published games owned by the project can be imported as script-only JSONL:

```powershell
python polycode/import_published_game.py GAME_ID --output polycode/data/owned/game.jsonl
python polycode/build_corpus.py
python polycode/train.py --resume polycode/checkpoints-28m/checkpoint-final.pt
```

Imported human-authored scripts are weighted more heavily than individual
synthetic examples, while remaining mixed into the broader corpus to reduce
overfitting.

The synthetic curriculum covers complete gameplay patterns across Luau, C++,
and C#. Exact duplicates are removed before a stable hash-based validation
split is created.

Audit the generated corpus and measure checkpoint loss by gameplay topic:

```powershell
python polycode/validate_corpus.py
python polycode/evaluate_checkpoint.py
```

For a short CPU validation run:

```powershell
python polycode/train.py --max-steps 10 --sequence-length 128 --batch-size 1
```

Test a checkpoint:

```powershell
python polycode/complete.py
```

For multiline prompts containing quotes, use a UTF-8 prompt file so the shell
does not alter the code:

```powershell
python polycode/complete.py --prompt-file prompt.lua
```

Generated corpus files, tokenizers, and checkpoints are intentionally ignored
by Git.

## Curriculum and syntax quality

Training records are sampled as individual scripts rather than flattened into a
single cross-language token stream. Padding tokens are ignored by the loss.
This prevents a batch from beginning in one script and continuing into another.

The corpus builder rejects unbalanced delimiters and Luau block structures.
The advanced curriculum includes server-authoritative purchases, nested
conditions, cooldowns, RemoteEvents, RemoteFunctions, data stores, GUI state,
weighted RNG, modules, round loops, input toggles, sounds, and tween sequences
in all three supported languages.

## Service limits

`config/service.json` defines the initial authenticated-user limits:

- 120 completion requests per rolling 2 hours
- 3,000 generated tokens per rolling hour
- 48 generated tokens per completion
- one active completion per user

The eventual inference service should key limits by numerical Polymons user ID.
Unauthenticated requests should be rejected rather than sharing an IP bucket.
