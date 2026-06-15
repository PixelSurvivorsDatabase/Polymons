from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class ModelConfig:
    vocab_size: int
    max_sequence_length: int = 512
    layers: int = 6
    heads: int = 6
    embedding_size: int = 384
    feed_forward_size: int = 2048
    dropout: float = 0.1


class CausalSelfAttention(nn.Module):
    def __init__(self, config: ModelConfig):
        super().__init__()
        if config.embedding_size % config.heads:
            raise ValueError("embedding_size must be divisible by heads")
        self.heads = config.heads
        self.head_size = config.embedding_size // config.heads
        self.dropout = config.dropout
        self.qkv = nn.Linear(config.embedding_size, config.embedding_size * 3)
        self.output = nn.Linear(config.embedding_size, config.embedding_size)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        batch, length, width = value.shape
        qkv = self.qkv(value).reshape(
            batch, length, 3, self.heads, self.head_size
        )
        query, key, values = qkv.unbind(dim=2)
        query = query.transpose(1, 2)
        key = key.transpose(1, 2)
        values = values.transpose(1, 2)
        attended = F.scaled_dot_product_attention(
            query,
            key,
            values,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=True,
        )
        attended = attended.transpose(1, 2).contiguous().reshape(
            batch, length, width
        )
        return self.output(attended)


class Block(nn.Module):
    def __init__(self, config: ModelConfig):
        super().__init__()
        self.attention_norm = nn.LayerNorm(config.embedding_size)
        self.attention = CausalSelfAttention(config)
        self.mlp_norm = nn.LayerNorm(config.embedding_size)
        self.mlp = nn.Sequential(
            nn.Linear(config.embedding_size, config.feed_forward_size),
            nn.GELU(),
            nn.Linear(config.feed_forward_size, config.embedding_size),
            nn.Dropout(config.dropout),
        )

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        value = value + self.attention(self.attention_norm(value))
        return value + self.mlp(self.mlp_norm(value))


class PolyCodeModel(nn.Module):
    def __init__(self, config: ModelConfig):
        super().__init__()
        self.config = config
        self.tokens = nn.Embedding(config.vocab_size, config.embedding_size)
        self.positions = nn.Embedding(
            config.max_sequence_length, config.embedding_size
        )
        self.dropout = nn.Dropout(config.dropout)
        self.blocks = nn.ModuleList(Block(config) for _ in range(config.layers))
        self.norm = nn.LayerNorm(config.embedding_size)
        self.output = nn.Linear(config.embedding_size, config.vocab_size, bias=False)
        self.output.weight = self.tokens.weight
        self.apply(self._initialize)

    @staticmethod
    def _initialize(module: nn.Module) -> None:
        if isinstance(module, (nn.Linear, nn.Embedding)):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if isinstance(module, nn.Linear) and module.bias is not None:
                nn.init.zeros_(module.bias)

    def forward(
        self, input_ids: torch.Tensor, targets: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        _, length = input_ids.shape
        if length > self.config.max_sequence_length:
            raise ValueError("input exceeds maximum sequence length")
        positions = torch.arange(length, device=input_ids.device)
        value = self.dropout(self.tokens(input_ids) + self.positions(positions))
        for block in self.blocks:
            value = block(value)
        logits = self.output(self.norm(value))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.reshape(-1, logits.size(-1)),
                targets.reshape(-1),
                ignore_index=-100,
            )
        return logits, loss

    def parameter_count(self) -> int:
        return sum(parameter.numel() for parameter in self.parameters())
