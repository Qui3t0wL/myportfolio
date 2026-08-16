import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, Loading, ErrorMsg, SummaryDonut, SummaryRow, GainsCell } from '../components/Shared'
import { fmt, colorClass } from '../hooks/usePortfolio'

const COLORS = ['#8e3466', '#c0528a', '#6c2450', '#d980af', '#a0406e']

const MESES_PT = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const GRUPOS = {
  A: [1,4,7,10],
  B: [2,5,8,11],
  C: [3,6,9,12],
}

function grupoLabel(mes) {
  if (GRUPOS.A.includes(mes)) return 'A (Jan/Abr/Jul/Out)'
  if (GRUPOS.B.includes(mes)) return 'B (Fev/Mai/Ago/Nov)'
  return 'C (Mar/Jun/Set/Dez)'
}

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 6, fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
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
  const [caData, setCaData]       = useState(null)
  const [taxas, setTaxas]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showTaxas, setShowTaxas] = useState(false)
  const [fetchingPdf, setFetchingPdf] = useState(false)
  const [pdfResult, setPdfResult] = useState(null)

  // Form para inserir PDF completo (3 taxas)
  const hoje = new Date()
  const [pdfForm, setPdfForm] = useState({
    vig_ano: hoje.getFullYear(),
    vig_mes: hoje.getMonth() + 1,
    taxa_a: '', taxa_b: '', taxa_c: '',
    fonte: 'manual',
  })
  const [saving, setSaving] = useState(false)

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

  const savePdfTaxas = async () => {
    if (!pdfForm.taxa_a || !pdfForm.taxa_b || !pdfForm.taxa_c) return
    setSaving(true)
    await fetch('/api/ca/taxas/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vig_ano: parseInt(pdfForm.vig_ano),
        vig_mes: parseInt(pdfForm.vig_mes),
        taxa_a:  parseFloat(pdfForm.taxa_a),
        taxa_b:  parseFloat(pdfForm.taxa_b),
        taxa_c:  parseFloat(pdfForm.taxa_c),
        fonte:   pdfForm.fonte,
      })
    })
    setSaving(false)
    await load()
  }

  if (loading) return <Loading />
  if (!caData)  return <ErrorMsg msg="Sem dados de Certificados de Aforro" />

  const { subscricoes, summary } = caData

  const barData = subscricoes.map((s, i) => ({
    name:  fmt.date(s.data_subscricao),
    valor: s.valor_atual,
    color: COLORS[i % COLORS.length],
  }))

  const donutAssets = subscricoes.map(s => ({
    ticker: fmt.date(s.data_subscricao),
    valor:  s.valor_atual,
  }))

  // Group taxas by (vig_ano, vig_mes) for display
  const taxasAgrupadas = {}
  taxas.forEach(t => {
    const key = `${t.vigencia_ano}-${String(t.vigencia_mes).padStart(2,'0')}`
    if (!taxasAgrupadas[key]) taxasAgrupadas[key] = { ano: t.vigencia_ano, mes: t.vigencia_mes, taxas: {} }
    taxasAgrupadas[key].taxas[t.mes_subscricao] = t.taxa_anual
  })
  const taxasOrdenadas = Object.entries(taxasAgrupadas).sort((a,b) => b[0].localeCompare(a[0]))

  return (
    <div className="page" style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Certificados de Aforro</h1>
        <div className="page-header-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setShowTaxas(v => !v)}
            style={{ background: showTaxas ? 'var(--bg3)' : 'var(--bg3)', border: `1px solid ${showTaxas ? 'var(--yellow)' : 'var(--border)'}`, color: showTaxas ? 'var(--yellow)' : 'var(--text)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            📋 Taxas IGCP
          </button>
          <button onClick={fetchPdf} disabled={fetchingPdf}
            style={{ background: 'var(--bg3)', border: '1px solid var(--blue)', color: 'var(--blue)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            {fetchingPdf ? 'A obter...' : '↓ Testar PDF'}
          </button>
        </div>
      </div>

      {/* PDF result */}
      {pdfResult && (
        <Card style={{ marginBottom: 16, background: pdfResult.error ? '#1a0808' : '#081a08' }}>
          {pdfResult.error
            ? <div style={{ color: 'var(--red)', fontSize: 12 }}>✗ {pdfResult.error}<br/>{pdfResult.details?.join(' | ')}</div>
            : <div style={{ fontSize: 12 }}>
                <div style={{ color: 'var(--green)', marginBottom: 6 }}>✓ PDF obtido: {pdfResult.url}</div>
                <div style={{ color: 'var(--text2)' }}>Taxas detectadas: <span style={{ color: 'var(--yellow)' }}>{pdfResult.rates_found?.join(', ')}</span></div>
                <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 6, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>{pdfResult.text_preview}</div>
              </div>
          }
        </Card>
      )}

      {/* Taxas panel */}
      {showTaxas && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Taxas IGCP por PDF</div>

          {/* Insert new PDF rates */}
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>
              INSERIR TAXAS DE UM NOVO PDF
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Ano do PDF</label>
                <input type="number" value={pdfForm.vig_ano} onChange={e => setPdfForm(p => ({ ...p, vig_ano: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Mês do PDF</label>
                <select value={pdfForm.vig_mes} onChange={e => setPdfForm(p => ({ ...p, vig_mes: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }}>
                  {MESES_PT.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Taxa A — Jan/Abr/Jul/Out (%)</label>
                <input type="number" step="0.001" placeholder="ex: 3,509" value={pdfForm.taxa_a}
                  onChange={e => setPdfForm(p => ({ ...p, taxa_a: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Taxa B — Fev/Mai/Ago/Nov (%)</label>
                <input type="number" step="0.001" placeholder="ex: 3,544" value={pdfForm.taxa_b}
                  onChange={e => setPdfForm(p => ({ ...p, taxa_b: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Taxa C — Mar/Jun/Set/Dez (%)</label>
                <input type="number" step="0.001" placeholder="ex: 3,528" value={pdfForm.taxa_c}
                  onChange={e => setPdfForm(p => ({ ...p, taxa_c: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Fonte</label>
                <input type="text" value={pdfForm.fonte} onChange={e => setPdfForm(p => ({ ...p, fonte: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={savePdfTaxas} disabled={saving || !pdfForm.taxa_a || !pdfForm.taxa_b || !pdfForm.taxa_c}
                style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '7px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'A guardar...' : '✓ Guardar taxas do PDF'}
              </button>
              <span style={{ marginLeft: 12, fontSize: 11, color: 'var(--text2)' }}>
                Insere as 3 taxas do grupo do PDF (ex: Nov/2025 → A=3,509% B=3,544% C=3,528%)
              </span>
            </div>
          </div>

          {/* Historical rates table */}
          <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Vigência</th>
                  <th>Grupo A (Jan/Abr/Jul/Out)</th>
                  <th>Grupo B (Fev/Mai/Ago/Nov)</th>
                  <th>Grupo C (Mar/Jun/Set/Dez)</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {taxasOrdenadas.map(([key, entry]) => {
                  const ta = entry.taxas[1] || entry.taxas[4] || entry.taxas[7] || entry.taxas[10]
                  const tb = entry.taxas[2] || entry.taxas[5] || entry.taxas[8] || entry.taxas[11]
                  const tc = entry.taxas[3] || entry.taxas[6] || entry.taxas[9] || entry.taxas[12]
                  const isCurrent = entry.ano === hoje.getFullYear() && entry.mes === (hoje.getMonth() + 1)
                  return (
                    <tr key={key} style={{ background: isCurrent ? 'rgba(227,179,65,0.08)' : undefined }}>
                      <td style={{ fontWeight: isCurrent ? 700 : 400, color: isCurrent ? 'var(--yellow)' : 'var(--text)' }}>
                        {MESES_PT[entry.mes]}/{entry.ano}
                        {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--yellow)' }}>← actual</span>}
                      </td>
                      <td style={{ color: 'var(--green)' }}>{ta ? `${ta}%` : '—'}</td>
                      <td style={{ color: 'var(--green)' }}>{tb ? `${tb}%` : '—'}</td>
                      <td style={{ color: 'var(--green)' }}>{tc ? `${tc}%` : '—'}</td>
                      <td style={{ color: 'var(--text2)', fontSize: 11 }}>{entry.taxas[1] ? taxas.find(t => t.mes_subscricao===1 && t.vigencia_ano===entry.ano && t.vigencia_mes===entry.mes)?.fonte : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Charts */}
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
            <SummaryRow label="Ganhos Líquidos" value={fmt.eur(summary.ganhos)} className={colorClass(summary.ganhos)} />
            <SummaryRow label="Ganhos %" value={fmt.pct(summary.ganhos_pct)} className={colorClass(summary.ganhos_pct)} />
            <SummaryRow label="Ganhos Brutos" value={fmt.eur(summary.ganhos_brutos)} className={colorClass(summary.ganhos_brutos)} />
            <SummaryRow label="Imposto retido (28%)" value={fmt.eur(summary.imposto_retido)} className="neg" />
            <SummaryRow label="Investido" value={fmt.eur(summary.investido)} />
            {summary.taxa_atual && <SummaryRow label="Taxa actual" value={`${summary.taxa_atual}%`} />}
            {caData.source && (
              <div style={{ marginTop: 8, padding: '4px 8px', borderRadius: 4, fontSize: 11,
                background: caData.source === 'CTT' ? 'rgba(63,185,80,0.1)' : 'rgba(227,179,65,0.1)',
                color: caData.source === 'CTT' ? 'var(--green)' : 'var(--yellow)' }}>
                {caData.source === 'CTT' ? '✓ Valores via tabela CTT' : '⚠ Valores calculados (CTT indisponível)'}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data Subscr.</th>
                <th>Unid.</th>
                <th className="hide-mobile">Grupo</th>
                <th className="hide-mobile">Trimestres</th>
                <th className="hide-mobile">Taxa Actual</th>
                <th>Val. Unit. CTT</th>
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
                  <td className="hide-mobile" style={{ color: 'var(--text2)', fontSize: 11 }}>
                    {grupoLabel(new Date(s.data_subscricao).getMonth() + 1)}
                  </td>
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
