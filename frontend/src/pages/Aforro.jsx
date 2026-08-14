import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, Loading, ErrorMsg, SummaryDonut, SummaryRow, GainsCell } from '../components/Shared'
import { usePortfolio, fmt, colorClass } from '../hooks/usePortfolio'

const COLORS = ['#8e3466', '#c0528a', '#6c2450', '#d980af', '#a0406e']

// Approximate CA Série E accrual: IGCP publishes quarterly capitalization
// We calculate based on invested amount and elapsed time at ~3.25% annual base rate
function calcCAValue(subscricoes) {
  const today = new Date()
  let totalValue = 0
  let totalInvested = 0
  const rows = []

  for (const sub of subscricoes) {
    const subDate = new Date(sub.data)
    const unidades = sub.unidades
    // CA Série E: Euribor 3m + 1% spread, quarterly capitalisation
    // Using approximate 3.25% for 2022 series, will improve with IGCP scraping
    const yearsElapsed = (today - subDate) / (1000 * 60 * 60 * 24 * 365.25)
    const quarterlyRate = 0.0325 / 4
    const quarters = Math.floor(yearsElapsed * 4)
    const valorUn = Math.pow(1 + quarterlyRate, quarters)
    const valor = unidades * valorUn
    const ganhos = valor - unidades
    const ganhosPct = (ganhos / unidades) * 100

    // Next capitalization date
    const nextCap = new Date(subDate)
    nextCap.setMonth(nextCap.getMonth() + (quarters + 1) * 3)

    // Maturity (10 years)
    const maturity = new Date(subDate)
    maturity.setFullYear(maturity.getFullYear() + 10)
    const daysToMaturity = Math.ceil((maturity - today) / (1000 * 60 * 60 * 24))

    totalValue += valor
    totalInvested += unidades
    rows.push({
      data: sub.data,
      unidades,
      valorUn: Math.round(valorUn * 100000) / 100000,
      taxaQ: quarterlyRate.toFixed(4),
      proximaCapData: nextCap.toISOString().split('T')[0],
      valor: Math.round(valor * 100) / 100,
      ganhos: Math.round(ganhos * 100) / 100,
      ganhosPct: Math.round(ganhosPct * 100) / 100,
      dataVencimento: maturity.toISOString().split('T')[0],
      qtsMFaltam: Math.ceil(daysToMaturity / 30),
      maturidade: Math.max(0, Math.ceil((maturity - today) / (1000 * 60 * 60 * 24 * 30))),
    })
  }

  return { rows, totalValue, totalInvested, ganhos: totalValue - totalInvested }
}

export default function Aforro() {
  const { data, loading, error } = usePortfolio()
  if (loading) return <Loading />
  if (error) return <ErrorMsg msg={error} />

  const { assets } = data.ca
  // Collect all subscriptions from all CA assets
  const allSubs = assets.flatMap(a => a.subscricoes || [])
  const { rows, totalValue, totalInvested, ganhos } = calcCAValue(allSubs)

  const ganhosPct = totalInvested > 0 ? (ganhos / totalInvested * 100) : 0
  const summary = { valor_atual: totalValue, ganhos, ganhos_pct: ganhosPct, investido: totalInvested }

  // Bar chart: one bar per subscription date
  const barData = rows.map((r, i) => ({
    name: fmt.date(r.data),
    valor: r.valor,
    color: COLORS[i % COLORS.length]
  }))

  // Donut data
  const donutAssets = rows.map((r, i) => ({ ticker: fmt.date(r.data), valor: r.valor }))

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Certificados de Aforro</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, marginBottom: 20 }}>
        <Card>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.eur(v, 0)} />
                <Tooltip formatter={v => [fmt.eur(v), 'Valor']}
                  contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6 }}
                  labelStyle={{ color: 'var(--text)', fontWeight: 600 }} />
                <Bar dataKey="valor" radius={[4,4,0,0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card style={{ background: '#1a0814' }}>
          <SummaryDonut title="Aforro" summary={summary} assets={donutAssets}
            nameKey="ticker" valueKey="valor" colors={COLORS} />
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <SummaryRow label="Valor Atual" value={fmt.eur(totalValue)} />
            <SummaryRow label="Ganhos" value={fmt.eur(ganhos)} className={colorClass(ganhos)} />
            <SummaryRow label="Ganhos %" value={fmt.pct(ganhosPct)} className={colorClass(ganhosPct)} />
            <SummaryRow label="Investido" value={fmt.eur(totalInvested)} />
          </div>
          <div style={{ marginTop: 12, padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, fontSize: 11, color: 'var(--text2)' }}>
            ℹ️ Valores calculados com taxa aprox. 3,25% ao ano (Euribor 3m + 1%). Atualiza conforme IGCP.
          </div>
        </Card>
      </div>

      <Card>
        <table>
          <thead>
            <tr>
              <th>Data Subscr.</th><th>Unid.</th><th>Valor. Un.</th>
              <th>Tx Q %</th><th>Próx. Cap.</th><th>Valor €</th>
              <th>Ganhos</th><th>Data Venc.</th><th>Meses p/ Venc.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmt.date(r.data)}</td>
                <td>{r.unidades.toLocaleString('pt-PT')}</td>
                <td>{r.valorUn.toFixed(5)}</td>
                <td>{(parseFloat(r.taxaQ) * 100).toFixed(3)}%</td>
                <td>{fmt.date(r.proximaCapData)}</td>
                <td style={{ fontWeight: 600 }}>{fmt.eur(r.valor)}</td>
                <GainsCell val={r.ganhos} pct={r.ganhosPct} />
                <td>{fmt.date(r.dataVencimento)}</td>
                <td>{r.maturidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
