"""
Core portfolio computation:
- Groups transactions by ticker
- Calculates positions (units, cost basis / PE, current value, gains)
- Groups into asset categories
- Computes CA (Certificados de Aforro) accretion
"""

from collections import defaultdict
from datetime import date, datetime
import math

from config import ETF_TICKERS, CRYPTO_TICKERS, PPR_TICKERS, P2P_TICKERS, CA_TICKERS

def _ticker_category(ticker: str) -> str:
    if ticker in ETF_TICKERS or ticker.endswith(".DE") or ticker.endswith(".IE"):
        return "etf"
    if ticker in CRYPTO_TICKERS:
        return "crypto"
    if ticker in PPR_TICKERS:
        return "ppr"
    if ticker in P2P_TICKERS:
        return "p2p"
    if ticker.startswith("CA -"):
        return "ca"
    return "other"

def _compute_ca_value(subscricao: date, unidades: int, valorization_un: float = None) -> dict:
    """
    Certificados de Aforro Série E accrual.
    Série E: taxa base = Euribor 3m (floor 0%) + spread 1%.
    Capitalization quarterly. We use stored valorization_un if available,
    otherwise estimate at ~3.5% annual.
    """
    today = date.today()
    years = (today - subscricao).days / 365.25
    # Use stored valorization unit if known, else estimate
    if valorization_un and valorization_un > 1:
        value = unidades * valorization_un
    else:
        # Rough estimate: 3.5% annual simple
        rate = 0.035
        value = unidades * (1 + rate * years)
    return value

def compute_portfolio(transactions: list[dict], prices: dict, accounts: list[dict]) -> dict:
    # ── Build positions ───────────────────────────────────────────────────────
    positions = defaultdict(lambda: {
        "units": 0.0, "cost_basis": 0.0, "realized": 0.0,
        "p2p_invested": 0.0, "p2p_interest": 0.0,
        "ca_subscricoes": [],
    })

    for t in transactions:
        ticker = t["ticker"]
        accao = t["accao"].lower().strip()
        qtd = float(t["qtd"])
        preco = float(t["preco"])
        comissao = float(t["comissao"])
        total = abs(float(t["total"]))
        data = t["data"] if isinstance(t["data"], date) else datetime.strptime(str(t["data"]), "%Y-%m-%d").date()

        pos = positions[ticker]
        cat = _ticker_category(ticker)

        if cat == "p2p":
            if accao == "p2p":
                pos["p2p_invested"] += total
                pos["units"] += total
                pos["cost_basis"] += total
            elif accao in ("juro", "dividendo", "drip"):
                pos["p2p_interest"] += total
                pos["units"] += total
            elif accao == "levantamento":
                pos["units"] -= total
                pos["realized"] += total - pos["cost_basis"] * (total / max(pos["units"] + total, 1))
        elif cat == "ca":
            if accao == "compra":
                pos["units"] += qtd
                pos["cost_basis"] += total
                pos["ca_subscricoes"].append({
                    "data": data.isoformat(),
                    "unidades": int(qtd),
                    "custo": total,
                    "taxa_q": None,
                })
        elif accao in ("compra", "drip", "deposito"):
            pos["units"] += qtd
            pos["cost_basis"] += total
        elif accao in ("venda", "levantamento"):
            if pos["units"] > 0:
                avg_cost = pos["cost_basis"] / pos["units"]
                pos["realized"] += (preco - avg_cost) * qtd - comissao
                pos["cost_basis"] -= avg_cost * qtd
                pos["units"] -= qtd
        elif accao in ("dividendo", "juro"):
            pos["realized"] += total
        elif accao == "split":
            pos["units"] *= qtd  # qtd = ratio
        elif accao == "ajustamento":
            pos["cost_basis"] += total

    # ── Build per-asset output ────────────────────────────────────────────────
    etfs, cryptos, pprs, p2ps, cas = [], [], [], [], []

    for ticker, pos in positions.items():
        cat = _ticker_category(ticker)
        price_data = prices.get(ticker, {})
        current_price = price_data.get("price")
        change_24h = price_data.get("change_24h", 0)
        change_24h_pct = price_data.get("change_24h_pct", 0)

        units = pos["units"]
        cost_basis = pos["cost_basis"]
        pe = (cost_basis / units) if units > 0 else 0  # preço de equilíbrio (avg cost/unit)

        if cat == "p2p":
            invested = pos["p2p_invested"]
            interest = pos["p2p_interest"]
            current_value = pos["units"]  # units tracks current balance
            gains = interest  # for P2P, gains = interest earned
            gains_pct = (gains / invested * 100) if invested > 0 else 0
            p2ps.append({
                "nome": ticker, "ticker": ticker,
                "investimento": round(invested, 2),
                "juro": round(interest, 2),
                "valor": round(current_value, 2),
                "ganhos": round(gains, 2),
                "ganhos_pct": round(gains_pct, 2),
            })

        elif cat == "ca":
            # For CA, current value comes from stored valorization_un
            # We approximate: sum of subscriptions accrued
            ca_value = 0
            ganhos = 0
            subscricoes = []
            for sub in pos["ca_subscricoes"]:
                sub_date = datetime.strptime(sub["data"], "%Y-%m-%d").date()
                # Use invested as minimum, IGCP provides actual valorization
                # We'll return subscricoes for frontend to display
                subscricoes.append(sub)
            # Total invested
            invested = round(cost_basis, 2)
            # Approx current value (will be updated via manual valorization_un)
            current_value = invested  # placeholder; user updates manually
            cas.append({
                "ticker": ticker,
                "investido": invested,
                "valor_atual": current_value,
                "ganhos": 0,
                "ganhos_pct": 0,
                "subscricoes": subscricoes,
            })

        elif cat in ("etf", "crypto", "ppr") and units > 0.0001:
            current_value = (current_price * units) if current_price else cost_basis
            var_24h_val = change_24h * units if change_24h else 0
            unrealized = current_value - cost_basis
            total_gains = unrealized + pos["realized"]
            gains_pct = (total_gains / cost_basis * 100) if cost_basis > 0 else 0

            row = {
                "nome": ticker, "ticker": ticker,
                "moeda": "EUR",
                "unidades": round(units, 8),
                "pe": round(pe, 4),
                "pe_total": round(cost_basis, 2),
                "preco": round(current_price, 4) if current_price else None,
                "variacao_24h": round(change_24h, 4) if change_24h else None,
                "variacao_24h_pct": round(change_24h_pct, 2) if change_24h_pct else None,
                "variacao_24h_valor": round(var_24h_val, 2),
                "valor": round(current_value, 2),
                "ganhos": round(total_gains, 2),
                "ganhos_pct": round(gains_pct, 2),
                "realizados": round(pos["realized"], 2),
                "nao_realizados": round(unrealized, 2),
            }
            if cat == "etf":
                etfs.append(row)
            elif cat == "crypto":
                cryptos.append(row)
            elif cat == "ppr":
                pprs.append(row)

    # ── Category summaries ────────────────────────────────────────────────────
    def summarize(assets: list, value_key="valor", invested_key="pe_total"):
        total_val = sum(a.get(value_key, 0) or 0 for a in assets)
        total_inv = sum(a.get(invested_key, 0) or 0 for a in assets)
        total_gains = sum(a.get("ganhos", 0) or 0 for a in assets)
        total_24h = sum(a.get("variacao_24h_valor", 0) or 0 for a in assets)
        gains_pct = (total_gains / total_inv * 100) if total_inv > 0 else 0
        return {
            "valor_atual": round(total_val, 2),
            "ganhos": round(total_gains, 2),
            "ganhos_pct": round(gains_pct, 2),
            "investido": round(total_inv, 2),
            "variacao_24h": round(total_24h, 2),
            "variacao_24h_pct": round((total_24h / (total_val - total_24h) * 100) if total_val > 0 else 0, 2),
            "realizados": round(sum(a.get("realizados", 0) or 0 for a in assets), 2),
            "nao_realizados": round(sum(a.get("nao_realizados", 0) or 0 for a in assets), 2),
        }

    def summarize_p2p(assets):
        total_val = sum(a["valor"] for a in assets)
        total_inv = sum(a["investimento"] for a in assets)
        total_gains = sum(a["ganhos"] for a in assets)
        gains_pct = (total_gains / total_inv * 100) if total_inv > 0 else 0
        return {
            "valor_atual": round(total_val, 2),
            "ganhos": round(total_gains, 2),
            "ganhos_pct": round(gains_pct, 2),
            "investido": round(total_inv, 2),
        }

    etf_summary = summarize(etfs)
    crypto_summary = summarize(cryptos)
    ppr_summary = summarize(pprs)
    p2p_summary = summarize_p2p(p2ps)

    ca_invested = sum(c["investido"] for c in cas)
    ca_summary = {
        "valor_atual": ca_invested,  # placeholder
        "investido": round(ca_invested, 2),
        "ganhos": 0,
        "ganhos_pct": 0,
    }

    # ── Dinheiro (manual accounts) ────────────────────────────────────────────
    dinheiro_total = sum(float(a["valor"]) for a in accounts)
    poupanca_total = 0.0  # Could be tagged separately; for now CA = poupança
    # Actually: poupança = CA (Aforro) + bank savings
    aforro_val = ca_invested  # Will be updated with real CA values

    # ── Global overview ───────────────────────────────────────────────────────
    total_portfolio = (
        etf_summary["valor_atual"] +
        crypto_summary["valor_atual"] +
        ppr_summary["valor_atual"] +
        p2p_summary["valor_atual"] +
        aforro_val +
        dinheiro_total
    )
    total_invested = (
        etf_summary["investido"] +
        crypto_summary["investido"] +
        ppr_summary["investido"] +
        p2p_summary["investido"] +
        ca_invested
    )
    total_gains = (
        etf_summary["ganhos"] +
        crypto_summary["ganhos"] +
        ppr_summary["ganhos"] +
        p2p_summary["ganhos"] +
        ca_summary["ganhos"]
    )
    total_gains_pct = (total_gains / total_invested * 100) if total_invested > 0 else 0

    return {
        "overview": {
            "valor_total": round(total_portfolio, 2),
            "ganhos_total": round(total_gains, 2),
            "ganhos_pct": round(total_gains_pct, 2),
            "etfs": etf_summary["valor_atual"],
            "crypto": crypto_summary["valor_atual"],
            "pprs": ppr_summary["valor_atual"],
            "p2p": p2p_summary["valor_atual"],
            "aforro": round(aforro_val, 2),
            "dinheiro": round(dinheiro_total, 2),
        },
        "etfs": {"assets": etfs, "summary": etf_summary},
        "crypto": {"assets": cryptos, "summary": crypto_summary},
        "pprs": {"assets": pprs, "summary": ppr_summary},
        "p2p": {"assets": p2ps, "summary": p2p_summary},
        "ca": {"assets": cas, "summary": ca_summary},
        "accounts": accounts,
        "ganhos_por_categoria": {
            "ETFs": {"ganhos": etf_summary["ganhos"], "valor": etf_summary["valor_atual"]},
            "P2P": {"ganhos": p2p_summary["ganhos"], "valor": p2p_summary["valor_atual"]},
            "Crypto": {"ganhos": crypto_summary["ganhos"], "valor": crypto_summary["valor_atual"]},
            "PPRs": {"ganhos": ppr_summary["ganhos"], "valor": ppr_summary["valor_atual"]},
            "Poupança": {"ganhos": ca_summary["ganhos"], "valor": aforro_val},
        }
    }
