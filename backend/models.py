import re
from typing import Optional
from pydantic import BaseModel, field_validator


class StockSymbol(BaseModel):
    symbol: str

    @field_validator("symbol", mode="before")
    @classmethod
    def normalize(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("Symbol is required")
        if not re.match(r"^[A-Z0-9.\-]{1,10}$", v):
            raise ValueError(f"Invalid symbol format: {v}")
        return v


class PromptCreate(BaseModel):
    name: str
    prompt_text: str
    output_schema: dict
    description: str = ""

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Prompt name is required")
        return v.strip()

    @field_validator("output_schema")
    @classmethod
    def valid_schema(cls, v: dict) -> dict:
        if "properties" not in v:
            raise ValueError("output_schema must have a 'properties' key")
        return v


class PromptUpdate(PromptCreate):
    active: int = 1

    @field_validator("active")
    @classmethod
    def valid_active(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("active must be 0 or 1")
        return v


class RunRequest(BaseModel):
    stocks: Optional[list[str]] = None
    prompts: Optional[list[int]] = None
    model: Optional[str] = None
    batch: bool = False


class SettingsPayload(BaseModel):
    model: str

    @field_validator("model")
    @classmethod
    def valid_model(cls, v: str) -> str:
        known = {
            "claude-haiku-4-5-20251001",
            "claude-sonnet-4-20250514",
            "claude-opus-4-5",
        }
        if v not in known:
            raise ValueError(f"Unknown model: {v}")
        return v


class EstimateRequest(BaseModel):
    stock_count: int
    prompt_count: int
    model: str = "claude-sonnet-4-20250514"


class RetroactiveRequest(BaseModel):
    from_date: str
    to_date: str
    model: str = "claude-sonnet-4-20250514"

    @field_validator("from_date", "to_date")
    @classmethod
    def valid_date(cls, v: str) -> str:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError(f"Invalid date format (expected YYYY-MM-DD): {v}")
        return v


class SuggestionRequest(BaseModel):
    model: str = "claude-sonnet-4-20250514"
