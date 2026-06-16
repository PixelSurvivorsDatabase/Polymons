from __future__ import annotations

import asyncio
import os
from pathlib import Path
from threading import Lock
from typing import Literal

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client
from tokenizers import Tokenizer

from .model import ModelConfig, PolyCodeModel


BASE_DIR = Path(__file__).parent
DEFAULT_CHECKPOINT = BASE_DIR / "runtime" / "checkpoint-latest.pt"
DEFAULT_TOKENIZER = BASE_DIR / "artifacts" / "tokenizer-28m.json"

CHECKPOINT_PATH = Path(os.getenv("POLYCODE_CHECKPOINT", str(DEFAULT_CHECKPOINT)))
TOKENIZER_PATH = Path(os.getenv("POLYCODE_TOKENIZER", str(DEFAULT_TOKENIZER)))
MODEL_BUCKET = os.getenv("POLYCODE_SUPABASE_BUCKET", "polycode-models")
MODEL_OBJECT = os.getenv(
    "POLYCODE_SUPABASE_OBJECT",
    "checkpoints-28m/checkpoint-latest.pt",
)
MAX_PROMPT_CHARS = int(os.getenv("POLYCODE_MAX_PROMPT_CHARS", "6000"))
MAX_OUTPUT_TOKENS = int(os.getenv("POLYCODE_MAX_OUTPUT_TOKENS", "48"))
TEMPERATURE = float(os.getenv("POLYCODE_TEMPERATURE", "0.18"))
TOP_K = int(os.getenv("POLYCODE_TOP_K", "5"))


class CompletionRequest(BaseModel):
  language: Literal["luau", "cpp", "csharp"]
  prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
  tokens: int = Field(default=MAX_OUTPUT_TOKENS, ge=8, le=96)


class CompletionResponse(BaseModel):
  suggestion: str
  source: Literal["polycode"]


class PolyCodeRuntime:
  def __init__(self) -> None:
    self._loaded = False
    self._lock = Lock()
    self._generation_lock = asyncio.Lock()
    self._tokenizer: Tokenizer | None = None
    self._model: PolyCodeModel | None = None
    self._blocked_tokens: set[int] = set()

  def ensure_checkpoint(self) -> None:
    if CHECKPOINT_PATH.exists():
      return
    supabase_url = os.getenv("POLYCODE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    service_key = (
      os.getenv("POLYCODE_SUPABASE_SERVICE_ROLE_KEY")
      or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
      or os.getenv("SUPABASE_SECRET_KEY")
    )
    if not supabase_url or not service_key:
      raise RuntimeError(
        "Checkpoint is missing and Supabase Storage credentials are not configured."
      )
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    client = create_client(supabase_url, service_key)
    data = client.storage.from_(MODEL_BUCKET).download(MODEL_OBJECT)
    CHECKPOINT_PATH.write_bytes(data)

  def load(self) -> None:
    with self._lock:
      if self._loaded:
        return
      self.ensure_checkpoint()
      if not TOKENIZER_PATH.exists():
        raise RuntimeError(f"Tokenizer not found at {TOKENIZER_PATH}.")
      tokenizer = Tokenizer.from_file(str(TOKENIZER_PATH))
      saved = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)
      model = PolyCodeModel(ModelConfig(**saved["model_config"]))
      model.load_state_dict(saved["model"])
      model.eval()
      blocked_tokens = {
        token
        for token in (
          tokenizer.token_to_id("<|pad|>"),
          tokenizer.token_to_id("<|unk|>"),
          tokenizer.token_to_id("<|bos|>"),
          tokenizer.token_to_id("<|luau|>"),
          tokenizer.token_to_id("<|cpp|>"),
          tokenizer.token_to_id("<|csharp|>"),
        )
        if token is not None
      }
      self._tokenizer = tokenizer
      self._model = model
      self._blocked_tokens = blocked_tokens
      self._loaded = True

  def complete_sync(self, request: CompletionRequest) -> str:
    self.load()
    assert self._tokenizer is not None
    assert self._model is not None
    tokenizer = self._tokenizer
    model = self._model
    language_token = tokenizer.token_to_id(f"<|{request.language}|>")
    bos = tokenizer.token_to_id("<|bos|>")
    eos = tokenizer.token_to_id("<|eos|>")
    if language_token is None or bos is None or eos is None:
      raise RuntimeError("Tokenizer is missing required PolyCode control tokens.")

    prompt = request.prompt[-MAX_PROMPT_CHARS:]
    generated = [language_token, bos, *tokenizer.encode(prompt).ids]
    with torch.no_grad():
      for _ in range(min(request.tokens, MAX_OUTPUT_TOKENS)):
        context = generated[-model.config.max_sequence_length :]
        input_ids = torch.tensor([context], dtype=torch.long)
        logits, _ = model(input_ids)
        scores = logits[0, -1] / max(TEMPERATURE, 0.01)
        for token in self._blocked_tokens:
          scores[token] = -torch.inf
        values, indices = torch.topk(scores, min(TOP_K, len(scores)))
        probabilities = torch.softmax(values, dim=-1)
        next_id = int(indices[torch.multinomial(probabilities, 1)])
        if next_id == eos:
          break
        generated.append(next_id)

    decoded = tokenizer.decode(generated, skip_special_tokens=True).replace("\r\n", "\n")
    normalized_prompt = prompt.replace("\r\n", "\n")
    if decoded.startswith(normalized_prompt):
      return decoded[len(normalized_prompt) :].strip("\n")[:2000]
    return decoded.strip("\n")[:2000]

  async def complete(self, request: CompletionRequest) -> str:
    async with self._generation_lock:
      return await asyncio.to_thread(self.complete_sync, request)


runtime = PolyCodeRuntime()
app = FastAPI(title="PolyCode API", version="0.1.0")


def require_api_key(x_polycode_key: str | None) -> None:
  expected = os.getenv("POLYCODE_API_KEY")
  if not expected:
    raise HTTPException(status_code=503, detail="PolyCode API key is not configured.")
  if x_polycode_key != expected:
    raise HTTPException(status_code=401, detail="Invalid PolyCode API key.")


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


@app.post("/complete", response_model=CompletionResponse)
async def complete(
  request: CompletionRequest,
  x_polycode_key: str | None = Header(default=None),
) -> CompletionResponse:
  require_api_key(x_polycode_key)
  try:
    suggestion = await runtime.complete(request)
  except Exception as error:
    raise HTTPException(status_code=503, detail=str(error)) from error
  return CompletionResponse(suggestion=suggestion, source="polycode")
