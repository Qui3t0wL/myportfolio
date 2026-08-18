import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { PortfolioProvider } from './PortfolioContext'
import Overview from './pages/Overview'
import ETFs from './pages/ETFs'
import P2P from './pages/P2P'
import Crypto from './pages/Crypto'
import PPRs from './pages/PPRs'
import Aforro from './pages/Aforro'
import Historico from './pages/Historico'
import Credito from './pages/Credito'

const NAV = [
  { to: '/',          label: 'Geral',    icon: '⬡', color: 'var(--blue)' },
  { to: '/etfs',      label: 'ETFs',     icon: '📊', color: 'var(--etf)' },
  { to: '/p2p',       label: 'P2P',      icon: '🔗', color: 'var(--p2p)' },
  { to: '/crypto',    label: 'Crypto',   icon: '₿',  color: 'var(--crypto)' },
  { to: '/pprs',      label: 'PPRs',     icon: '🛡',  color: 'var(--ppr)' },
  { to: '/aforro',    label: 'Aforro',   icon: '🏦', color: 'var(--ca)' },
  { to: '/credito',   label: 'Crédito',  icon: '🏠', color: 'var(--credito)' },
  { to: '/historico', label: 'Histórico',icon: '📋', color: 'var(--text2)' },
]

function Sidebar() {
  return (
    <nav className="sidebar">
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
          })}>
          {n.icon} {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

function BottomNav() {
  return (
    <nav className="bottom-nav">
      {NAV.map(n => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'}
          className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="nav-icon">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function App() {
  return (
    <PortfolioProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/"           element={<Overview />} />
              <Route path="/etfs"       element={<ETFs />} />
              <Route path="/p2p"        element={<P2P />} />
              <Route path="/crypto"     element={<Crypto />} />
              <Route path="/pprs"       element={<PPRs />} />
              <Route path="/aforro"     element={<Aforro />} />
              <Route path="/credito"    element={<Credito />} />
              <Route path="/historico"  element={<Historico />} />
            </Routes>
          </main>
          <BottomNav />
        </div>
      </BrowserRouter>
    </PortfolioProvider>
  )
}
