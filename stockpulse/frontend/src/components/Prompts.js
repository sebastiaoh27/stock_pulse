import React, { useState } from 'react';
import { api } from '../App';
import { useSettings } from '../App';

const DEFAULT_SCHEMA = JSON.stringify({ type:"object", properties:{ signal:{ type:"string", enum:["BUY","HOLD","SELL","WATCH"] }, score:{ type:"number", description:"Score 0-100" }, summary:{ type:"string", description:"Brief summary" } }, required:["signal","score","summary"] }, null, 2);

function validateSchema(str) {
  try { const p = JSON.parse(str); if (!p.properties) return 'Missing "properties"'; if (!p.required || !Array.isArray(p.required)) return 'Missing "required" array'; return null; }
  catch (e) { return `Invalid JSON: ${e.message}`; }
}

function SchemaFieldChips({ schema }) {
  const props = typeof schema === 'object' ? schema?.properties : {};
  if (!props) return null;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:10 }}>
      {Object.entries(props).map(([k, v]) => (
        <span key={k} style={{ padding:'2px 7px', border:'1px solid var(--border2)', borderRadius:4, fontSize:11, fontFamily:'var(--mono)', color:'var(--text2)' }}>
          <span style={{color:'var(--blue)'}}>{k}</span>
          <span style={{color:'var(--text3)',marginLeft:4}}>{v.enum ? v.enum.slice(0,2).join('|')+'…' : v.type}</span>
        </span>
      ))}
    </div>
  );
}

function PromptModal({ prompt, onSave, onClose }) {
  const [form, setForm] = useState(prompt || { name:'', description:'', prompt_text:'', output_schema: DEFAULT_SCHEMA });
  const [schemaErr, setSchemaErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const schemaStr = typeof form.output_schema === 'object' ? JSON.stringify(form.output_schema, null, 2) : form.output_schema;

  const save = async () => {
    const err = validateSchema(schemaStr);
    if (err) { setSchemaErr(err); return; }
    setSaving(true);
    try { await onSave({ ...form, output_schema: JSON.parse(schemaStr) }); onClose(); }
    catch (e) { setSchemaErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr">
          <div className="modal-title">{prompt ? 'Edit Prompt' : 'New Prompt'}</div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="grid-2" style={{gap:10}}>
            <div className="form-row">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f,name:e.target.value}))} placeholder="e.g. Earnings Watch" />
            </div>
            <div className="form-row">
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e => setForm(f => ({...f,description:e.target.value}))} placeholder="Short description" />
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">Prompt Text *</label>
            <textarea className="form-textarea" rows={5} value={form.prompt_text} onChange={e => setForm(f => ({...f,prompt_text:e.target.value}))} placeholder="Describe what Claude should analyze. Stock data is automatically included." />
          </div>
          <div className="form-row">
            <label className="form-label">Output Schema (JSON Schema) *</label>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:5}}>Define the structured fields you want back from Claude for each stock.</div>
            <textarea className="form-textarea mono" rows={14} value={schemaStr}
              onChange={e => { setForm(f => ({...f,output_schema:e.target.value})); setSchemaErr(validateSchema(e.target.value)); }}
              spellCheck={false} />
            {schemaErr && <div style={{fontSize:12,color:'var(--red)',marginTop:4}}>⚠ {schemaErr}</div>}
          </div>
          <div style={{background:'var(--bg)',borderRadius:8,padding:'10px 12px',fontSize:12,color:'var(--text2)',lineHeight:1.7}}>
            <strong style={{color:'var(--text)'}}>Tips:</strong> Use <code style={{color:'var(--green)'}}>enum</code> for categories → rendered as colored badges. Use <code style={{color:'var(--green)'}}>number</code> (0-100) → rendered as bars. Use <code style={{color:'var(--green)'}}>string</code> for free text insights.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim() || !form.prompt_text.trim() || !!schemaErr}>
            {saving ? <><span className="spinner" />Saving…</> : (prompt ? 'Save Changes' : 'Create Prompt')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Prompts({ prompts, onPromptsChange, showNotification, stocks }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { model } = useSettings();
  const [estimate, setEstimate] = useState(null);

  const loadEstimate = React.useCallback(async () => {
    if (!stocks?.length || !prompts?.length) return;
    try {
      const e = await api('/runs/estimate', { method:'POST', body:{ stock_count: stocks.length, prompt_count: prompts.filter(p=>p.active).length, model } });
      setEstimate(e);
    } catch (_) {}
  }, [stocks, prompts, model]);

  React.useEffect(() => { loadEstimate(); }, [loadEstimate]);

  const save = async (data) => {
    if (data.id) { await api(`/prompts/${data.id}`, { method:'PUT', body:data }); showNotification('Prompt updated'); }
    else { await api('/prompts', { method:'POST', body:data }); showNotification('Prompt created'); }
    onPromptsChange();
  };

  const del = async (id) => {
    if (!window.confirm('Delete this prompt? Historical results are kept.')) return;
    await api(`/prompts/${id}`, { method:'DELETE' });
    onPromptsChange(); showNotification('Deleted');
  };

  const toggle = async (p) => {
    await api(`/prompts/${p.id}`, { method:'PUT', body:{...p,output_schema:p.output_schema,active:p.active?0:1} });
    onPromptsChange();
  };

  const fmtTime = (s) => s >= 60 ? `~${Math.ceil(s/60)}m` : `~${s}s`;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Prompts</h1>
        <p className="sub">Each active prompt runs on every tracked stock during a run</p>
      </div>
      <div className="page-body">
        {estimate && (
          <div className="estimate-box">
            <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>
              Next run estimate ({estimate.confidence} confidence, {estimate.based_on} runs sampled)
            </div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
              <div className="estimate-row" style={{gap:8}}><span className="estimate-label">Cost</span><span className="estimate-val" style={{color:'var(--purple)'}}>~${estimate.estimated_cost.toFixed(4)}</span></div>
              <div className="estimate-row" style={{gap:8}}><span className="estimate-label">Tokens</span><span className="estimate-val">{estimate.estimated_tokens.toLocaleString()}</span></div>
              <div className="estimate-row" style={{gap:8}}><span className="estimate-label">Time</span><span className="estimate-val">{fmtTime(estimate.estimated_seconds)}</span></div>
            </div>
          </div>
        )}

        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ New Prompt</button>
        </div>

        {!prompts.length ? (
          <div className="card"><div className="empty"><div className="empty-icon">◉</div><div className="empty-title">No prompts yet</div><div className="empty-desc">Create prompts to define what Claude analyzes for each stock.</div></div></div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {prompts.map(p => (
              <div key={p.id} className="card" style={{opacity:p.active?1:0.5}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                      <span style={{fontWeight:600,fontSize:15}}>{p.name}</span>
                      <span className={`badge ${p.active?'badge-green':'badge-gray'}`} style={{fontSize:10}}>{p.active?'ACTIVE':'PAUSED'}</span>
                    </div>
                    {p.description && <div style={{fontSize:13,color:'var(--text2)',marginBottom:8}}>{p.description}</div>}
                    <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 10px',fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',lineHeight:1.6,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                      {p.prompt_text}
                    </div>
                    <SchemaFieldChips schema={p.output_schema} />
                  </div>
                  <div style={{display:'flex',gap:5,flexShrink:0}}>
                    <button className="btn btn-xs" onClick={() => toggle(p)}>{p.active?'⏸':'▶'}</button>
                    <button className="btn btn-xs" onClick={() => { setEditing(p); setModal(true); }}>✎</button>
                    <button className="btn btn-xs btn-danger" onClick={() => del(p.id)}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {modal && <PromptModal prompt={editing} onSave={save} onClose={() => { setModal(false); setEditing(null); }} />}
    </div>
  );
}
