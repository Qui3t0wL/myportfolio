import React from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { PortfolioProvider } from './PortfolioContext'
import Overview from './pages/Overview'
import ETFs from './pages/ETFs'
import P2P from './pages/P2P'
import Crypto from './pages/Crypto'
import PPRs from './pages/PPRs'
import Aforro from './pages/Aforro'
import Historico from './pages/Historico'

const NAV = [
  { to: '/', label: '⬡ Visão Geral' },
  { to: '/etfs', label: '📊 ETFs', color: '#c0392b' },
  { to: '/p2p', label: '🔗 P2P', color: '#5b55c9' },
  { to: '/crypto', label: '₿ Crypto', color: '#2980b9' },
  { to: '/pprs', label: '🛡 PPRs', color: '#27ae60' },
  { to: '/aforro', label: '🏦 Aforro', color: '#8e3466' },
  { to: '/historico', label: '📋 Histórico' },
]

export default function App() {
  return (
    <PortfolioProvider>
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar */}
        <nav style={{
          width: 190, background: 'var(--bg2)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', padding: '20px 0', flexShrink: 0,
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto'
        }}>
          <div style={{ padding: '0 20px 24px', fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px' }}>
            💼 Portfolio
          </div>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              style={({ isActive }) => ({
                display: 'block', padding: '10px 20px',
                color: isActive ? (n.color || 'var(--text)') : 'var(--text2)',
                background: isActive ? 'var(--bg3)' : 'transparent',
                borderLeft: isActive ? `3px solid ${n.color || 'var(--blue)'}` : '3px solid transparent',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                textDecoration: 'none', transition: 'all 0.15s',
              })}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', minHeight: '100vh' }}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/etfs" element={<ETFs />} />
            <Route path="/p2p" element={<P2P />} />
            <Route path="/crypto" element={<Crypto />} />
            <Route path="/pprs" element={<PPRs />} />
            <Route path="/aforro" element={<Aforro />} />
            <Route path="/historico" element={<Historico />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
    </PortfolioProvider>
  )
}
