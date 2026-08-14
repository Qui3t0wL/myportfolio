import React, { useState, useCallback } from 'react'
import { Card, Loading } from '../components/Shared'
import { useTransactions, fmt } from '../hooks/usePortfolio'

const ACCAO_COLORS = {
  Compra: '#3fb950', Venda: '#f85149', P2P: '#58a6ff',
  Juro: '#e3b341', Dividendo: '#e3b341', DRIP: '#bc8cff',
  SPLIT: '#8b949e', Ajustamento: '#8b949e', Levantamento: '#f85149',
}

export default function Historico() {
  const { data: transactions, loading } = useTransactions()
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [newTx, setNewTx] = useState({ data: '', ticker: '', accao: 'Compra', qtd: '', preco: '', comissao: '0', total: '', notas: '' })

  const filtered = transactions.filter(t =>
    !search || t.ticker.toLowerCase().includes(search.toLowerCase()) ||
    t.accao.toLowerCase().includes(search.toLowerCase())
  )

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch('/api/transactions/import', { method: 'POST', body: fd })
      const result = await r.json()
      setImportResult(result)
    } catch (err) {
      setImportResult({ error: err.message })
    } finally {
      setImporting(false)
    }
  }

  const handleAddTx = async () => {
    const body = {
      ...newTx,
      qtd: parseFloat(newTx.qtd),
      preco: parseFloat(newTx.preco),
      comissao: parseFloat(newTx.comissao || 0),
      total: parseFloat(newTx.total),
    }
    await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setShowForm(false)
    window.location.reload()
  }

  if (loading) return <Loading />

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10, alignItems: 'end' }}>
            {[
              { key: 'data', label: 'Data', type: 'date' },
              { key: 'ticker', label: 'Ticker', type: 'text' },
              { key: 'accao', label: 'Ação', type: 'select', options: ['Compra','Venda','P2P','Juro','Dividendo','DRIP','SPLIT','Levantamento','Ajustamento','deposito'] },
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
        <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text2)' }}>{filtered.length} transações</div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Ticker</th><th>Ação</th><th>Qtd</th>
                <th>Preço</th><th>Comissão</th><th>Total</th><th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map(t => (
                <tr key={t.id}>
                  <td style={{ color: 'var(--text2)' }}>{fmt.date(t.data)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{t.ticker}</td>
                  <td>
                    <span style={{
                      color: ACCAO_COLORS[t.accao] || 'var(--text2)',
                      fontSize: 11, fontWeight: 600,
                      background: (ACCAO_COLORS[t.accao] || 'var(--text2)') + '22',
                      padding: '2px 7px', borderRadius: 4
                    }}>{t.accao}</span>
                  </td>
                  <td>{fmt.num(t.qtd, 8)}</td>
                  <td>{fmt.eur(t.preco, 4)}</td>
                  <td>{fmt.eur(t.comissao)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt.eur(t.total)}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 11 }}>{t.notas || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
