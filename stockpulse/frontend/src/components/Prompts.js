import React, { useState } from 'react';
import { api } from '../App';

const DEFAULT_SCHEMA = {
  type: "object",
  properties: {
    signal: { type: "string", enum: ["BUY", "HOLD", "SELL", "WATCH"] },
    score: { type: "number", description: "Score 0-100" },
    summary: { type: "string", description: "Brief analysis summary" }
  },
  required: ["signal", "score", "summary"]
};

function PromptModal({ prompt, onSave, onClose }) {
  const [form, setForm] = useState(
    prompt || {
      name: '',
      description: '',
      prompt_text: '',
      output_schema: JSON.stringify(DEFAULT_SCHEMA, null, 2),
    }
  );
  const [schemaError, setSchemaError] = useState(null);
  const [saving, setSaving] = useState(false);

  const schemaStr = typeof form.output_schema === 'object'
    ? JSON.stringify(form.output_schema, null, 2)
    : form.output_schema;

  const validateSchema = (str) => {
    try {
      const parsed = JSON.parse(str);
      if (!parsed.properties) return 'Schema must have a "properties" field';
      if (!parsed.required || !Array.isArray(parsed.required)) return 'Schema must have a "required" array';
      return null;
    } catch (e) {
      return `Invalid JSON: ${e.message}`;
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt_text.trim()) return;
    const err = validateSchema(schemaStr);
    if (err) { setSchemaError(err); return; }

    setSaving(true);
    try {
      await onSave({ ...form, output_schema: JSON.parse(schemaStr) });
      onClose();
    } catch (e) {
      setSchemaError(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div className="modal-title">{prompt ? 'Edit Prompt' : 'New Prompt'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Daily Momentum Check"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What does this prompt do?"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Prompt Text *</label>
            <textarea
              className="form-textarea"
              value={form.prompt_text}
              onChange={e => setForm(f => ({ ...f, prompt_text: e.target.value }))}
              placeholder="Describe what Claude should analyze and how. The stock data will be automatically included."
              rows={5}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Output Schema (JSON Schema) *</label>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
              Define the structured output fields. Claude will return JSON matching this schema for every stock.
            </div>
            <textarea
              className="form-textarea mono"
              value={schemaStr}
              onChange={e => {
                setForm(f => ({ ...f, output_schema: e.target.value }));
                setSchemaError(validateSchema(e.target.value));
              }}
              rows={16}
              spellCheck={false}
            />
            {schemaError && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {schemaError}</div>
            )}
          </div>

          <div style={{ background: 'var(--bg)', borderRadius: 6, padding: 12, fontSize: 12, color: 'var(--text2)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Schema tips:</div>
            <div>• Use <code style={{ color: 'var(--accent)' }}>enum</code> for categorical values (BUY/SELL/HOLD)</div>
            <div>• Use <code style={{ color: 'var(--accent)' }}>number</code> for scores (0-100 scales)</div>
            <div>• Use <code style={{ color: 'var(--accent)' }}>string</code> with description for free-text insights</div>
            <div>• All fields in <code style={{ color: 'var(--accent)' }}>required</code> will always be present</div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.prompt_text.trim() || !!schemaError}
          >
            {saving ? <><span className="spinner" /> Saving…</> : (prompt ? 'Save Changes' : 'Create Prompt')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SchemaPreview({ schema }) {
  const props = typeof schema === 'object' ? schema?.properties : {};
  if (!props) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {Object.entries(props).map(([k, v]) => (
        <span key={k} className="badge badge-blue" style={{ fontSize: 10 }}>
          {k}
          {v.type === 'number' ? ' #' : v.enum ? ' ◈' : ' T'}
        </span>
      ))}
    </div>
  );
}

export default function Prompts({ prompts, onPromptsChange, showNotification }) {
  const [showModal, setShowModal] = useState(false);
  const [editPrompt, setEditPrompt] = useState(null);

  const handleSave = async (data) => {
    if (data.id) {
      await api(`/prompts/${data.id}`, { method: 'PUT', body: data });
      showNotification('Prompt updated');
    } else {
      await api('/prompts', { method: 'POST', body: data });
      showNotification('Prompt created');
    }
    onPromptsChange();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this prompt? Historical results will be kept.')) return;
    await api(`/prompts/${id}`, { method: 'DELETE' });
    onPromptsChange();
    showNotification('Prompt deleted');
  };

  const toggleActive = async (prompt) => {
    await api(`/prompts/${prompt.id}`, {
      method: 'PUT',
      body: { ...prompt, output_schema: prompt.output_schema, active: prompt.active ? 0 : 1 }
    });
    onPromptsChange();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Prompts</h1>
        <p className="subtitle">Define what AI analysis to run on your stocks. Each prompt runs on every tracked stock.</p>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={() => { setEditPrompt(null); setShowModal(true); }}>
            + New Prompt
          </button>
        </div>

        {prompts.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">◉</div>
              <div className="empty-title">No prompts yet</div>
              <div className="empty-desc">Create prompts to define what AI analysis should be performed on your stocks.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {prompts.map(p => (
              <div key={p.id} className="card" style={{ opacity: p.active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                      <span className={`badge ${p.active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                        {p.active ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{p.description}</div>
                    )}
                    <div style={{
                      fontSize: 12, color: 'var(--text3)', background: 'var(--bg)',
                      padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)',
                      fontFamily: 'var(--mono)', lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                    }}>
                      {p.prompt_text}
                    </div>
                    <SchemaPreview schema={p.output_schema} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-xs" onClick={() => toggleActive(p)}>
                      {p.active ? '⏸ Pause' : '▶ Enable'}
                    </button>
                    <button className="btn btn-xs" onClick={() => { setEditPrompt(p); setShowModal(true); }}>
                      ✎ Edit
                    </button>
                    <button className="btn btn-xs btn-danger" onClick={() => handleDelete(p.id)}>
                      × Delete
                    </button>
                  </div>
                </div>

                {/* Output schema fields preview */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Output Fields
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {p.output_schema?.properties && Object.entries(p.output_schema.properties).map(([k, v]) => (
                      <div key={k} style={{
                        background: 'var(--bg3)', border: '1px solid var(--border2)',
                        borderRadius: 4, padding: '3px 8px', fontSize: 12
                      }}>
                        <span style={{ color: 'var(--accent2)', fontFamily: 'var(--mono)' }}>{k}</span>
                        <span style={{ color: 'var(--text3)', marginLeft: 4 }}>
                          {v.enum ? v.enum.slice(0, 3).join('|') + (v.enum.length > 3 ? '…' : '') : v.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <PromptModal
          prompt={editPrompt}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditPrompt(null); }}
        />
      )}
    </div>
  );
}
