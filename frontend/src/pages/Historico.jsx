import React, { useState, useEffect, useCallback } from 'react'
import { Card, Loading } from '../components/Shared'
import { fmt } from '../hooks/usePortfolio'

const ACCAO_OPTIONS = ['Compra','Venda','P2P','Juro','Dividendo','DRIP','SPLIT','Levantamento','Ajustamento','deposito']

const ACCAO_COLORS = {
  Compra: '#3fb950', Venda: '#f85149', P2P: '#58a6ff',
  Juro: '#e3b341', Dividendo: '#e3b341', DRIP: '#bc8cff',
  SPLIT: '#8b949e', Ajustamento: '#8b949e', Levantamento: '#f85149',
}

function EditableCell({ value, type = 'text', options, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)

  const commit = async () => {
    setEditing(false)
    if (String(val) !== String(value)) await onSave(val)
  }

  if (!editing) return (
    <span
      onClick={() => { setVal(value); setEditing(true) }}
      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border)', padding: '1px 2px' }}
    >
      {value ?? '—'}
    </span>
  )

  if (type === 'select') return (
    <select
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      autoFocus
      style={{ background: 'var(--bg3)', border: '1px solid var(--blue)', color: 'var(--text)', padding: '2px 4px', borderRadius: 4, fontSize: 12 }}
    >
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  )

  return (
    <input
      type={type}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      autoFocus
      style={{ width: type === 'number' ? 100 : 130, background: 'var(--bg3)', border: '1px solid var(--blue)', color: 'var(--text)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}
    />
  )
}

export default function Historico() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [newTx, setNewTx] = useState({ data: '', ticker: '', accao: 'Compra', qtd: '', preco: '', comissao: '0', total: '', notas: '' })
  const [saving, setSaving] = useState(null) // id of row being saved

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/transactions?limit=2000')
    setTransactions(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateField = async (id, field, value) => {
    setSaving(id)
    // Fetch current row
    const row = transactions.find(t => t.id === id)
    const updated = { ...row, [field]: value }
    await fetch(`/api/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: updated.data,
        ticker: updated.ticker,
        accao: updated.accao,
        qtd: parseFloat(updated.qtd),
        preco: parseFloat(updated.preco),
        comissao: parseFloat(updated.comissao || 0),
        total: parseFloat(updated.total),
        notas: updated.notas || '',
      })
    })
    // Invalidate portfolio cache
    await fetch('/api/prices/refresh', { method: 'POST' })
    await load()
    setSaving(null)
  }

  const deleteRow = async (id) => {
    if (!confirm('Eliminar esta transação?')) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    await fetch('/api/prices/refresh', { method: 'POST' })
    await load()
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportResult(null)
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch('/api/transactions/import', { method: 'POST', body: fd })
    setImportResult(await r.json())
    setImporting(false)
    await load()
  }

  const handleAddTx = async () => {
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newTx,
        qtd: parseFloat(newTx.qtd),
        preco: parseFloat(newTx.preco),
        comissao: parseFloat(newTx.comissao || 0),
        total: parseFloat(newTx.total),
      })
    })
    setShowForm(false)
    setNewTx({ data: '', ticker: '', accao: 'Compra', qtd: '', preco: '', comissao: '0', total: '', notas: '' })
    await load()
  }

  const filtered = transactions.filter(t =>
    !search ||
    t.ticker.toLowerCase().includes(search.toLowerCase()) ||
    t.accao.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div style={{ padding: 40, color: 'var(--text2)', textAlign: 'center' }}>A carregar...</div>

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Histórico</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            placeholder="Pesquisar ticker ou ação..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 6, fontSize: 12, width: 220 }}
          />
          <button onClick={() => setShowForm(v => !v)} style={{ background: 'var(--bg3)', border: '1px solid var(--green)', color: 'var(--green)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            + Nova transação
          </button>
          <label style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--blue)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            ↑ Importar CSV
            <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {importing && <div style={{ padding: 12, marginBottom: 12, background: 'var(--bg3)', borderRadius: 6, color: 'var(--yellow)' }}>A importar...</div>}
      {importResult && (
        <div style={{ padding: 12, marginBottom: 12, background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--green)' }}>✓ {importResult.inserted} transações importadas</div>
          {importResult.errors?.length > 0 && <div style={{ color: 'var(--red)', marginTop: 4, fontSize: 11 }}>{importResult.errors.join('; ')}</div>}
        </div>
      )}

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>Nova transação</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10, alignItems: 'end' }}>
            {[
              { key: 'data', label: 'Data', type: 'date' },
              { key: 'ticker', label: 'Ticker', type: 'text' },
              { key: 'accao', label: 'Ação', type: 'select', options: ACCAO_OPTIONS },
              { key: 'qtd', label: 'Qtd', type: 'number' },
              { key: 'preco', label: 'Preço', type: 'number' },
              { key: 'comissao', label: 'Comissão', type: 'number' },
              { key: 'total', label: 'Total', type: 'number' },
              { key: 'notas', label: 'Notas', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                {f.type === 'select' ? (
                  <select value={newTx[f.key]} onChange={e => setNewTx(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 6px', borderRadius: 4, fontSize: 12 }}>
                    {f.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type} value={newTx[f.key]} onChange={e => setNewTx(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 6px', borderRadius: 4, fontSize: 12 }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={handleAddTx} style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '7px 18px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text2)' }}>
          {filtered.length} transações
          <span style={{ marginLeft: 12, fontSize: 11 }}>— clica em qualquer célula para editar</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Ticker</th><th>Ação</th><th>Qtd</th>
                <th>Preço</th><th>Comissão</th><th>Total</th><th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} style={{ opacity: saving === t.id ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                  <td>
                    <EditableCell value={t.data?.split('T')[0] ?? t.data} type="date"
                      onSave={v => updateField(t.id, 'data', v)} />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    <EditableCell value={t.ticker} type="text"
                      onSave={v => updateField(t.id, 'ticker', v)} />
                  </td>
                  <td>
                    <EditableCell value={t.accao} type="select" options={ACCAO_OPTIONS}
                      onSave={v => updateField(t.id, 'accao', v)} />
                  </td>
                  <td>
                    <EditableCell value={t.qtd} type="number"
                      onSave={v => updateField(t.id, 'qtd', v)} />
                  </td>
                  <td>
                    <EditableCell value={t.preco} type="number"
                      onSave={v => updateField(t.id, 'preco', v)} />
                  </td>
                  <td>
                    <EditableCell value={t.comissao} type="number"
                      onSave={v => updateField(t.id, 'comissao', v)} />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    <EditableCell value={t.total} type="number"
                      onSave={v => updateField(t.id, 'total', v)} />
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 11 }}>
                    <EditableCell value={t.notas || ''} type="text"
                      onSave={v => updateField(t.id, 'notas', v)} />
                  </td>
                  <td>
                    <button onClick={() => deleteRow(t.id)} title="Eliminar"
                      style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: '2px 6px', opacity: 0.6 }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
