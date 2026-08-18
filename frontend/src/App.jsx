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
  { to: '/',          label: 'Geral',     icon: 'finance',           color: 'var(--blue)' },
  { to: '/etfs',      label: 'ETFs',      icon: 'account_balance',   color: 'var(--etf)' },
  { to: '/p2p',       label: 'P2P',       icon: 'p2p',               color: 'var(--p2p)' },
  { to: '/crypto',    label: 'Crypto',    icon: 'currency_bitcoin',  color: 'var(--crypto)' },
  { to: '/pprs',      label: 'PPRs',      icon: 'shield_card',       color: 'var(--ppr)' },
  { to: '/aforro',    label: 'Aforro',    icon: 'savings',           color: 'var(--ca)' },
  { to: '/credito',   label: 'Crédito',   icon: 'real_estate_agent', color: 'var(--credito)' },
  { to: '/historico', label: 'Histórico', icon: 'history',           color: 'var(--text2)' },
]

function NavIcon({ name, style = {} }) {
  return (
    <span className="material-symbols-rounded" style={{ fontSize: 20, lineHeight: 1, ...style }}>
      {name}
    </span>
  )
}

function Sidebar() {
  return (
    <nav className="sidebar">
      <div style={{ padding: '0 20px 24px', fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <NavIcon name="finance" style={{ fontSize: 22 }} /> Portfolio
      </div>
      {NAV.map(n => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'}
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px',
            color: isActive ? (n.color || 'var(--text)') : 'var(--text2)',
            background: isActive ? 'var(--bg3)' : 'transparent',
            borderLeft: isActive ? `3px solid ${n.color || 'var(--blue)'}` : '3px solid transparent',
            fontSize: 13, fontWeight: isActive ? 600 : 400,
            textDecoration: 'none', transition: 'all 0.15s',
          })}>
          <NavIcon name={n.icon} />
          {n.label}
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
          <NavIcon name={n.icon} style={{ fontSize: 22 }} />
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
