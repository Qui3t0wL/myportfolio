import React from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fmt, colorClass } from '../hooks/usePortfolio'

// ── Card wrapper ──────────────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, ...style
    }}>
      {children}
    </div>
  )
}

// ── Donut chart with center summary ──────────────────────────────────────────
export function SummaryDonut({ title, summary, assets, nameKey = 'ticker', valueKey = 'valor', colors }) {
  const data = assets
    .filter(a => (a[valueKey] || 0) > 0)
    .map((a, i) => ({ name: a[nameKey] || a.nome, value: a[valueKey] || 0, color: colors[i % colors.length] }))

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    const total = data.reduce((s, x) => s + x.value, 0)
    const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
    return (
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
        <div style={{ fontWeight: 600 }}>{d.name}</div>
        <div>{fmt.eur(d.value)} · {pct}%</div>
      </div>
    )
  }

  const total = summary?.valor_atual || 0
  const ganhos = summary?.ganhos || 0
  const ganhos_pct = summary?.ganhos_pct || 0

  return (
    <div style={{ position: 'relative', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={90} outerRadius={130}
            dataKey="value" paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt.eur(total)}</div>
        <div className={colorClass(ganhos)} style={{ fontSize: 13, fontWeight: 600 }}>{fmt.eur(ganhos)}</div>
        <div className={colorClass(ganhos_pct)} style={{ fontSize: 12 }}>{fmt.pct(ganhos_pct)}</div>
        {summary?.investido && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Invest.: {fmt.eur(summary.investido)}</div>}
        {summary?.variacao_24h != null && (
          <div className={colorClass(summary.variacao_24h)} style={{ fontSize: 11 }}>24H: {fmt.eur(summary.variacao_24h)}</div>
        )}
        {summary?.realizados != null && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>Real.: <span className={colorClass(summary.realizados)}>{fmt.eur(summary.realizados)}</span></div>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>N.Real.: <span className={colorClass(summary.nao_realizados)}>{fmt.eur(summary.nao_realizados)}</span></div>
          </>
        )}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', marginTop: 4 }}>
        {data.map((d, i) => {
          const total_val = data.reduce((s, x) => s + x.value, 0)
          const pct = total_val > 0 ? (d.value / total_val * 100).toFixed(1) : 0
          return (
            <span key={i} style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
              {d.name} {pct}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Stats row in donut ────────────────────────────────────────────────────────
export function SummaryRow({ label, value, className }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span className={className}>{value}</span>
    </div>
  )
}

// ── Loading / error states ────────────────────────────────────────────────────
export function Loading() {
  return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>A carregar...</div>
}

export function ErrorMsg({ msg }) {
  return <div style={{ textAlign: 'center', padding: 40, color: 'var(--red)' }}>Erro: {msg}</div>
}

// ── Variation cell ────────────────────────────────────────────────────────────
export function VarCell({ val, pct }) {
  if (val == null) return <td style={{ color: 'var(--text2)' }}>—</td>
  const cls = colorClass(val)
  return (
    <td>
      <span className={cls}>{fmt.eur(val)}</span>
      <span className={cls} style={{ marginLeft: 6, fontSize: 11 }}>{fmt.pct(pct)}</span>
    </td>
  )
}

// ── Gains cell ────────────────────────────────────────────────────────────────
export function GainsCell({ val, pct }) {
  const cls = colorClass(val)
  return (
    <td>
      <span className={cls}>{fmt.eur(val)}</span>
      {pct != null && <span className={cls} style={{ marginLeft: 6, fontSize: 11 }}>{fmt.pct(pct)}</span>}
    </td>
  )
}
