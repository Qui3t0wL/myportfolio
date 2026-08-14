import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const PortfolioContext = createContext(null)

export function PortfolioProvider({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async (force = false) => {
    try {
      setLoading(true)
      if (force) await fetch('/api/prices/refresh', { method: 'POST' })
      const r = await fetch('/api/portfolio')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch once on app start
  useEffect(() => { load() }, [load])

  return (
    <PortfolioContext.Provider value={{ data, loading, error, refresh: () => load(), refreshPrices: () => load(true), lastRefresh }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolioContext() {
  return useContext(PortfolioContext)
}
