import Plot from 'react-plotly.js'
const Q_COLORS = { Q1:'#10B981', Q2:'#3B82F6', Q3:'#EF4444', Q4:'#E8A020' }
const Q_NAMES  = { Q1:'Confirmed Momentum', Q2:'Sentiment Leading', Q3:'Confirmed Weakness', Q4:'Price Leading' }
const TABS = [
  { id:'all', label:'All Stocks', color:'#8A8060' },
  { id:'Q1',  label:'▲ Momentum', color:'#10B981' },
  { id:'Q2',  label:'◆ Opportunity', color:'#3B82F6' },
  { id:'Q4',  label:'▼ Caution', color:'#E8A020' },
  { id:'Q3',  label:'✕ Avoid', color:'#EF4444' },
]
import { useState } from 'react'
export default function WatchlistChart3D({ data }) {
  const [tab, setTab] = useState('all')
  if (!data?.length) return null
  const visible = tab === 'all' ? data : data.filter(r => r.quadrant === tab)
  const traces = []
  visible.forEach(s => {
    if (!s.history?.length) return
    const c = Q_COLORS[s.quadrant] || '#8A8060'
    traces.push({ type:'scatter3d', mode:'lines+markers', name:`${s.ticker} trail`, showlegend:false,
      x:s.history.map(()=>s.sentiment_score), y:s.history.map(h=>h.cumulative_price_change_pct), z:s.history.map(h=>h.relative_volume),
      marker:{size:3,color:c,opacity:.2}, line:{color:c,width:2,opacity:.25},
      hovertemplate:`${s.ticker}<br>%{y:.2f}%<br>%{z:.2f}x<extra></extra>` })
  })
  const byQ = {Q1:[],Q2:[],Q3:[],Q4:[]}
  visible.forEach(s => { if(s.quadrant) byQ[s.quadrant].push(s) })
  Object.entries(byQ).forEach(([k,stocks]) => {
    if(!stocks.length) return
    traces.push({ type:'scatter3d', mode:'markers+text', name:Q_NAMES[k],
      x:stocks.map(s=>s.sentiment_score), y:stocks.map(s=>s.price_change_7d), z:stocks.map(s=>s.relative_volume),
      marker:{size:stocks.map(s=>Math.max(10,Math.min(36,(s.relative_volume||1)*13))), color:Q_COLORS[k], opacity:.9, line:{color:'#1C1A13',width:1.5}},
      text:stocks.map(s=>s.ticker), textposition:'top center',
      textfont:{size:11, color:'#E8E0D0', family:'JetBrains Mono, monospace'},
      customdata:stocks.map(s=>`<b>${s.ticker}</b> (${s.company_name})<br>Sentiment: ${s.sentiment_score>=0?'+':''}${s.sentiment_score}<br>10d Price: ${s.price_change_7d>=0?'+':''}${s.price_change_7d}%<br>Rel. Volume: ${s.relative_volume}x<br>Signal: ${s.signal_score}/100`),
      hovertemplate:'%{customdata}<extra></extra>' })
  })
  const layout = {
    title:{text:'StockBuddy — Sentiment × Price Change × Relative Volume', font:{size:13,color:'#EDE8DC',family:'Inter'}},
    scene:{
      xaxis:{title:{text:'Sentiment Score',font:{size:11,color:'#8A8060'}},range:[-1,1],zeroline:true,zerolinecolor:'#3C3A2C',gridcolor:'#2C2A1E',backgroundcolor:'#141410'},
      yaxis:{title:{text:'Price Change 10d (%)',font:{size:11,color:'#8A8060'}},zeroline:true,zerolinecolor:'#3C3A2C',gridcolor:'#2C2A1E',backgroundcolor:'#141410'},
      zaxis:{title:{text:'Relative Volume',font:{size:11,color:'#8A8060'}},gridcolor:'#2C2A1E',backgroundcolor:'#141410'},
      bgcolor:'#141410', camera:{eye:{x:1.6,y:1.6,z:1.1}}
    },
    paper_bgcolor:'#0C0B08', plot_bgcolor:'#0C0B08',
    margin:{l:0,r:0,t:50,b:0},
    legend:{x:.01,y:.99,bgcolor:'rgba(20,20,16,.9)',bordercolor:'#2C2A1E',borderwidth:1,font:{size:11,color:'#C8C0A8'}},
    height:560,
    font:{family:'Inter, sans-serif',color:'#C8C0A8'}
  }
  const config = { displayModeBar:true, toImageButtonOptions:{format:'png',filename:'stockbuddy_analysis',height:1000,width:1600,scale:2}, responsive:true, displaylogo:false }
  const counts = {all:data.length, Q1:data.filter(r=>r.quadrant==='Q1').length, Q2:data.filter(r=>r.quadrant==='Q2').length, Q4:data.filter(r=>r.quadrant==='Q4').length, Q3:data.filter(r=>r.quadrant==='Q3').length}
  return (
    <div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} type="button" onClick={()=>setTab(t.id)}
              style={{padding:'5px 14px',borderRadius:4,border:active?`1px solid ${t.color}`:'1px solid var(--border-mid)',background:active?`${t.color}20`:'var(--surface-3)',color:active?t.color:'var(--ink-muted)',fontWeight:700,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              {t.label}
              <span style={{background:'var(--border)',borderRadius:999,padding:'1px 7px',fontSize:10,color:'var(--ink-muted)'}}>{counts[t.id]??0}</span>
            </button>
          )
        })}
      </div>
      <Plot data={traces} layout={layout} config={config} style={{width:'100%'}} useResizeHandler />
      <p style={{textAlign:'center',fontSize:11,color:'var(--ink-muted)',marginTop:6}}>Trail = 10-day history · Bubble = relative volume · 📷 download PNG from toolbar</p>
    </div>
  )
}