from typing import Any

from pydantic import BaseModel, Field


class BureauIn(BaseModel):
    id: str | None = None
    name: str
    inscrits: int = 0
    capacite: int = 0
    ville: str = ""
    region: str = ""
    status: str = "attente"
    code: str = ""
    centre: str = ""
    adresse: str = ""
    pin: str = ""


class BureauCreate(BaseModel):
    bureau: BureauIn | None = None


class VoteIn(BaseModel):
    bureau_id: str = Field(..., alias="bureau_id")
    parti_id: str
    mourakib_id: str
    delta: int
    actif: str = ""

    model_config = {"populate_by_name": True}


class AuthIn(BaseModel):
    pin: str
    bureau_id: str | None = None


class AuthOut(BaseModel):
    token: str
    role: str
    bureau_id: str | None = None


class StateOut(BaseModel):
    ok: bool = True
    state: dict[str, Any] | None = None
    changed: bool | None = None
