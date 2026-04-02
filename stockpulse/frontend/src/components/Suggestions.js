import React, { useState } from 'react';
import { api } from '../App';
import { useSettings } from '../App';

function SuggestionCard({ s, onAdopt, adopting }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = s.type === 'improve' ? 'var(--amber)' : 'var(--green)';
  const typeBg    = s.type === 'improve' ? 'rgba(245,166,35,0.10)' : 'rgba(0,200,150,0.10)';

  return (
    <div className="suggestion-card">
      <div className="suggestion-card-header">
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:15, fontWeight:600 }}>{s.name}</span>
            <span style={{ padding:'2px 8px', borderRadius:5, fontSize:10, fontWeight:600, fontFamily:'var(--mono)', background:typeBg, color:typeColor, textTransform:'uppercase' }}>
              {s.type === 'improve' ? `↑ Improve: ${s.target_prompt}` : '✦ New prompt'}
            </span>
          </div>
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:10 }}>{s.description}</div>
          <div style={{ fontSize:12.5, color:'var(--text3)', lineHeight:1.6 }}>{s.rationale}</div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button className="btn btn-xs" onClick={() => setExpanded(e => !e)}>{expanded ? '▲ Less' : '▼ More'}</button>
          <button className="btn btn-xs btn-primary" onClick={() => onAdopt(s)} disabled={adopting}>
            {adopting ? <span className="spinner" style={{width:10,height:10,borderTopColor:'var(--green)',borderColor:'var(--bg4)'}} /> : '+ Adopt'}
          </button>
        </div>
      </div>

      {/* Pros / Cons always visible */}
      <div className="suggestion-card-body">
        <div className="pro-con">
          <div className="pros">
            <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Strengths</div>
            {(s.pros || []).map((p, i) => <div key={i} className="pro-item">{p}</div>)}
          </div>
          <div className="cons">
            <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Limitations</div>
            {(s.cons || []).map((c, i) => <div key={i} className="con-item">{c}</div>)}
          </div>
        </div>
      </div>

      {/* Expanded: schema + prompt text */}
      {expanded && (
        <div style={{ padding:'0 18px 16px', borderTop:'1px solid var(--border)', marginTop:0, paddingTop:14 }}>
          <div className="grid-2" style={{ gap:12 }}>
            <div>
              <div className="form-label" style={{ marginBottom:6 }}>Prompt text</div>
              <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', fontSize:12, color:'var(--text2)', lineHeight:1.7, fontFamily:'var(--mono)' }}>
                {s.prompt_text}
              </div>
            </div>
            <div>
              <div className="form-label" style={{ marginBottom:6 }}>Output fields</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {Object.entries(s.output_schema?.properties || {}).map(([k, v]) => (
                  <span key={k} style={{ padding:'2px 7px', border:'1px solid var(--border2)', borderRadius:4, fontSize:11, fontFamily:'var(--mono)', color:'var(--text2)' }}>
                    <span style={{ color:'var(--blue)' }}>{k}</span>
                    <span style={{ color:'var(--text3)', marginLeft:4 }}>{v.enum ? v.enum.slice(0,2).join('|')+'…' : v.type}</span>
                  </span>
                ))}
              </div>
            </div>
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
  const [adopting, setAdopting] = useState(null);
  const { model } = useSettings();

  const generate = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const result = await api('/suggestions', { method:'POST', body:{ model } });
      setSuggestions(result.suggestions || []);
      setCost(result.cost);
      if (!result.suggestions?.length) showNotification('No suggestions generated — try adding more stocks and running analyses first', 'info');
    } catch (e) {
      showNotification(e.message, 'error');
    }
    setLoading(false);
  };

  const adopt = async (s) => {
    setAdopting(s.name);
    try {
      await api('/prompts', {
        method: 'POST',
        body: {
          name: s.name,
          description: s.description,
          prompt_text: s.prompt_text,
          output_schema: s.output_schema,
        },
      });
      onPromptsChange();
      showNotification(`Prompt "${s.name}" added to your collection`);
    } catch (e) {
      showNotification(e.message, 'error');
    }
    setAdopting(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>AI Advisor</h1>
        <p className="sub">Let Claude analyze your current prompts and suggest improvements or new ideas</p>
      </div>

      <div className="page-body">
        <div className="card">
          <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontWeight:600, marginBottom:4 }}>Generate Suggestions</div>
              <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
                Claude will review your current {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} and recent analysis results, then suggest ways to improve them or propose entirely new analysis angles.
              </div>
              {cost != null && (
                <div style={{ marginTop:10 }}>
                  <span className="cost-chip">💰 Last generation: ${cost.toFixed(5)}</span>
                </div>
              )}
            </div>
            <div style={{ flexShrink:0 }}>
              <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ padding:'10px 18px' }}>
                {loading ? <><span className="spinner" />Analyzing…</> : '✦ Generate Suggestions'}
              </button>
            </div>
          </div>
        </div>

        {!suggestions.length && !loading && (
          <div className="card">
            <div className="empty">
              <div className="empty-icon" style={{ fontSize:36 }}>✦</div>
              <div className="empty-title">No suggestions yet</div>
              <div className="empty-desc">
                Click Generate Suggestions to have Claude analyze your prompts and suggest improvements.
                Works best when you have some run history so Claude can evaluate output quality.
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="card">
            <div className="empty" style={{ padding:40 }}>
              <span className="spinner" style={{ width:28, height:28, borderTopColor:'var(--green)', borderColor:'var(--bg4)' }} />
              <div style={{ color:'var(--text2)', fontSize:13, marginTop:8 }}>Claude is reviewing your prompts and history…</div>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:14, fontWeight:500 }}>{suggestions.length} suggestions</span>
              <span style={{ fontSize:12, color:'var(--text3)' }}>Click "+ Adopt" to add any suggestion as a new prompt</span>
            </div>
            {suggestions.map((s, i) => (
              <SuggestionCard key={i} s={s} onAdopt={adopt} adopting={adopting === s.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
