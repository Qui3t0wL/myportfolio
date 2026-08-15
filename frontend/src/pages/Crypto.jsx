import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, Loading, ErrorMsg, SummaryDonut, SummaryRow, VarCell, GainsCell } from '../components/Shared'
import { fmt, colorClass } from '../hooks/usePortfolio'
import { usePortfolioContext } from '../PortfolioContext'

const COLORS = ['#1a4a7a', '#2980b9', '#5dade2']


const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 6, fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--text2)' }}>
          <span>{p.name}</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt.eur(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Crypto() {
  const { data, loading, error } = usePortfolioContext()
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />

  const { assets, summary } = data.crypto
  const barData = assets.map((a, i) => ({
    name: a.ticker, investido: a.pe_total,
    ganhos: a.nao_realizados, color: COLORS[i % COLORS.length]
  }))

  return (
    <div className="page" style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Crypto</h1>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 16 }}>
        <Card>
          <div className="chart-wrap" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.eur(v, 0)} />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="investido" name="Investido" stackId="a" radius={[0,0,4,4]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
                <Bar dataKey="ganhos" name="Ganhos" stackId="a" radius={[4,4,0,0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.45} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card style={{ background: '#08101a' }}>
          <SummaryDonut title="Crypto" summary={summary} assets={assets}
            nameKey="ticker" valueKey="valor" colors={COLORS} />
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <SummaryRow label="Valor Atual" value={fmt.eur(summary.valor_atual)} />
            <SummaryRow label="Ganhos" value={fmt.eur(summary.ganhos)} className={colorClass(summary.ganhos)} />
            <SummaryRow label="Ganhos %" value={fmt.pct(summary.ganhos_pct)} className={colorClass(summary.ganhos_pct)} />
            <SummaryRow label="Var. 24H" value={fmt.eur(summary.variacao_24h)} className={colorClass(summary.variacao_24h)} />
            <SummaryRow label="Var. 24H %" value={fmt.pct(summary.variacao_24h_pct)} className={colorClass(summary.variacao_24h_pct)} />
            <SummaryRow label="Investido" value={fmt.eur(summary.investido)} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="table-wrap"><table>
          <thead>
            <tr>
              <th>Ticker</th><th>Unid.</th><th className="hide-mobile">PE</th><th className="hide-mobile">PE Total</th>
              <th>Preço</th><th className="hide-mobile">Variação 24H</th><th>Valor €</th><th>Ganhos</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(a => (
              <tr key={a.ticker}>
                <td style={{ fontWeight: 600 }}>{a.ticker}</td>
                <td>{fmt.num(a.unidades, 8)}</td>
                <td>{fmt.eur(a.pe)}</td>
                <td>{fmt.eur(a.pe_total)}</td>
                <td style={{ fontWeight: 600 }}>{a.preco ? fmt.eur(a.preco) : '—'}</td>
                <VarCell val={a.variacao_24h} pct={a.variacao_24h_pct} />
                <td style={{ fontWeight: 600 }}>{fmt.eur(a.valor)}</td>
                <GainsCell val={a.ganhos} pct={a.ganhos_pct} />
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </div>
  )
}
