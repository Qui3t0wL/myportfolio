import React, { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, Loading, ErrorMsg, SummaryDonut } from '../components/Shared'
import { usePortfolio, useAccounts, fmt, colorClass } from '../hooks/usePortfolio'

const CAT_COLORS = {
  ETFs: '#c0392b', P2P: '#5b55c9', Crypto: '#2980b9',
  PPRs: '#27ae60', Poupança: '#8e3466', Dinheiro: '#2d6a4f'
}

function MiniDonut({ title, data, colors, centerVal, centerGains, centerPct }) {
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    const total = data.reduce((s, x) => s + (x.value || 0), 0)
    const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
    return (
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
        <div style={{ fontWeight: 600 }}>{d.name}</div>
        <div>{fmt.eur(d.value)} · {pct}%</div>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.filter(d => d.value > 0)} cx="50%" cy="50%"
              innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
              {data.map((d, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="none" />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none'
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt.eur(centerVal)}</div>
          <div className={colorClass(centerGains)} style={{ fontSize: 11 }}>{fmt.eur(centerGains)}</div>
          <div className={colorClass(centerPct)} style={{ fontSize: 11 }}>{fmt.pct(centerPct)}</div>
        </div>
      </div>
      {/* legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 4 }}>
        {data.filter(d => d.value > 0).map((d, i) => {
          const total = data.reduce((s, x) => s + (x.value || 0), 0)
          const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
          return (
            <span key={i} style={{ fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color || colors[i], display: 'inline-block' }} />
              {d.name} {pct}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function Overview() {
  const { data, loading, error, refreshPrices, lastRefresh } = usePortfolio()
  const { accounts, update: updateAccount, create: createAccount, remove: removeAccount } = useAccounts()
  const [editAccount, setEditAccount] = useState(null)
  const [newAcc, setNewAcc] = useState({ nome: '', valor: '' })

  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />

  const { overview, etfs, crypto, pprs, p2p, ca, ganhos_por_categoria } = data

  // Main donut data
  const mainData = [
    { name: 'ETFs', value: overview.etfs, color: CAT_COLORS.ETFs },
    { name: 'P2P', value: overview.p2p, color: CAT_COLORS.P2P },
    { name: 'Crypto', value: overview.crypto, color: CAT_COLORS.Crypto },
    { name: 'PPRs', value: overview.pprs, color: CAT_COLORS.PPRs },
    { name: 'Poupança', value: overview.aforro, color: CAT_COLORS.Poupança },
    { name: 'Dinheiro', value: overview.dinheiro, color: CAT_COLORS.Dinheiro },
  ].filter(d => d.value > 0)

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    const total = mainData.reduce((s, x) => s + x.value, 0)
    const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
    return (
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
        <div style={{ fontWeight: 600 }}>{d.name}</div>
        <div>{fmt.eur(d.value)} · {pct}%</div>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Visão Geral</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastRefresh && <span style={{ color: 'var(--text2)', fontSize: 12 }}>Atualizado: {lastRefresh.toLocaleTimeString('pt-PT')}</span>}
          <button onClick={refreshPrices} style={{
            background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12
          }}>↻ Atualizar preços</button>
        </div>
      </div>

      {/* Main layout: big donut + side panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, marginBottom: 24 }}>
        {/* Big main donut */}
        <Card>
          <div style={{ position: 'relative', height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mainData} cx="50%" cy="50%" innerRadius={110} outerRadius={160}
                  dataKey="value" paddingAngle={2}>
                  {mainData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none'
            }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{fmt.eur(overview.valor_total)}</div>
              <div className={colorClass(overview.ganhos_total)} style={{ fontSize: 18, fontWeight: 700 }}>
                {fmt.eur(overview.ganhos_total)}
              </div>
              <div className={colorClass(overview.ganhos_pct)} style={{ fontSize: 16, fontWeight: 600 }}>
                {fmt.pct(overview.ganhos_pct)}
              </div>
            </div>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', justifyContent: 'center', marginTop: 8 }}>
            {mainData.map((d, i) => {
              const total = mainData.reduce((s, x) => s + x.value, 0)
              const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
              return (
                <span key={i} style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                  {d.name} {pct}%
                </span>
              )
            })}
          </div>
        </Card>

        {/* Right side: category summary + accounts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text2)' }}>POR CATEGORIA</div>
            {Object.entries(ganhos_por_categoria || {}).map(([cat, vals]) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: CAT_COLORS[cat] || 'var(--text2)', fontWeight: 600, fontSize: 12 }}>{cat}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12 }}>{fmt.eur(vals.valor)}</span>
                  <span className={colorClass(vals.ganhos)} style={{ marginLeft: 8, fontSize: 11 }}>{fmt.eur(vals.ganhos)}</span>
                </div>
              </div>
            ))}
          </Card>

          {/* Bank accounts */}
          <Card>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text2)' }}>CONTAS BANCÁRIAS</div>
            {accounts.map(acc => (
              <div key={acc.nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--yellow)', fontSize: 12 }}>{acc.nome}</span>
                {editAccount === acc.nome ? (
                  <input
                    type="number" defaultValue={acc.valor} style={{ width: 90, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}
                    onBlur={async e => { await updateAccount(acc.nome, e.target.value); setEditAccount(null) }}
                    onKeyDown={async e => { if (e.key === 'Enter') { await updateAccount(acc.nome, e.target.value); setEditAccount(null) } }}
                    autoFocus
                  />
                ) : (
                  <span onClick={() => setEditAccount(acc.nome)} style={{ cursor: 'pointer', fontSize: 12, borderBottom: '1px dashed var(--border)' }}>
                    {fmt.eur(acc.valor)}
                  </span>
                )}
              </div>
            ))}
            {/* Add new account */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input placeholder="Banco" value={newAcc.nome} onChange={e => setNewAcc(p => ({ ...p, nome: e.target.value }))}
                style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4, fontSize: 11 }} />
              <input placeholder="€" type="number" value={newAcc.valor} onChange={e => setNewAcc(p => ({ ...p, valor: e.target.value }))}
                style={{ width: 70, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4, fontSize: 11 }} />
              <button onClick={async () => { if (newAcc.nome) { await createAccount(newAcc.nome, newAcc.valor || 0); setNewAcc({ nome: '', valor: '' }) } }}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--green)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>+</button>
            </div>
          </Card>
        </div>
      </div>

      {/* Mini donuts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card>
          <MiniDonut title="ETFs"
            data={etfs.assets.map((a, i) => ({ name: a.ticker, value: a.valor, color: ['#c0392b','#e74c3c','#922b21','#7b241c'][i % 4] }))}
            colors={['#c0392b','#e74c3c','#922b21','#7b241c']}
            centerVal={etfs.summary.valor_atual} centerGains={etfs.summary.ganhos} centerPct={etfs.summary.ganhos_pct} />
        </Card>
        <Card>
          <MiniDonut title="P2P"
            data={p2p.assets.map((a, i) => ({ name: a.nome, value: a.valor, color: ['#5b55c9','#7d79e0','#3d3a8e','#9b97f0'][i % 4] }))}
            colors={['#5b55c9','#7d79e0','#3d3a8e','#9b97f0']}
            centerVal={p2p.summary.valor_atual} centerGains={p2p.summary.ganhos} centerPct={p2p.summary.ganhos_pct} />
        </Card>
        <Card>
          <MiniDonut title="Crypto"
            data={crypto.assets.map((a, i) => ({ name: a.ticker, value: a.valor, color: ['#1a4a7a','#2980b9'][i % 2] }))}
            colors={['#1a4a7a','#2980b9']}
            centerVal={crypto.summary.valor_atual} centerGains={crypto.summary.ganhos} centerPct={crypto.summary.ganhos_pct} />
        </Card>
        <Card>
          <MiniDonut title="PPRs"
            data={pprs.assets.map((a, i) => ({ name: a.ticker, value: a.valor, color: ['#27ae60','#2ecc71','#1e8449','#58d68d'][i % 4] }))}
            colors={['#27ae60','#2ecc71','#1e8449','#58d68d']}
            centerVal={pprs.summary.valor_atual} centerGains={pprs.summary.ganhos} centerPct={pprs.summary.ganhos_pct} />
        </Card>
      </div>
    </div>
  )
}
