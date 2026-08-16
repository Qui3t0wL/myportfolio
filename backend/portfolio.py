"""
Core portfolio computation.
CA values are passed in pre-calculated from the /api/ca/calculo endpoint.
"""

from collections import defaultdict
from datetime import date, datetime

from config import ETF_TICKERS, CRYPTO_TICKERS, PPR_TICKERS, NO_PRICE_TICKERS

P2P_TICKERS = {"Bondora", "ViaInvest", "Viainvest", "PeerBerry"}

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

def compute_portfolio(
    transactions: list[dict],
    prices: dict,
    accounts: list[dict],
    ca_calculo: dict | None = None,   # pre-calculated CA from /api/ca/calculo
) -> dict:

    # ── Build positions ───────────────────────────────────────────────────────
    positions = defaultdict(lambda: {
        "units": 0.0, "cost_basis": 0.0, "realized": 0.0,
        "p2p_invested": 0.0, "p2p_interest": 0.0,
        "ca_subscricoes": [],
    })

    for t in transactions:
        ticker = t["ticker"]
        accao  = t["accao"].lower().strip()
        qtd    = float(t["qtd"])
        preco  = float(t["preco"])
        comissao = float(t["comissao"])
        total  = abs(float(t["total"]))
        data   = t["data"] if isinstance(t["data"], date) else \
                 datetime.strptime(str(t["data"]), "%Y-%m-%d").date()

        pos = positions[ticker]
        cat = _ticker_category(ticker)

        if cat == "p2p":
            if accao == "p2p":
                pos["p2p_invested"] += total
                pos["units"]        += total
                pos["cost_basis"]   += total
            elif accao in ("juro", "dividendo", "drip"):
                pos["p2p_interest"] += total
                pos["units"]        += total
            elif accao == "levantamento":
                ratio = total / max(pos["units"], 1)
                pos["realized"] += total - pos["cost_basis"] * ratio
                pos["units"]    -= total

        elif cat == "ca":
            if accao == "compra":
                pos["units"]      += qtd
                pos["cost_basis"] += total
                pos["ca_subscricoes"].append({
                    "data": data.isoformat(),
                    "unidades": int(qtd),
                    "custo": total,
                })

        elif accao in ("compra", "drip", "deposito"):
            pos["units"]      += qtd
            pos["cost_basis"] += total
        elif accao in ("venda", "levantamento"):
            if pos["units"] > 0:
                avg_cost = pos["cost_basis"] / pos["units"]
                pos["realized"]   += (preco - avg_cost) * qtd - comissao
                pos["cost_basis"] -= avg_cost * qtd
                pos["units"]      -= qtd
        elif accao in ("dividendo", "juro"):
            pos["realized"] += total
        elif accao == "split":
            pos["units"] *= qtd
        elif accao == "ajustamento":
            pos["cost_basis"] += total

    # ── Build per-asset output ────────────────────────────────────────────────
    etfs, cryptos, pprs, p2ps, cas = [], [], [], [], []

    for ticker, pos in positions.items():
        cat          = _ticker_category(ticker)
        price_data   = prices.get(ticker, {})
        current_price    = price_data.get("price")
        change_24h       = price_data.get("change_24h", 0)
        change_24h_pct   = price_data.get("change_24h_pct", 0)
        units        = pos["units"]
        cost_basis   = pos["cost_basis"]
        pe           = (cost_basis / units) if units > 0 else 0

        if cat == "p2p":
            invested   = pos["p2p_invested"]
            interest   = pos["p2p_interest"]
            cur_val    = pos["units"]
            gains      = interest
            gains_pct  = (gains / invested * 100) if invested > 0 else 0
            p2ps.append({
                "nome": ticker, "ticker": ticker,
                "investimento": round(invested, 2),
                "juro":         round(interest, 2),
                "valor":        round(cur_val, 2),
                "ganhos":       round(gains, 2),
                "ganhos_pct":   round(gains_pct, 2),
            })

        elif cat == "ca":
            # Use pre-calculated values if available
            invested = round(cost_basis, 2)
            cas.append({
                "ticker":    ticker,
                "investido": invested,
                "subscricoes": pos["ca_subscricoes"],
            })

        elif cat in ("etf", "crypto", "ppr") and units > 0.0001:
            cur_val     = (current_price * units) if current_price else cost_basis
            var_24h_val = change_24h * units if change_24h else 0
            unrealized  = cur_val - cost_basis
            total_gains = unrealized + pos["realized"]
            gains_pct   = (total_gains / cost_basis * 100) if cost_basis > 0 else 0

            row = {
                "nome": ticker, "ticker": ticker, "moeda": "EUR",
                "unidades":          round(units, 8),
                "pe":                round(pe, 4),
                "pe_total":          round(cost_basis, 2),
                "preco":             round(current_price, 4) if current_price else None,
                "variacao_24h":      round(change_24h, 4) if change_24h else None,
                "variacao_24h_pct":  round(change_24h_pct, 2) if change_24h_pct else None,
                "variacao_24h_valor":round(var_24h_val, 2),
                "valor":             round(cur_val, 2),
                "ganhos":            round(total_gains, 2),
                "ganhos_pct":        round(gains_pct, 2),
                "realizados":        round(pos["realized"], 2),
                "nao_realizados":    round(unrealized, 2),
            }
            if cat == "etf":    etfs.append(row)
            elif cat == "crypto": cryptos.append(row)
            elif cat == "ppr":   pprs.append(row)

    # ── CA summary — use pre-calculated values ────────────────────────────────
    if ca_calculo:
        ca_summary = ca_calculo["summary"]
        aforro_val = ca_summary["valor_atual"]
    else:
        ca_invested = sum(c["investido"] for c in cas)
        ca_summary  = {
            "valor_atual": ca_invested,
            "investido":   ca_invested,
            "ganhos":      0,
            "ganhos_pct":  0,
        }
        aforro_val = ca_invested

    # ── Category summaries ────────────────────────────────────────────────────
    def summarize(assets, value_key="valor", invested_key="pe_total"):
        total_val    = sum(a.get(value_key,    0) or 0 for a in assets)
        total_inv    = sum(a.get(invested_key, 0) or 0 for a in assets)
        total_gains  = sum(a.get("ganhos",     0) or 0 for a in assets)
        total_24h    = sum(a.get("variacao_24h_valor", 0) or 0 for a in assets)
        gains_pct    = (total_gains / total_inv * 100) if total_inv > 0 else 0
        return {
            "valor_atual":       round(total_val, 2),
            "ganhos":            round(total_gains, 2),
            "ganhos_pct":        round(gains_pct, 2),
            "investido":         round(total_inv, 2),
            "variacao_24h":      round(total_24h, 2),
            "variacao_24h_pct":  round((total_24h / (total_val - total_24h) * 100) if total_val > 0 else 0, 2),
            "realizados":        round(sum(a.get("realizados",    0) or 0 for a in assets), 2),
            "nao_realizados":    round(sum(a.get("nao_realizados",0) or 0 for a in assets), 2),
        }

    def summarize_p2p(assets):
        total_val   = sum(a["valor"]        for a in assets)
        total_inv   = sum(a["investimento"] for a in assets)
        total_gains = sum(a["ganhos"]       for a in assets)
        gains_pct   = (total_gains / total_inv * 100) if total_inv > 0 else 0
        return {
            "valor_atual": round(total_val,   2),
            "ganhos":      round(total_gains, 2),
            "ganhos_pct":  round(gains_pct,   2),
            "investido":   round(total_inv,   2),
        }

    etf_summary    = summarize(etfs)
    crypto_summary = summarize(cryptos)
    ppr_summary    = summarize(pprs)
    p2p_summary    = summarize_p2p(p2ps)

    dinheiro_total = sum(float(a["valor"]) for a in accounts)

    total_portfolio = (
        etf_summary["valor_atual"] + crypto_summary["valor_atual"] +
        ppr_summary["valor_atual"] + p2p_summary["valor_atual"] +
        aforro_val + dinheiro_total
    )
    total_invested = (
        etf_summary["investido"] + crypto_summary["investido"] +
        ppr_summary["investido"] + p2p_summary["investido"] +
        ca_summary["investido"]
    )
    total_gains = (
        etf_summary["ganhos"] + crypto_summary["ganhos"] +
        ppr_summary["ganhos"] + p2p_summary["ganhos"] +
        ca_summary["ganhos"]
    )
    total_gains_pct = (total_gains / total_invested * 100) if total_invested > 0 else 0

    return {
        "overview": {
            "valor_total":  round(total_portfolio, 2),
            "ganhos_total": round(total_gains, 2),
            "ganhos_pct":   round(total_gains_pct, 2),
            "etfs":    etf_summary["valor_atual"],
            "crypto":  crypto_summary["valor_atual"],
            "pprs":    ppr_summary["valor_atual"],
            "p2p":     p2p_summary["valor_atual"],
            "aforro":  round(aforro_val, 2),
            "dinheiro":round(dinheiro_total, 2),
        },
        "etfs":   {"assets": etfs,   "summary": etf_summary},
        "crypto": {"assets": cryptos,"summary": crypto_summary},
        "pprs":   {"assets": pprs,   "summary": ppr_summary},
        "p2p":    {"assets": p2ps,   "summary": p2p_summary},
        "ca":     {"assets": cas,    "summary": ca_summary},
        "accounts": accounts,
        "ganhos_por_categoria": {
            "ETFs":    {"ganhos": etf_summary["ganhos"],    "valor": etf_summary["valor_atual"]},
            "P2P":     {"ganhos": p2p_summary["ganhos"],    "valor": p2p_summary["valor_atual"]},
            "Crypto":  {"ganhos": crypto_summary["ganhos"], "valor": crypto_summary["valor_atual"]},
            "PPRs":    {"ganhos": ppr_summary["ganhos"],    "valor": ppr_summary["valor_atual"]},
            "Poupança":{"ganhos": ca_summary["ganhos"],     "valor": aforro_val},
        }
    }
