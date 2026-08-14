from pydantic import BaseModel
from typing import Optional
from datetime import date

class Transaction(BaseModel):
    data: date
    ticker: str
    accao: str
    qtd: float
    preco: float
    comissao: float = 0
    total: float
    notas: Optional[str] = None

class ManualAccount(BaseModel):
    nome: str
    valor: float
