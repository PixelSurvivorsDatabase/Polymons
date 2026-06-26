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

## Tiny local chat model

PolyCode also has an experimental local chat path for a tiny 6.5M parameter
model, rounded as `polycode-6m-chat`. It is meant for PowerShell experiments
and simple scripting Q&A, not production-quality Studio autocomplete.

Build the chat corpus:

```powershell
python polycode/build_chat_corpus.py
```

Train it on CPU:

```powershell
python polycode/train.py `
  --config polycode/config/model-6m-chat.json `
  --tokenizer polycode/artifacts/tokenizer.json `
  --train-data polycode/data/generated-chat/train.jsonl `
  --validation-data polycode/data/generated-chat/validation.jsonl `
  --output-dir polycode/checkpoints-chat-6m `
  --sequence-length 256 `
  --batch-size 1 `
  --gradient-accumulation 2 `
  --max-steps 1500
```

Resume training:

```powershell
python polycode/train.py `
  --config polycode/config/model-6m-chat.json `
  --tokenizer polycode/artifacts/tokenizer.json `
  --train-data polycode/data/generated-chat/train.jsonl `
  --validation-data polycode/data/generated-chat/validation.jsonl `
  --output-dir polycode/checkpoints-chat-6m `
  --sequence-length 256 `
  --batch-size 1 `
  --gradient-accumulation 2 `
  --max-steps 1500 `
  --resume polycode/checkpoints-chat-6m/checkpoint-latest.pt
```

Chat in PowerShell after a checkpoint exists:

```powershell
python polycode/chat.py
```

Or ask one question:

```powershell
python polycode/chat.py --message "How do I make a button give Coins?"
```

## Quick local PolyGPT

For a rough terminal assistant that uses the completed 13M checkpoint and saves
persistent memory locally:

```powershell
python polycode/polygpt.py
```

By default it will use a chat-trained 13M checkpoint from
`polycode/checkpoints-polygpt-13m/` if one exists. If not, it falls back to the
completed 13M code checkpoint.

To train a dedicated 13M PolyGPT chat checkpoint:

```powershell
python polycode/build_chat_corpus.py
python polycode/train.py `
  --config polycode/config/model-13m.json `
  --tokenizer polycode/artifacts/tokenizer.json `
  --train-data polycode/data/generated-chat/train.jsonl `
  --validation-data polycode/data/generated-chat/validation.jsonl `
  --output-dir polycode/checkpoints-polygpt-13m `
  --sequence-length 512 `
  --batch-size 1 `
  --gradient-accumulation 2 `
  --max-steps 1500
```

Useful commands inside the chat:

```text
/remember TEXT  save a persistent note
/memory         show saved turns and notes
/reset          clear chat turns but keep notes
/forget         clear all local PolyGPT memory
/exit           stop chatting
```

The 13M checkpoint was trained with a 512 token maximum sequence length, so
`polygpt.py` keeps a longer memory file on disk but only packs the most recent
conversation that fits the model each turn. A real 658-1500 token context window
needs a checkpoint trained with a larger `max_sequence_length`.

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
Poly Studio -> Polymons Server -> PolyCode API -> release/direct checkpoint URL
```

The main Polymons server keeps account auth and request limits. The separate
PolyCode API owns PyTorch, loads the checkpoint once, and can fail without
taking down games or accounts.

### Host the stable 13M checkpoint outside Supabase Storage

To avoid burning Supabase egress when Render restarts a PolyCode instance, put
the checkpoint on a large-file host such as a GitHub Release asset and set:

```text
POLYCODE_13M_CHECKPOINT_URL=https://github.com/PixelSurvivorsDatabase/Polymons/releases/latest/download/polycode-13m-checkpoint-final.pt
```

The experimental 28M model can use:

```text
POLYCODE_28M_CHECKPOINT_URL=https://github.com/PixelSurvivorsDatabase/Polymons/releases/latest/download/polycode-28m-checkpoint-latest.pt
```

The API writes the download to a local runtime checkpoint once per service
instance. Supabase Storage is still supported as a fallback if the URL env vars
are not set.

### Fallback: upload the stable 13M checkpoint to Supabase Storage

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
POLYCODE_13M_CHECKPOINT_URL=https://github.com/PixelSurvivorsDatabase/Polymons/releases/latest/download/polycode-13m-checkpoint-final.pt
```

Only add the Supabase checkpoint env vars if you intentionally want the
Supabase Storage fallback:

```text
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
