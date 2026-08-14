import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, Loading, ErrorMsg, SummaryDonut, VarCell, GainsCell, SummaryRow } from '../components/Shared'
import { fmt, colorClass } from '../hooks/usePortfolio'
import { usePortfolioContext } from '../PortfolioContext'

const COLORS = ['#c0392b', '#e74c3c', '#922b21', '#7b241c', '#a93226']

export default function ETFs() {
  const { data, loading, error } = usePortfolioContext()
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />

  const { assets, summary } = data.etfs
  const barData = assets.map((a, i) => ({
    name: a.ticker,
    investido: a.pe_total,
    ganhos: a.nao_realizados,
    color: COLORS[i % COLORS.length]
  }))

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>ETFs</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, marginBottom: 20 }}>
        {/* Bar chart */}
        <Card>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmt.eur(v, 0)} />
                <Tooltip formatter={(v, n) => [fmt.eur(v), n === 'investido' ? 'Investido' : 'Ganhos']}
                  contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6 }}
                  labelStyle={{ color: 'var(--text)', fontWeight: 600 }} />
                <Bar dataKey="investido" stackId="a" radius={[0,0,4,4]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
                <Bar dataKey="ganhos" stackId="a" radius={[4,4,0,0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.45} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Donut + summary */}
        <Card style={{ background: '#1a0a0a' }}>
          <SummaryDonut title="ETFs" summary={summary} assets={assets}
            nameKey="ticker" valueKey="valor" colors={COLORS} />
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <SummaryRow label="Valor Atual" value={fmt.eur(summary.valor_atual)} />
            <SummaryRow label="Ganhos" value={fmt.eur(summary.ganhos)} className={colorClass(summary.ganhos)} />
            <SummaryRow label="Ganhos %" value={fmt.pct(summary.ganhos_pct)} className={colorClass(summary.ganhos_pct)} />
            <SummaryRow label="Var. 24H" value={fmt.eur(summary.variacao_24h)} className={colorClass(summary.variacao_24h)} />
            <SummaryRow label="Var. 24H %" value={fmt.pct(summary.variacao_24h_pct)} className={colorClass(summary.variacao_24h_pct)} />
            <SummaryRow label="Investido" value={fmt.eur(summary.investido)} />
            <SummaryRow label="Realizados" value={fmt.eur(summary.realizados)} className={colorClass(summary.realizados)} />
            <SummaryRow label="Não Realizados" value={fmt.eur(summary.nao_realizados)} className={colorClass(summary.nao_realizados)} />
          </div>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>Moeda</th><th>Ticker</th><th>Unid.</th>
              <th>PE</th><th>PE Total</th><th>Preço</th>
              <th>Variação 24H</th><th>Valor €</th><th>Ganhos</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => (
              <tr key={a.ticker}>
                <td style={{ color: 'var(--text2)' }}>{a.nome}</td>
                <td>{a.moeda}</td>
                <td style={{ fontWeight: 600 }}>{a.ticker}</td>
                <td>{fmt.num(a.unidades, 4)}</td>
                <td>{fmt.eur(a.pe)}</td>
                <td>{fmt.eur(a.pe_total)}</td>
                <td style={{ fontWeight: 600 }}>{fmt.eur(a.preco) ?? '—'}</td>
                <VarCell val={a.variacao_24h} pct={a.variacao_24h_pct} />
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
