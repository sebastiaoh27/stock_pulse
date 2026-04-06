import React, { useState } from 'react';
import { api } from '../App';
import { useSettings } from '../App';

function SchemaPreview({ schema }) {
  const props = schema?.properties || {};
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
      {Object.entries(props).map(([k, v]) => (
        <span key={k} style={{
          padding: '2px 7px', border: '1px solid var(--border2)', borderRadius: 4,
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)'
        }}>
          <span style={{ color: 'var(--blue)' }}>{k}</span>
          <span style={{ color: 'var(--text3)', marginLeft: 4 }}>
            {v.enum ? v.enum.slice(0, 2).join('|') + (v.enum.length > 2 ? '…' : '') : v.type}
          </span>
        </span>
      ))}
    </div>
  );
}

function AdoptModal({ suggestion, prompts, onConfirm, onClose }) {
  const [action, setAction] = useState('create');
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  // Find matching existing prompt by target_prompt name
  const matchingPrompt = prompts.find(p =>
    p.name.toLowerCase() === (suggestion.target_prompt || '').toLowerCase()
  );

  const handleSave = async () => {
    setSaving(true);
    await onConfirm(suggestion, action, action === 'update' ? parseInt(targetId) : null);
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-hdr">
          <div className="modal-title">Adopt: {suggestion.name}</div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            {suggestion.description}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="form-label">Action</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`btn ${action === 'create' ? 'btn-primary' : ''}`}
                style={{ flex: 1 }}
                onClick={() => setAction('create')}
              >
                + Create New Prompt
              </button>
              <button
                className={`btn ${action === 'update' ? 'btn-primary' : ''}`}
                style={{ flex: 1 }}
                onClick={() => { setAction('update'); if (matchingPrompt) setTargetId(String(matchingPrompt.id)); }}
              >
                ↑ Update Existing
              </button>
            </div>
          </div>

          {action === 'update' && (
            <div className="form-row">
              <label className="form-label">Prompt to Replace</label>
              <select
                className="form-select"
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
              >
                <option value="">— Select a prompt —</option>
                {prompts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <div className="form-label">Output Fields</div>
            <SchemaPreview schema={suggestion.output_schema} />
          </div>

          <div style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 12px', fontSize: 11, color: 'var(--text3)',
            fontFamily: 'var(--mono)', lineHeight: 1.7,
            maxHeight: 100, overflow: 'auto'
          }}>
            {suggestion.prompt_text}
          </div>

          {action === 'update' && (
            <div style={{
              background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)',
              borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--amber)'
            }}>
              ⚠ This will overwrite the selected prompt's text and output schema. Historical results are preserved.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || (action === 'update' && !targetId)}
          >
            {saving
              ? <><span className="spinner" /> Saving…</>
              : action === 'create' ? '+ Add Prompt' : '↑ Update Prompt'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({ s, onAdopt }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = s.type === 'improve' ? 'var(--amber)' : 'var(--green)';
  const typeBg = s.type === 'improve' ? 'rgba(245,166,35,0.10)' : 'rgba(0,200,150,0.10)';

  return (
    <div className="suggestion-card">
      <div className="suggestion-card-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</span>
            <span style={{
              padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
              fontFamily: 'var(--mono)', background: typeBg, color: typeColor, textTransform: 'uppercase'
            }}>
              {s.type === 'improve' && s.target_prompt ? `↑ Improve: ${s.target_prompt}` : '✦ New prompt'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>{s.description}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>{s.rationale}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <button className="btn btn-xs" onClick={() => setExpanded(e => !e)}>
            {expanded ? '▲' : '▼'} {expanded ? 'Less' : 'More'}
          </button>
          <button className="btn btn-xs btn-primary" onClick={() => onAdopt(s)}>
            + Adopt
          </button>
        </div>
      </div>

      <div className="suggestion-card-body">
        <div className="pro-con">
          <div className="pros">
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Strengths</div>
            {(s.pros || []).map((p, i) => <div key={i} className="pro-item">{p}</div>)}
          </div>
          <div className="cons">
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Limitations</div>
            {(s.cons || []).map((c, i) => <div key={i} className="con-item">{c}</div>)}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{
          padding: '14px 18px', borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 12
        }}>
          <div>
            <div className="form-label" style={{ marginBottom: 6 }}>Prompt text</div>
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 12px', fontSize: 12, color: 'var(--text2)',
              lineHeight: 1.7, fontFamily: 'var(--mono)'
            }}>
              {s.prompt_text}
            </div>
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 6 }}>Output fields</div>
            <SchemaPreview schema={s.output_schema} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Suggestions({ prompts, onPromptsChange, showNotification }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cost, setCost] = useState(null);
  const [adoptTarget, setAdoptTarget] = useState(null);
  const { model } = useSettings();

  const generate = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const result = await api('/suggestions', { method: 'POST', body: { model } });
      setSuggestions(result.suggestions || []);
      setCost(result.cost);
      if (!result.suggestions?.length) {
        showNotification('No suggestions generated — add more stocks and run analyses first', 'info');
      }
    } catch (e) {
      showNotification(e.message, 'error');
    }
    setLoading(false);
  };

  const handleAdoptConfirm = async (suggestion, action, targetId) => {
    try {
      const result = await api('/suggestions/adopt', {
        method: 'POST',
        body: {
          suggestion,
          action,
          target_prompt_id: targetId,
        },
      });
      onPromptsChange();
      const msg = result.action === 'updated'
        ? `Prompt "${result.prompt.name}" updated`
        : `Prompt "${result.prompt.name}" added`;
      showNotification(msg);
      setAdoptTarget(null);
    } catch (e) {
      showNotification(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>AI Advisor</h1>
        <p className="sub">Let Claude analyze your prompts and suggest improvements or new ideas</p>
      </div>

      <div className="page-body">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Generate Suggestions</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                Claude will review your {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} and
                recent analysis results, then suggest improvements and new analysis angles.
                Adopted suggestions can create new prompts or replace existing ones.
              </div>
              {cost != null && (
                <div style={{ marginTop: 10 }}>
                  <span className="cost-chip">💰 Last generation: ${cost.toFixed(5)}</span>
                </div>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={generate}
              disabled={loading}
              style={{ padding: '10px 18px', flexShrink: 0 }}
            >
              {loading ? <><span className="spinner" />Analyzing…</> : '✦ Generate Suggestions'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="card">
            <div className="empty" style={{ padding: 40 }}>
              <span className="spinner" style={{ width: 28, height: 28, borderTopColor: 'var(--green)', borderColor: 'var(--bg4)' }} />
              <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 8 }}>
                Claude is reviewing your prompts and history…
              </div>
            </div>
          </div>
        )}

        {!suggestions.length && !loading && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon" style={{ fontSize: 36 }}>✦</div>
              <div className="empty-title">No suggestions yet</div>
              <div className="empty-desc">
                Click Generate Suggestions to have Claude analyze your prompts.
                Works best when you have some run history.
              </div>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{suggestions.length} suggestions</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                Click "+ Adopt" to add or update a prompt
              </span>
            </div>
            {suggestions.map((s, i) => (
              <SuggestionCard
                key={i}
                s={s}
                onAdopt={(s) => setAdoptTarget(s)}
              />
            ))}
          </div>
        )}
      </div>

      {adoptTarget && (
        <AdoptModal
          suggestion={adoptTarget}
          prompts={prompts}
          onConfirm={handleAdoptConfirm}
          onClose={() => setAdoptTarget(null)}
        />
      )}
    </div>
  );
}
