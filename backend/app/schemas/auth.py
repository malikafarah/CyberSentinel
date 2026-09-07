from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
from typing import Optional, Literal
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    LEA_OFFICER = "lea_officer"
    BANK_OFFICER = "bank_officer"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    name: str
    role: str

class UserDocument(BaseModel):
    username: str
    name: str
    role: Literal["admin", "lea_officer", "bank_officer"]
    password_hash: str

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        role_cleaned = v.strip().lower().replace(" ", "_").replace("/", "_")
        role_map = {
            "admin": "admin",
            "lea_officer": "lea_officer",
            "leaofficer": "lea_officer",
            "bank_officer": "bank_officer",
            "bank_fi": "bank_officer",
            "bank": "bank_officer",
            "bankofficer": "bank_officer",
            "i4c_analyst": "lea_officer",
            "analyst": "lea_officer",
        }
        return role_map.get(role_cleaned, role_cleaned)