import React, { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, Loading, ErrorMsg } from '../components/Shared'
import { useAccounts, fmt, colorClass } from '../hooks/usePortfolio'
import { usePortfolioContext } from '../PortfolioContext'

const CAT_COLORS = {
  ETFs: '#c0392b', P2P: '#5b55c9', Crypto: '#2980b9',
  PPRs: '#27ae60', Poupança: '#8e3466', Dinheiro: '#2d6a4f'
}
const C_CREDITO = '#e05c3a'

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
      <div style={{ position: 'relative', height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.filter(d => d.value > 0)} cx="50%" cy="50%"
              innerRadius={48} outerRadius={76} dataKey="value" paddingAngle={2}>
              {data.map((d, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="none" />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: 100
        }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{title}</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{fmt.eur(centerVal)}</div>
          {centerGains != null && <div className={colorClass(centerGains)} style={{ fontSize: 11 }}>{fmt.eur(centerGains)}</div>}
          {centerPct != null && <div className={colorClass(centerPct)} style={{ fontSize: 10 }}>{fmt.pct(centerPct)}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 2 }}>
        {data.filter(d => d.value > 0).map((d, i) => {
          const total = data.reduce((s, x) => s + (x.value || 0), 0)
          const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
          return (
            <span key={i} style={{ fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color || colors[i], display: 'inline-block' }} />
              {d.name} {pct}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

// Donut específico para o passivo (crédito)
function PassivoDonut({ credito }) {
  if (!credito || credito.total_divida === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text2)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🏠</div>
        <div style={{ fontSize: 12 }}>Sem créditos registados</div>
      </div>
    )
  }

  const data = credito.emprestimos.map((e, i) => ({
    name: e.nome,
    value: e.saldo_atual,
    color: [C_CREDITO, '#c0392b', '#f39c12'][i % 3],
  }))

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    return (
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
        <div style={{ fontWeight: 600 }}>{d.name}</div>
        <div>{fmt.eur(d.value)}</div>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%"
              innerRadius={48} outerRadius={76} dataKey="value" paddingAngle={2}>
              {data.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: 110
        }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>Passivo</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C_CREDITO }}>{fmt.eur(credito.total_divida)}</div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
            {fmt.eur(credito.total_prestacoes)}/mês
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 2 }}>
        {data.map((d, i) => (
          <span key={i} style={{ fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Overview() {
  const { data, loading, error, refreshPrices, lastRefresh } = usePortfolioContext()
  const { accounts, update: updateAccount, create: createAccount } = useAccounts()
  const [editAccount, setEditAccount] = useState(null)
  const [newAcc, setNewAcc] = useState({ nome: '', valor: '' })
  const [credito, setCredito] = useState(null)

  // Carrega resumo de crédito independentemente do portfolio
  useEffect(() => {
    fetch('/api/credito/resumo')
      .then(r => r.json())
      .then(setCredito)
      .catch(() => setCredito({ total_divida: 0, total_prestacoes: 0, emprestimos: [] }))
  }, [])

  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />

  const { overview, etfs, crypto, pprs, p2p, ganhos_por_categoria } = data

  const mainData = [
    { name: 'ETFs',     value: overview.etfs,    color: CAT_COLORS.ETFs },
    { name: 'P2P',      value: overview.p2p,     color: CAT_COLORS.P2P },
    { name: 'Crypto',   value: overview.crypto,  color: CAT_COLORS.Crypto },
    { name: 'PPRs',     value: overview.pprs,    color: CAT_COLORS.PPRs },
    { name: 'Poupança', value: overview.aforro,  color: CAT_COLORS.Poupança },
    { name: 'Dinheiro', value: overview.dinheiro,color: CAT_COLORS.Dinheiro },
  ].filter(d => d.value > 0)

  // Patrimônio líquido = activo total - passivo
  const totalPassivo = credito?.total_divida || 0
  const patrimonioLiquido = overview.valor_total - totalPassivo

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
    <div className="page" style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Visão Geral</h1>
        <div className="page-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefresh && <span style={{ color: 'var(--text2)', fontSize: 11 }}>{lastRefresh.toLocaleTimeString('pt-PT')}</span>}
          <button onClick={refreshPrices} style={{
            background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
            padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12
          }}>↻ Atualizar</button>
        </div>
      </div>

      {/* Activo + Passivo lado a lado */}
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Donut activo */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activo</div>
          <div style={{ position: 'relative', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mainData} cx="50%" cy="50%" innerRadius={90} outerRadius={136}
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
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>Total Activo</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt.eur(overview.valor_total)}</div>
              <div className={colorClass(overview.ganhos_total)} style={{ fontSize: 14, fontWeight: 700 }}>
                {fmt.eur(overview.ganhos_total)}
              </div>
              <div className={colorClass(overview.ganhos_pct)} style={{ fontSize: 13, fontWeight: 600 }}>
                {fmt.pct(overview.ganhos_pct)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', justifyContent: 'center', marginTop: 8 }}>
            {mainData.map((d, i) => {
              const total = mainData.reduce((s, x) => s + x.value, 0)
              const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
              return (
                <span key={i} style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                  {d.name} {pct}%
                </span>
              )
            })}
          </div>
        </Card>

        {/* Coluna direita: passivo + categorias + contas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Passivo donut */}
          <Card style={{ background: '#180a06', border: `1px solid rgba(224,92,58,0.25)` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Passivo</div>
            <PassivoDonut credito={credito} />
            {totalPassivo > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>Total activo</span>
                  <span>{fmt.eur(overview.valor_total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>Total passivo</span>
                  <span style={{ color: C_CREDITO }}>− {fmt.eur(totalPassivo)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                  <span>Património líquido</span>
                  <span style={{ color: patrimonioLiquido >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {fmt.eur(patrimonioLiquido)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Por categoria */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>POR CATEGORIA</div>
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

          {/* Contas bancárias */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>CONTAS BANCÁRIAS</div>
            {accounts.map(acc => (
              <div key={acc.nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--yellow)', fontSize: 12 }}>{acc.nome}</span>
                {editAccount === acc.nome ? (
                  <input type="number" defaultValue={acc.valor}
                    style={{ width: 80, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}
                    onBlur={async e => { await updateAccount(acc.nome, e.target.value); setEditAccount(null) }}
                    onKeyDown={async e => { if (e.key === 'Enter') { await updateAccount(acc.nome, e.target.value); setEditAccount(null) } }}
                    autoFocus />
                ) : (
                  <span onClick={() => setEditAccount(acc.nome)}
                    style={{ cursor: 'pointer', fontSize: 12, borderBottom: '1px dashed var(--border)' }}>
                    {fmt.eur(acc.valor)}
                  </span>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input placeholder="Banco" value={newAcc.nome} onChange={e => setNewAcc(p => ({ ...p, nome: e.target.value }))}
                style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4, fontSize: 11 }} />
              <input placeholder="€" type="number" value={newAcc.valor} onChange={e => setNewAcc(p => ({ ...p, valor: e.target.value }))}
                style={{ width: 60, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4, fontSize: 11 }} />
              <button onClick={async () => { if (newAcc.nome) { await createAccount(newAcc.nome, newAcc.valor || 0); setNewAcc({ nome: '', valor: '' }) } }}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--green)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>+</button>
            </div>
          </Card>
        </div>
      </div>

      {/* Mini donuts dos investimentos */}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Card>
          <MiniDonut title="ETFs"
            data={etfs.assets.map((a, i) => ({ name: a.ticker, value: a.valor, color: ['#c0392b','#e74c3c','#922b21','#7b241c'][i%4] }))}
            colors={['#c0392b','#e74c3c','#922b21','#7b241c']}
            centerVal={etfs.summary.valor_atual} centerGains={etfs.summary.ganhos} centerPct={etfs.summary.ganhos_pct} />
        </Card>
        <Card>
          <MiniDonut title="P2P"
            data={p2p.assets.map((a, i) => ({ name: a.nome, value: a.valor, color: ['#5b55c9','#7d79e0','#3d3a8e'][i%3] }))}
            colors={['#5b55c9','#7d79e0','#3d3a8e']}
            centerVal={p2p.summary.valor_atual} centerGains={p2p.summary.ganhos} centerPct={p2p.summary.ganhos_pct} />
        </Card>
        <Card>
          <MiniDonut title="Crypto"
            data={crypto.assets.map((a, i) => ({ name: a.ticker, value: a.valor, color: ['#1a4a7a','#2980b9'][i%2] }))}
            colors={['#1a4a7a','#2980b9']}
            centerVal={crypto.summary.valor_atual} centerGains={crypto.summary.ganhos} centerPct={crypto.summary.ganhos_pct} />
        </Card>
        <Card>
          <MiniDonut title="PPRs"
            data={pprs.assets.map((a, i) => ({ name: a.ticker.replace('Optimize PPR ','').replace(' PPR',''), value: a.valor, color: ['#27ae60','#2ecc71','#1e8449','#58d68d'][i%4] }))}
            colors={['#27ae60','#2ecc71','#1e8449','#58d68d']}
            centerVal={pprs.summary.valor_atual} centerGains={pprs.summary.ganhos} centerPct={pprs.summary.ganhos_pct} />
        </Card>
      </div>
    </div>
  )
}
