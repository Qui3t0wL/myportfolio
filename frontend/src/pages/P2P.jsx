import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { Card, Loading, ErrorMsg, SummaryDonut, SummaryRow, GainsCell } from '../components/Shared'
import { usePortfolio, fmt, colorClass } from '../hooks/usePortfolio'

const COLORS = ['#5b55c9', '#7d79e0', '#3d3a8e']

export default function P2P() {
  const { data, loading, error } = usePortfolio()
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />

  const { assets, summary } = data.p2p
  const barData = assets.map((a, i) => ({
    name: a.nome,
    investimento: a.investimento,
    juros: a.juro,
    color: COLORS[i % COLORS.length]
  }))

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>P2P</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, marginBottom: 20 }}>
        <Card>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmt.eur(v, 0)} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip formatter={(v, n) => [fmt.eur(v), n === 'investimento' ? 'Investimento' : 'Juros']}
                  contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6 }}
                  labelStyle={{ color: 'var(--text)', fontWeight: 600 }} />
                <Bar dataKey="investimento" stackId="a" radius={[0,0,4,4]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
                <Bar dataKey="juros" stackId="a" radius={[4,4,0,0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.5} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card style={{ background: '#0d0d1a' }}>
          <SummaryDonut title="P2P" summary={summary} assets={assets}
            nameKey="nome" valueKey="valor" colors={COLORS} />
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <SummaryRow label="Valor Atual" value={fmt.eur(summary.valor_atual)} />
            <SummaryRow label="Ganhos" value={fmt.eur(summary.ganhos)} className={colorClass(summary.ganhos)} />
            <SummaryRow label="Ganhos %" value={fmt.pct(summary.ganhos_pct)} className={colorClass(summary.ganhos_pct)} />
            <SummaryRow label="Investido" value={fmt.eur(summary.investido)} />
          </div>
        </Card>
      </div>

      <Card>
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>Investimento</th><th>Juro</th><th>Valor</th><th>Ganhos</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(a => (
              <tr key={a.nome}>
                <td style={{ fontWeight: 600 }}>{a.nome}</td>
                <td>{fmt.eur(a.investimento)}</td>
                <td className="pos">{fmt.eur(a.juro)}</td>
                <td style={{ fontWeight: 600 }}>{fmt.eur(a.valor)}</td>
                <GainsCell val={a.ganhos} pct={a.ganhos_pct} />
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
