import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, Loading, ErrorMsg, SummaryDonut, SummaryRow, GainsCell } from '../components/Shared'
import { fmt, colorClass } from '../hooks/usePortfolio'

const COLORS = ['#8e3466', '#c0528a', '#6c2450', '#d980af', '#a0406e']

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

export default function Aforro() {
  const [caData, setCaData] = useState(null)
  const [taxas, setTaxas] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchingPdf, setFetchingPdf] = useState(false)
  const [pdfResult, setPdfResult] = useState(null)
  const [showTaxas, setShowTaxas] = useState(false)
  const [editTaxa, setEditTaxa] = useState(null) // {ano, mes, taxa_anual}

  const load = useCallback(async () => {
    setLoading(true)
    const [caRes, taxasRes] = await Promise.all([
      fetch('/api/ca/calculo').then(r => r.json()),
      fetch('/api/ca/taxas').then(r => r.json()),
    ])
    setCaData(caRes)
    setTaxas(taxasRes)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fetchPdf = async () => {
    setFetchingPdf(true)
    setPdfResult(null)
    const r = await fetch('/api/ca/taxas/fetch-pdf', { method: 'POST' })
    setPdfResult(await r.json())
    setFetchingPdf(false)
  }

  const saveTaxa = async () => {
    if (!editTaxa) return
    await fetch(`/api/ca/taxas/${editTaxa.ano}/${editTaxa.mes}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxa_anual: parseFloat(editTaxa.taxa_anual), fonte: 'manual' })
    })
    setEditTaxa(null)
    await load()
  }

  if (loading) return <Loading />
  if (!caData) return <ErrorMsg msg="Sem dados de Certificados de Aforro" />

  const { subscricoes, summary } = caData

  const barData = subscricoes.map((s, i) => ({
    name: fmt.date(s.data_subscricao),
    valor: s.valor_atual,
    color: COLORS[i % COLORS.length]
  }))

  const donutAssets = subscricoes.map((s, i) => ({
    ticker: fmt.date(s.data_subscricao),
    valor: s.valor_atual,
  }))

  // Get current month's rate
  const hoje = new Date()
  const taxaAtual = taxas.find(t => t.ano === hoje.getFullYear() && t.mes === (hoje.getMonth() + 1))

  return (
    <div className="page" style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Certificados de Aforro</h1>
        <div className="page-header-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {taxaAtual && (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              Taxa actual: <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{taxaAtual.taxa_anual}%</span>
            </span>
          )}
          <button onClick={() => setShowTaxas(v => !v)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            📋 Taxas históricas
          </button>
          <button onClick={fetchPdf} disabled={fetchingPdf}
            style={{ background: 'var(--bg3)', border: '1px solid var(--blue)', color: 'var(--blue)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            {fetchingPdf ? 'A obter...' : '↓ PDF IGCP'}
          </button>
        </div>
      </div>

      {/* PDF fetch result */}
      {pdfResult && (
        <Card style={{ marginBottom: 16, background: pdfResult.error ? '#1a0808' : '#081a08' }}>
          {pdfResult.error ? (
            <div style={{ color: 'var(--red)', fontSize: 12 }}>
              ✗ {pdfResult.error}
              {pdfResult.details?.map((d, i) => <div key={i} style={{ marginTop: 4, color: 'var(--text2)' }}>{d}</div>)}
            </div>
          ) : (
            <div style={{ fontSize: 12 }}>
              <div style={{ color: 'var(--green)', marginBottom: 8 }}>✓ PDF obtido: {pdfResult.url}</div>
              <div style={{ color: 'var(--text2)', marginBottom: 8 }}>Taxas encontradas: <span style={{ color: 'var(--yellow)' }}>{pdfResult.rates_found?.join(', ') || 'nenhuma'}</span></div>
              <div style={{ color: 'var(--text2)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{pdfResult.text_preview}</div>
              <div style={{ marginTop: 8, color: 'var(--text2)', fontSize: 11 }}>
                Actualiza a taxa manualmente em "Taxas históricas" com o valor do PDF.
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Historical rates panel */}
      {showTaxas && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Taxas Históricas CA Série E</div>
            <button onClick={() => {
              const hoje = new Date()
              setEditTaxa({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, taxa_anual: taxaAtual?.taxa_anual || '' })
            }} style={{ background: 'var(--bg3)', border: '1px solid var(--green)', color: 'var(--green)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
              + Adicionar
            </button>
          </div>

          {editTaxa && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: 10, background: 'var(--bg3)', borderRadius: 6 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 2 }}>Ano</label>
                <input type="number" value={editTaxa.ano} onChange={e => setEditTaxa(p => ({ ...p, ano: parseInt(e.target.value) }))}
                  style={{ width: 70, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 2 }}>Mês</label>
                <input type="number" min="1" max="12" value={editTaxa.mes} onChange={e => setEditTaxa(p => ({ ...p, mes: parseInt(e.target.value) }))}
                  style={{ width: 60, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 2 }}>Taxa Anual (%)</label>
                <input type="number" step="0.001" value={editTaxa.taxa_anual} onChange={e => setEditTaxa(p => ({ ...p, taxa_anual: e.target.value }))}
                  style={{ width: 90, background: 'var(--bg)', border: '1px solid var(--blue)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4, fontSize: 12 }}
                  placeholder="ex: 2.112" />
              </div>
              <div style={{ alignSelf: 'flex-end', display: 'flex', gap: 6 }}>
                <button onClick={saveTaxa} style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Guardar</button>
                <button onClick={() => setEditTaxa(null)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {taxas.map(t => (
              <div key={`${t.ano}-${t.mes}`}
                onClick={() => setEditTaxa({ ano: t.ano, mes: t.mes, taxa_anual: t.taxa_anual })}
                style={{
                  padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6,
                  cursor: 'pointer', border: '1px solid var(--border)',
                  borderColor: (t.ano === hoje.getFullYear() && t.mes === (hoje.getMonth() + 1)) ? 'var(--yellow)' : 'var(--border)'
                }}>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t.ano}/{String(t.mes).padStart(2, '0')}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)' }}>{t.taxa_anual}%</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{t.fonte}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 16 }}>
        <Card>
          <div className="chart-wrap" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.eur(v, 0)} />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="valor" name="Valor" radius={[4,4,0,0]}>
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
            <SummaryRow label="Valor Atual" value={fmt.eur(summary.valor_atual)} />
            <SummaryRow label="Ganhos" value={fmt.eur(summary.ganhos)} className={colorClass(summary.ganhos)} />
            <SummaryRow label="Ganhos %" value={fmt.pct(summary.ganhos_pct)} className={colorClass(summary.ganhos_pct)} />
            <SummaryRow label="Investido" value={fmt.eur(summary.investido)} />
            <SummaryRow label="Ganhos brutos" value={fmt.eur(summary.ganhos_brutos)} className={colorClass(summary.ganhos_brutos)} />
            <SummaryRow label="Imposto retido (28%)" value={fmt.eur(summary.imposto_retido)} className="neg" />
            <SummaryRow label="Taxa actual" value={`${summary.taxa_atual}%`} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data Subscr.</th>
                <th>Unid.</th>
                <th className="hide-mobile">Trimestres</th>
                <th className="hide-mobile">Taxa Actual</th>
                <th>Val. Unitária</th>
                <th className="hide-mobile">Próx. Capital.</th>
                <th>Valor €</th>
                <th>Ganhos Líq.</th>
                <th className="hide-mobile">Imposto (28%)</th>
                <th className="hide-mobile">Vencimento</th>
                <th className="hide-mobile">Meses p/ Venc.</th>
              </tr>
            </thead>
            <tbody>
              {subscricoes.map((s, i) => (
                <tr key={i}>
                  <td>{fmt.date(s.data_subscricao)}</td>
                  <td>{s.unidades.toLocaleString('pt-PT')}</td>
                  <td className="hide-mobile" style={{ color: 'var(--text2)' }}>{s.trimestres}</td>
                  <td className="hide-mobile" style={{ color: 'var(--yellow)' }}>{s.taxa_atual}%</td>
                  <td>{s.valorizacao_unitaria.toFixed(5)}</td>
                  <td className="hide-mobile" style={{ color: 'var(--text2)' }}>{fmt.date(s.proxima_capitalizacao)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt.eur(s.valor_atual)}</td>
                  <GainsCell val={s.ganhos} pct={s.ganhos_pct} />
                  <td className="hide-mobile neg">{fmt.eur(s.imposto_retido)}</td>
                  <td className="hide-mobile" style={{ color: 'var(--text2)' }}>{fmt.date(s.data_vencimento)}</td>
                  <td className="hide-mobile" style={{ color: 'var(--text2)' }}>{s.meses_para_vencimento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
