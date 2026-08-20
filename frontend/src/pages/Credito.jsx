import React, { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, Legend
} from 'recharts'
import { Card, Loading, ErrorMsg } from '../components/Shared'
import { fmt } from '../hooks/usePortfolio'

// ── Paleta ────────────────────────────────────────────────────────────────────
const C_CAPITAL  = '#e05c3a'
const C_JUROS    = '#c0392b'
const C_SALDO    = '#7b241c'
const C_AMORT    = '#f39c12'

// ── Utils ─────────────────────────────────────────────────────────────────────
const fmtPct = v => v != null ? `${Number(v).toFixed(2)}%` : '—'
const fmtDate = v => v ? new Date(v).toLocaleDateString('pt-PT') : '—'
const fmtDateInput = d => {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}

// ── Tooltip customizado ───────────────────────────────────────────────────────
const PlanTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 6, fontSize: 12, minWidth: 180 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <span style={{ color: p.fill || p.stroke || 'var(--text2)' }}>{p.name}</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt.eur(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Componente de stat card ────────────────────────────────────────────────────
function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px', borderLeft: `3px solid ${color || 'var(--border)'}` }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Barra de progresso ────────────────────────────────────────────────────────
function ProgressBar({ pct, label }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg, ${C_CAPITAL}, ${C_JUROS})`, borderRadius: 4, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// ── Formulário de empréstimo ──────────────────────────────────────────────────
function EmprestimoForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    nome: 'Crédito Habitação', banco: '', data_inicio: '',
    valor_inicial: '', prazo_meses: '', taxa_juros_anual: '',
    spread: '', tipo_taxa: 'variavel', data_revisao_taxa: '', notas: ''
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const fields = [
    { k: 'nome',            label: 'Nome',              type: 'text' },
    { k: 'banco',           label: 'Banco',             type: 'text' },
    { k: 'data_inicio',     label: 'Data de início',    type: 'date' },
    { k: 'valor_inicial',   label: 'Valor inicial (€)', type: 'number' },
    { k: 'prazo_meses',     label: 'Prazo (meses)',     type: 'number' },
    { k: 'taxa_juros_anual',label: 'Taxa total (%)',    type: 'number', step: '0.001' },
    { k: 'spread',          label: 'Spread (%)',        type: 'number', step: '0.001' },
    { k: 'data_revisao_taxa',label:'Próx. revisão taxa', type: 'date' },
  ]

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
        {initial ? 'Editar Empréstimo' : 'Novo Empréstimo'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
        {fields.map(f => (
          <div key={f.k}>
            <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</label>
            <input type={f.type} step={f.step} value={form[f.k]}
              onChange={e => set(f.k, e.target.value)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', borderRadius: 4, fontSize: 13 }} />
          </div>
        ))}
        <div>
          <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tipo de taxa</label>
          <select value={form.tipo_taxa} onChange={e => set('tipo_taxa', e.target.value)}
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', borderRadius: 4, fontSize: 13 }}>
            <option value="variavel">Variável</option>
            <option value="fixa">Fixa</option>
            <option value="mista">Mista</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</label>
        <input type="text" value={form.notas} onChange={e => set('notas', e.target.value)}
          style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', borderRadius: 4, fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onSave(form)}
          style={{ background: C_CAPITAL, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          Guardar
        </button>
        <button onClick={onCancel}
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Cancelar
        </button>
      </div>
    </Card>
  )
}

// ── Gestão de revisões de taxa ────────────────────────────────────────────────
function TaxasPanel({ empId, spread }) {
  const [taxas, setTaxas] = useState([])
  const [form, setForm]   = useState({ data_vigor: '', euribor: '', spread: spread || '' })

  const load = useCallback(async () => {
    const r = await fetch(`/api/credito/emprestimos/${empId}/taxas`)
    setTaxas(await r.json())
  }, [empId])

  useEffect(() => { load() }, [load])

  const save = async () => {
    await fetch(`/api/credito/emprestimos/${empId}/taxas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, euribor: parseFloat(form.euribor), spread: parseFloat(form.spread || 0) })
    })
    await load()
  }

  const del = async id => {
    if (!confirm('Eliminar revisão?')) return
    await fetch(`/api/credito/taxas/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Histórico de Revisões de Taxa</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { k: 'data_vigor', label: 'Data vigor', type: 'date' },
          { k: 'euribor',    label: 'Euribor (%)', type: 'number' },
          { k: 'spread',     label: 'Spread (%)',  type: 'number' },
        ].map(f => (
          <div key={f.k}>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{f.label}</div>
            <input type={f.type} step="0.001" value={form[f.k]}
              onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
              style={{ width: 130, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
          </div>
        ))}
        <div style={{ alignSelf: 'flex-end' }}>
          <button onClick={save}
            style={{ background: 'var(--bg3)', border: `1px solid ${C_CAPITAL}`, color: C_CAPITAL, padding: '5px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            + Adicionar
          </button>
        </div>
      </div>
      {taxas.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr><th style={{ textAlign: 'left', color: 'var(--text2)', padding: '4px 8px', fontSize: 10 }}>Data Vigor</th>
                <th style={{ textAlign: 'right', color: 'var(--text2)', padding: '4px 8px', fontSize: 10 }}>Euribor</th>
                <th style={{ textAlign: 'right', color: 'var(--text2)', padding: '4px 8px', fontSize: 10 }}>Spread</th>
                <th style={{ textAlign: 'right', color: 'var(--text2)', padding: '4px 8px', fontSize: 10 }}>Total</th>
                <th></th></tr>
          </thead>
          <tbody>
            {taxas.map(t => (
              <tr key={t.id}>
                <td style={{ padding: '4px 8px' }}>{fmtDate(t.data_vigor)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--yellow)' }}>{fmtPct(t.euribor)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text2)' }}>{fmtPct(t.spread)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtPct(t.taxa_total)}</td>
                <td style={{ padding: '4px 8px' }}>
                  <button onClick={() => del(t.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', opacity: 0.7 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Amortizações antecipadas ──────────────────────────────────────────────────
function AmortizacoesPanel({ empId, onRefresh }) {
  const [lista, setLista] = useState([])
  const [form, setForm]   = useState({ data: '', valor: '', notas: '' })

  const load = useCallback(async () => {
    const r = await fetch(`/api/credito/emprestimos/${empId}/amortizacoes`)
    setLista(await r.json())
  }, [empId])

  useEffect(() => { load() }, [load])

  const save = async () => {
    await fetch(`/api/credito/emprestimos/${empId}/amortizacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, valor: parseFloat(form.valor) })
    })
    setForm({ data: '', valor: '', notas: '' })
    await load()
    onRefresh()
  }

  const del = async id => {
    if (!confirm('Eliminar amortização?')) return
    await fetch(`/api/credito/amortizacoes/${id}`, { method: 'DELETE' })
    await load()
    onRefresh()
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amortizações Antecipadas</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { k: 'data', label: 'Data', type: 'date' },
          { k: 'valor', label: 'Valor (€)', type: 'number' },
          { k: 'notas', label: 'Notas', type: 'text' },
        ].map(f => (
          <div key={f.k}>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{f.label}</div>
            <input type={f.type} value={form[f.k]}
              onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
              style={{ width: f.k === 'notas' ? 180 : 130, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 8px', borderRadius: 4, fontSize: 12 }} />
          </div>
        ))}
        <div style={{ alignSelf: 'flex-end' }}>
          <button onClick={save}
            style={{ background: 'var(--bg3)', border: `1px solid ${C_AMORT}`, color: C_AMORT, padding: '5px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            + Adicionar
          </button>
        </div>
      </div>
      {lista.map(a => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ color: 'var(--text2)' }}>{fmtDate(a.data)}</span>
          <span style={{ color: C_AMORT, fontWeight: 700 }}>-{fmt.eur(a.valor)}</span>
          <span style={{ color: 'var(--text2)', fontSize: 11, flex: 1, marginLeft: 16 }}>{a.notas}</span>
          <button onClick={() => del(a.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', opacity: 0.7 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function Credito() {
  const [emprestimos, setEmprestimos] = useState([])
  const [selected,    setSelected]    = useState(null)    // emprestimo_id activo
  const [plano,       setPlano]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editEmp,     setEditEmp]     = useState(null)
  const [showTaxas,   setShowTaxas]   = useState(false)
  const [showAmort,   setShowAmort]   = useState(false)
  const [viewMode,    setViewMode]    = useState('grafico') // 'grafico' | 'tabela'
  const [tableFilter, setTableFilter] = useState('futuro') // 'futuro' | 'todos'

  const loadEmps = useCallback(async () => {
    const r = await fetch('/api/credito/emprestimos')
    const list = await r.json()
    setEmprestimos(list)
    if (list.length > 0 && !selected) setSelected(list[0].id)
    setLoading(false)
  }, [selected])

  const loadPlano = useCallback(async id => {
    if (!id) return
    const r = await fetch(`/api/credito/emprestimos/${id}/plano`)
    setPlano(await r.json())
  }, [])

  useEffect(() => { loadEmps() }, [])
  useEffect(() => { if (selected) loadPlano(selected) }, [selected, loadPlano])

  const saveEmp = async form => {
    const method = editEmp ? 'PUT' : 'POST'
    const url    = editEmp ? `/api/credito/emprestimos/${editEmp.id}` : '/api/credito/emprestimos'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        valor_inicial:    parseFloat(form.valor_inicial),
        prazo_meses:      parseInt(form.prazo_meses),
        taxa_juros_anual: parseFloat(form.taxa_juros_anual),
        spread:           parseFloat(form.spread || 0),
      })
    })
    setShowForm(false); setEditEmp(null)
    await loadEmps()
    if (selected) loadPlano(selected)
  }

  const delEmp = async id => {
    if (!confirm('Eliminar este empréstimo?')) return
    await fetch(`/api/credito/emprestimos/${id}`, { method: 'DELETE' })
    setSelected(null); setPlano(null)
    loadEmps()
  }

  if (loading) return <Loading />

  const emp = emprestimos.find(e => e.id === selected)
  const resumo = plano?.resumo

  // Prepara dados para os gráficos
  let chartData = []
  if (plano?.plano) {
    // Amostra para não ter 300 pontos — mostra cada 3 meses
    const step = plano.plano.length > 120 ? 3 : 1
    chartData = plano.plano
      .filter((_, i) => i % step === 0)
      .map(p => ({
        data: p.data.slice(0, 7),   // "YYYY-MM"
        saldo: p.saldo_final,
        capital: p.amortizacao,
        juros: p.juros,
        extra: p.amort_extra,
        taxa: p.taxa_anual,
      }))
  }

  const hoje = new Date().toISOString().slice(0, 7)
  const planoFiltrado = tableFilter === 'futuro'
    ? (plano?.plano || []).filter(p => p.data >= hoje + '-01')
    : (plano?.plano || [])

  return (
    <div className="page" style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Crédito Habitação</h1>
        <div className="page-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {emprestimos.map(e => (
            <button key={e.id} onClick={() => setSelected(e.id)}
              style={{ background: selected === e.id ? 'var(--bg3)' : 'transparent',
                border: `1px solid ${selected === e.id ? C_CAPITAL : 'var(--border)'}`,
                color: selected === e.id ? C_CAPITAL : 'var(--text2)',
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: selected === e.id ? 700 : 400 }}>
              {e.nome}
            </button>
          ))}
          <button onClick={() => { setShowForm(true); setEditEmp(null) }}
            style={{ background: 'var(--bg3)', border: `1px solid ${C_CAPITAL}`, color: C_CAPITAL, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            + Novo
          </button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <EmprestimoForm
          initial={editEmp ? { ...editEmp, data_inicio: fmtDateInput(editEmp.data_inicio), data_revisao_taxa: fmtDateInput(editEmp.data_revisao_taxa) } : null}
          onSave={saveEmp}
          onCancel={() => { setShowForm(false); setEditEmp(null) }}
        />
      )}

      {/* Estado vazio */}
      {emprestimos.length === 0 && !showForm && (
        <Card>
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Nenhum empréstimo registado</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Adiciona o teu crédito habitação para acompanhar o plano de amortização.</div>
            <button onClick={() => setShowForm(true)}
              style={{ background: C_CAPITAL, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              + Registar Empréstimo
            </button>
          </div>
        </Card>
      )}

      {/* Conteúdo principal */}
      {emp && resumo && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Stat label="Saldo em dívida" value={fmt.eur(resumo.saldo_atual)} color={C_CAPITAL} />
            <Stat label="Capital amortizado" value={fmt.eur(resumo.capital_amortizado)}
                  sub={`${resumo.pct_amortizado}% do total`} color={C_JUROS} />
            <Stat label="Prestação mensal" value={fmt.eur(resumo.prestacao_atual)} color="var(--yellow)" />
            <Stat label="Total pago" value={fmt.eur(resumo.total_pago)} color="var(--text2)" />
            <Stat label="Juros pagos" value={fmt.eur(resumo.juros_pagos)}
                  sub={`+ ${fmt.eur(resumo.juros_futuros)} futuros`} color="var(--red)" />
            <Stat label="Prestações restantes" value={resumo.prestacoes_restantes}
                  sub={`Fim: ${fmtDate(resumo.data_fim)}`} color="var(--text2)" />
          </div>

          {/* Barra de progresso */}
          <Card style={{ marginBottom: 16 }}>
            <ProgressBar pct={resumo.pct_amortizado} label="Progresso de amortização" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
              <span>{fmt.eur(resumo.capital_amortizado)} amortizado</span>
              <span>{fmt.eur(resumo.saldo_atual)} em dívida</span>
            </div>
          </Card>

          {/* Gráficos + acções */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {['grafico', 'tabela'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{ background: viewMode === m ? 'var(--bg3)' : 'transparent',
                  border: `1px solid ${viewMode === m ? C_CAPITAL : 'var(--border)'}`,
                  color: viewMode === m ? C_CAPITAL : 'var(--text2)',
                  padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                {m === 'grafico' ? '📈 Gráficos' : '📋 Tabela'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={() => { setEditEmp(emp); setShowForm(true) }}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              ✏️ Editar
            </button>
            <button onClick={() => delEmp(emp.id)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--red)', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              🗑 Eliminar
            </button>
          </div>

          {viewMode === 'grafico' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Gráfico de saldo ao longo do tempo */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>EVOLUÇÃO DO SALDO EM DÍVIDA</div>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C_CAPITAL} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={C_CAPITAL} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="data" tick={{ fill: 'var(--text2)', fontSize: 10 }} tickFormatter={v => v.slice(0, 7)} axisLine={false} tickLine={false} interval={Math.ceil(chartData.length / 6)} />
                      <YAxis tick={{ fill: 'var(--text2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.eur(v, 0)} />
                      <Tooltip content={<PlanTooltip />} />
                      <Area type="monotone" dataKey="saldo" name="Saldo" stroke={C_CAPITAL} fill="url(#gradSaldo)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Gráfico de composição da prestação */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>COMPOSIÇÃO DA PRESTAÇÃO (capital vs juros)</div>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} stackOffset="none">
                      <XAxis dataKey="data" tick={{ fill: 'var(--text2)', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.ceil(chartData.length / 6)} />
                      <YAxis tick={{ fill: 'var(--text2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt.eur(v, 0)} />
                      <Tooltip content={<PlanTooltip />} />
                      <Bar dataKey="capital" name="Capital" stackId="a" fill={C_CAPITAL} radius={[0,0,0,0]} />
                      <Bar dataKey="juros" name="Juros" stackId="a" fill={C_JUROS} fillOpacity={0.55} radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}

          {viewMode === 'tabela' && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>PLANO DE AMORTIZAÇÃO</div>
                <div style={{ flex: 1 }} />
                {['futuro', 'todos'].map(f => (
                  <button key={f} onClick={() => setTableFilter(f)}
                    style={{ background: tableFilter === f ? 'var(--bg3)' : 'transparent',
                      border: `1px solid ${tableFilter === f ? C_CAPITAL : 'var(--border)'}`,
                      color: tableFilter === f ? C_CAPITAL : 'var(--text2)',
                      padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                    {f === 'futuro' ? 'Prestações futuras' : 'Todas'}
                  </button>
                ))}
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Nº</th><th>Data</th><th>Saldo Início</th>
                      <th>Prestação</th><th>Capital</th><th>Juros</th>
                      <th>Amort. Extra</th><th>Saldo Final</th><th>Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planoFiltrado.map(p => {
                      const isHoje = p.data.slice(0, 7) === hoje
                      return (
                        <tr key={p.n} style={{ background: isHoje ? 'rgba(224,92,58,0.08)' : undefined }}>
                          <td style={{ color: 'var(--text2)', fontSize: 11 }}>{p.n}</td>
                          <td style={{ fontWeight: isHoje ? 700 : 400, color: isHoje ? C_CAPITAL : 'var(--text)' }}>
                            {fmtDate(p.data)}{isHoje && <span style={{ marginLeft: 4, fontSize: 10, color: C_CAPITAL }}>← actual</span>}
                          </td>
                          <td>{fmt.eur(p.saldo_inicio)}</td>
                          <td style={{ fontWeight: 600 }}>{fmt.eur(p.prestacao)}</td>
                          <td style={{ color: C_CAPITAL, fontWeight: 600 }}>{fmt.eur(p.amortizacao)}</td>
                          <td style={{ color: 'var(--red)' }}>{fmt.eur(p.juros)}</td>
                          <td style={{ color: C_AMORT }}>{p.amort_extra > 0 ? fmt.eur(p.amort_extra) : '—'}</td>
                          <td style={{ fontWeight: 600 }}>{fmt.eur(p.saldo_final)}</td>
                          <td style={{ color: 'var(--yellow)', fontSize: 11 }}>{fmtPct(p.taxa_anual)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Painéis colapsáveis: taxas e amortizações */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showTaxas ? 14 : 0, cursor: 'pointer' }}
                onClick={() => setShowTaxas(v => !v)}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>📅 Revisões de Taxa Euribor</span>
                <span style={{ color: 'var(--text2)', fontSize: 12 }}>{showTaxas ? '▲' : '▼'}</span>
              </div>
              {showTaxas && <TaxasPanel empId={emp.id} spread={emp.spread} />}
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAmort ? 14 : 0, cursor: 'pointer' }}
                onClick={() => setShowAmort(v => !v)}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>⚡ Amortizações Antecipadas</span>
                <span style={{ color: 'var(--text2)', fontSize: 12 }}>{showAmort ? '▲' : '▼'}</span>
              </div>
              {showAmort && <AmortizacoesPanel empId={emp.id} onRefresh={() => loadPlano(selected)} />}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
