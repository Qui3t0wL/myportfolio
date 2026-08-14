import { useState, useEffect, useCallback } from 'react'

const BASE = '/api'

export function usePortfolio() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const r = await fetch(`${BASE}/portfolio`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      setData(json)
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refreshPrices = async () => {
    await fetch(`${BASE}/prices/refresh`, { method: 'POST' })
    await load()
  }

  return { data, loading, error, refresh: load, refreshPrices, lastRefresh }
}

export function useTransactions(ticker = null) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = ticker ? `${BASE}/transactions?ticker=${encodeURIComponent(ticker)}&limit=1000` : `${BASE}/transactions?limit=1000`
    fetch(url).then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [ticker])

  return { data, loading }
}

export function useAccounts() {
  const [accounts, setAccounts] = useState([])

  const load = async () => {
    const r = await fetch(`${BASE}/accounts`)
    setAccounts(await r.json())
  }

  useEffect(() => { load() }, [])

  const update = async (nome, valor) => {
    await fetch(`${BASE}/accounts/${encodeURIComponent(nome)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, valor: parseFloat(valor) })
    })
    await load()
  }

  const create = async (nome, valor) => {
    await fetch(`${BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, valor: parseFloat(valor) })
    })
    await load()
  }

  const remove = async (nome) => {
    await fetch(`${BASE}/accounts/${encodeURIComponent(nome)}`, { method: 'DELETE' })
    await load()
  }

  return { accounts, update, create, remove, reload: load }
}

// Formatting helpers
export const fmt = {
  eur: (v, digits = 2) => {
    if (v == null) return '—'
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
  },
  pct: (v) => {
    if (v == null) return '—'
    return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
  },
  num: (v, d = 4) => {
    if (v == null) return '—'
    return Number(v).toLocaleString('pt-PT', { maximumFractionDigits: d })
  },
  date: (v) => {
    if (!v) return '—'
    return new Date(v).toLocaleDateString('pt-PT')
  }
}

export const colorClass = (v) => v > 0 ? 'pos' : v < 0 ? 'neg' : 'neutral'
