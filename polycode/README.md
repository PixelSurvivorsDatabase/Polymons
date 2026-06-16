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

## Separate API service

The recommended production shape is:

```text
Poly Studio -> Polymons Server -> PolyCode API -> Supabase Storage checkpoint
```

The main Polymons server keeps account auth and request limits. The separate
PolyCode API owns PyTorch, loads the checkpoint once, and can fail without
taking down games or accounts.

### Upload the stable 13M checkpoint to Supabase Storage

The migration `20260616134231_polycode_model_storage.sql` creates a private
`polycode-models` bucket. After it is pushed, upload the completed 13M
checkpoint:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
.\scripts\upload-polycode-checkpoint.ps1
```

The default object path is:

```text
polycode-models/checkpoints/checkpoint-final.pt
```

The experimental 28M model can be uploaded later:

```powershell
.\scripts\upload-polycode-checkpoint.ps1 `
  -File polycode/checkpoints-28m/checkpoint-latest.pt `
  -Object checkpoints-28m/checkpoint-latest.pt
```

Its object path is:

```text
polycode-models/checkpoints-28m/checkpoint-latest.pt
```

### Deploy the PolyCode API

Create a separate Render Web Service using `render-polycode.yaml` as the
reference:

```text
Build command: pip install -r polycode/requirements-api.txt
Start command: uvicorn polycode.api:app --host 0.0.0.0 --port $PORT
```

Required env vars:

```text
POLYCODE_API_KEY=long-random-secret
POLYCODE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
POLYCODE_SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
POLYCODE_SUPABASE_BUCKET=polycode-models
POLYCODE_SUPABASE_OBJECT=checkpoints/checkpoint-final.pt
```

Then add these to the main Polymons server:

```text
POLYCODE_API_URL=https://YOUR_POLYCODE_SERVICE.onrender.com
POLYCODE_API_KEY=the-same-long-random-secret
```

If those env vars are missing or the PolyCode service is down, Studio falls
back to its built-in autocomplete snippets.

The API accepts `model: "polycode-13m"` and `model: "polycode-28m"`. Studio
currently asks for `polycode-13m` by default because it is the completed stable
checkpoint. The 28M model is wired as a future preview model, not the default
autosuggest path.
