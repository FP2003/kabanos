import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import type { BoardState, Card, ColumnConfig, ThemeMode } from '../../src/types.js';
import './styles.css';

const api = (path: string, init?: RequestInit) => fetch(`api/v1/${path}`, init).then(async response => {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? 'Request failed');
  return value;
});

function App() {
  const [board, setBoard] = useState<BoardState>();
  const [selected, setSelected] = useState<Card>();
  const [active, setActive] = useState<Card>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const load = () => api('board').then(setBoard).catch(showError);
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!board) return; applyTheme((board.settings.theme as ThemeMode | undefined) ?? 'system', board.settings.tokenOverrides as Record<string,string> | undefined); }, [board]);
  const cardMap = useMemo(() => new Map(board?.cards.map(card => [card.id, card])), [board]);

  function showError(value: unknown) { setError(value instanceof Error ? value.message : 'Something went wrong'); window.setTimeout(() => setError(''), 5000); }
  function onDragStart(event: DragStartEvent) { setActive(cardMap.get(String(event.active.id))); }
  async function onDragEnd(event: DragEndEvent) {
    setActive(undefined); if (!board || !event.over) return;
    const card = cardMap.get(String(event.active.id)); if (!card) return;
    const overId = String(event.over.id); const overCard = cardMap.get(overId);
    const targetColumn = overCard?.columnId ?? (board.columns.some(column => column.id === overId) ? overId : undefined);
    if (!targetColumn) return;
    const targetCards = board.cards.filter(item => item.columnId === targetColumn);
    const position = overCard ? targetCards.findIndex(item => item.id === overCard.id) : targetCards.length;
    const previous = board;
    setBoard({ ...board, cards: board.cards.map(item => item.id === card.id ? { ...item, columnId: targetColumn, position } : item) });
    try { await api(`cards/${card.id}/move`, jsonRequest('PATCH', { columnId: targetColumn, position })); await load(); }
    catch (reason) { setBoard(previous); showError(reason); }
  }
  async function moveByKeyboard(card:Card,direction:-1|1){if(!board)return;const current=board.columns.findIndex(column=>column.id===card.columnId);const target=board.columns[current+direction];if(!target)return;const previous=board;setBoard({...board,cards:board.cards.map(item=>item.id===card.id?{...item,columnId:target.id,position:board.cards.filter(value=>value.columnId===target.id).length}:item)});try{await api(`cards/${card.id}/move`,jsonRequest('PATCH',{columnId:target.id,position:board.cards.filter(value=>value.columnId===target.id).length}));await load();}catch(reason){setBoard(previous);showError(reason);}}

  if (!board) return <main className="loading"><span className="spinner" /> Loading board…</main>;
  return <div className="app-shell">
    <header className="topbar">
      <div><span className="mark" aria-hidden>✓</span><strong>{board.name}</strong><span className="subtitle">Code is the backlog</span></div>
      <nav aria-label="Board actions">
        <button className="button utility" disabled={busy} onClick={async()=>{setBusy(true);try{await api('scan',jsonRequest('POST',{}));await load();}catch(reason){showError(reason);}finally{setBusy(false);}}}>{busy?'Scanning…':'Scan now'}</button>
        <button className="icon-button" aria-label="Open settings" onClick={()=>setSettingsOpen(true)}>⚙</button>
      </nav>
    </header>
    <main className="board" aria-label="Kanban board">
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {board.columns.map(column => <Column key={column.id} column={column} cards={board.cards.filter(card=>card.columnId===column.id).sort((a,b)=>a.position-b.position)} onSelect={setSelected} onMove={moveByKeyboard} />)}
        <DragOverlay>{active ? <CardView card={active} dragging /> : null}</DragOverlay>
      </DndContext>
    </main>
    {selected && <Detail card={selected} onClose={()=>setSelected(undefined)} onSaved={async()=>{await load();setSelected(undefined);}} onError={showError} />}
    {settingsOpen && <Settings board={board} onClose={()=>setSettingsOpen(false)} onSaved={async()=>{await load();setSettingsOpen(false);}} onError={showError} />}
    {error && <div role="alert" className="toast">{error}</div>}
  </div>;
}

function Column({column,cards,onSelect,onMove}:{column:BoardState['columns'][number];cards:Card[];onSelect:(card:Card)=>void;onMove:(card:Card,direction:-1|1)=>void}) {
  const {setNodeRef,isOver}=useDroppable({id:column.id});
  return <section className={`column ${isOver?'is-over':''}`} aria-labelledby={`column-${column.id}`}>
    <header><h2 id={`column-${column.id}`}>{column.name}</h2><span>{cards.length}</span></header>
    <div className="card-list" ref={setNodeRef}><SortableContext items={cards.map(card=>card.id)} strategy={rectSortingStrategy}>{cards.map(card=><SortableCard key={card.id} card={card} onSelect={onSelect} onMove={onMove}/>)}</SortableContext>{cards.length===0&&<p className="empty">Drop cards here</p>}</div>
  </section>;
}

function SortableCard({card,onSelect,onMove}:{card:Card;onSelect:(card:Card)=>void;onMove:(card:Card,direction:-1|1)=>void}) { const sortable=useSortable({id:card.id});const transform=sortable.transform?`translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0) scaleX(${sortable.transform.scaleX}) scaleY(${sortable.transform.scaleY})`:undefined;return <div ref={sortable.setNodeRef} style={{transform,transition:sortable.transition}} {...sortable.attributes} {...sortable.listeners} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" onKeyDown={event=>{if(!event.altKey)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();onMove(card,event.key==='ArrowLeft'?-1:1);}}}><CardView card={card} onSelect={onSelect}/></div>; }
function CardView({card,onSelect,dragging}:{card:Card;onSelect?:(card:Card)=>void;dragging?:boolean}) { return <article className={`card ${dragging?'dragging':''}`} onClick={()=>onSelect?.(card)}><span className="sr-only">Use Alt plus left or right arrow to move between columns.</span><div className="badges"><span className={`tag ${card.tag.toLowerCase()}`}>{card.tag}</span>{card.priority!=='normal'&&<span className="priority">{card.priority}</span>}</div><h3>{card.title}</h3><p className="source">{card.sourceFilePath}:{card.sourceLine}</p>{card.labels.length>0&&<div className="labels">{card.labels.map(label=><span key={label}>{label}</span>)}</div>}{card.assignee&&<p className="assignee">{card.assignee}</p>}</article>; }

function Detail({card,onClose,onSaved,onError}:{card:Card;onClose:()=>void;onSaved:()=>void;onError:(e:unknown)=>void}) {
  const [notes,setNotes]=useState(card.notes);const [assignee,setAssignee]=useState(card.assignee??'');const [labels,setLabels]=useState(card.labels.join(', '));const [context,setContext]=useState<{lines:string[];startLine:number}>();
  useEffect(()=>{api(`cards/${card.id}/context`).then(setContext).catch(()=>setContext(undefined));},[card.id]);
  return <div className="scrim" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="close" aria-label="Close details" onClick={onClose}>×</button><span className={`tag ${card.tag.toLowerCase()}`}>{card.tag}</span><h2 id="detail-title">{card.title}</h2><p className="source">{card.sourceFilePath}:{card.sourceLine}</p>{context&&<pre className="code">{context.lines.map((line,index)=><code key={index}><span>{context.startLine+index}</span>{line}{'\n'}</code>)}</pre>}<label>Assignee<input value={assignee} onChange={event=>setAssignee(event.target.value)} placeholder="Host user ID or name"/></label><label>Labels<input value={labels} onChange={event=>setLabels(event.target.value)} placeholder="tech-debt, backend"/></label><label>Notes<textarea value={notes} onChange={event=>setNotes(event.target.value)} rows={7} placeholder="Add context without changing source code"/></label><button className="button primary" onClick={async()=>{try{await api(`cards/${card.id}`,jsonRequest('PATCH',{notes,assignee:assignee||null,labels:labels.split(',').map(v=>v.trim()).filter(Boolean)}));await onSaved();}catch(reason){onError(reason);}}}>Save details</button></aside></div>;
}

function Settings({board,onClose,onSaved,onError}:{board:BoardState;onClose:()=>void;onSaved:()=>void;onError:(e:unknown)=>void}) {
  const existingScan=(board.settings.scan??{}) as {include?:string[];exclude?:string[]};const [theme,setTheme]=useState<ThemeMode>((board.settings.theme as ThemeMode)??'system');const [columns,setColumns]=useState<ColumnConfig[]>(board.columns.map(({position,...column})=>column));const [destination,setDestination]=useState(columns[0]?.id??'');const [include,setInclude]=useState((existingScan.include??[]).join('\n'));const [exclude,setExclude]=useState((existingScan.exclude??[]).join('\n'));
  function update(index:number,patch:Partial<ColumnConfig>){setColumns(value=>value.map((column,i)=>i===index?{...column,...patch}:column));}
  return <div className="scrim"><aside className="drawer settings" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="close" aria-label="Close settings" onClick={onClose}>×</button><p className="eyebrow">Board preferences</p><h2 id="settings-title">Settings</h2><label>Theme<select value={theme} onChange={event=>{const value=event.target.value as ThemeMode;setTheme(value);applyTheme(value);}}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><fieldset><legend>Columns</legend>{columns.map((column,index)=><div className="column-setting" key={column.id}><input aria-label={`Column ${index+1} name`} value={column.name} onChange={event=>update(index,{name:event.target.value})}/><label className="check"><input type="radio" name="completion" checked={Boolean(column.completion)} onChange={()=>setColumns(value=>value.map((item,i)=>({...item,completion:i===index})))}/> Completion</label><button className="danger" disabled={columns.length===1} onClick={()=>setColumns(value=>value.filter((_,i)=>i!==index))}>Remove</button></div>)}<button className="button utility" onClick={()=>{const id=`column-${Date.now()}`;setColumns(value=>[...value,{id,name:'New column'}]);}}>Add column</button></fieldset><label>Move cards from removed columns to<select value={destination} onChange={event=>setDestination(event.target.value)}>{columns.map(column=><option key={column.id} value={column.id}>{column.name}</option>)}</select></label><details><summary>Scan paths</summary><label>Include globs<textarea rows={4} value={include} onChange={event=>setInclude(event.target.value)}/></label><label>Exclude globs<textarea rows={4} value={exclude} onChange={event=>setExclude(event.target.value)}/></label></details><button className="button primary" onClick={async()=>{try{await api('settings',jsonRequest('PATCH',{theme,scan:{include:lines(include),exclude:lines(exclude)}}));await api('settings/columns',jsonRequest('PUT',{columns,destinationColumnId:destination}));await onSaved();}catch(reason){onError(reason);}}}>Save settings</button></aside></div>;
}

function jsonRequest(method:string,value:unknown):RequestInit{return{method,headers:{'content-type':'application/json'},body:JSON.stringify(value)};}
function lines(value:string){return value.split('\n').map(item=>item.trim()).filter(Boolean);}
function applyTheme(theme:ThemeMode,overrides:Record<string,string>={}){document.documentElement.dataset.theme=theme;localStorage.setItem('kabanos-theme',theme);const names:Record<string,string>={canvas:'--canvas',canvasSoft:'--canvas-soft',surface:'--surface',ink:'--ink',inkMuted:'--muted',hairline:'--hairline',primary:'--primary',primaryActive:'--primary-active'};for(const [key,name]of Object.entries(names))document.documentElement.style.setProperty(name,overrides[key]??'');}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
