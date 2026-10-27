import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, CaretDown, ChartLineUp, CheckCircle, ClockCountdown,
  DotsThree, Files, GearSix, Headphones, House, Pause, Phone, Play,
  UsersThree, WarningCircle, X,
} from '@phosphor-icons/react'
import { ProductView } from './ProductView'

type Icon = typeof House

const nav: { label: string; icon: Icon }[] = [
  { label: 'Overview', icon: House }, { label: 'Contacts', icon: UsersThree },
  { label: 'Agents', icon: Headphones }, { label: 'Campaigns', icon: Phone },
  { label: 'Call logs', icon: Files }, { label: 'Analytics', icon: ChartLineUp },
]

type Dashboard = { campaign: { name: string; contacted: number; total: number; maxConcurrent: number; windowStart: string; windowEnd: string; status: string }; metrics: { queued: number; inProgress: number; connected: number; leads: number }; recentCalls: Array<{ id: string; contact: string; phone: string; duration: string; outcome: string }> }

function Logo() { return <div className="brand"><div className="brand-mark"><span /><span /><span /></div><span>vaanii</span></div> }

export default function App() {
  const [active, setActive] = useState('Overview')
  const [running, setRunning] = useState(true)
  const [contacted, setContacted] = useState(218)
  const [testMode, setTestMode] = useState(true)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [showStart, setShowStart] = useState(false)
  const [toast, setToast] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const previewTimeout = useRef<number | undefined>(undefined)

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3000) }
  useEffect(() => {
    fetch('/api/dashboard').then(r => r.ok ? r.json() : Promise.reject()).then(data => {
      setRunning(data.campaign.status === 'running')
      setContacted(data.campaign.contacted)
      setTestMode(data.testMode)
      setDashboard(data)
    }).catch(() => undefined)
  }, [])
  const primaryAction = async () => {
    if (running) {
      const result = await fetch('/api/campaigns/demo/pause', { method: 'POST' }).catch(() => null)
      if (!result?.ok) return notify('Could not pause the campaign. Check the local API.')
      setRunning(false)
      setDashboard(current => current ? { ...current, campaign: { ...current.campaign, status: 'paused' }, metrics: { ...current.metrics, inProgress: 0 } } : current)
      notify('Campaign paused. No new calls will be placed.')
    }
    else setShowStart(true)
  }
  const startCampaign = async () => {
    const result = await fetch('/api/campaigns/demo/start', { method: 'POST' }).catch(() => null)
    if (!result?.ok) return notify('Could not start the campaign. Check the local API.')
    setRunning(true)
    setDashboard(current => current ? { ...current, campaign: { ...current.campaign, status: 'running' }, metrics: { ...current.metrics, inProgress: 8 } } : current)
    setShowStart(false)
    notify('Campaign started with 10 parallel call slots.')
  }
  const previewGreeting = () => {
    if (!('speechSynthesis' in window)) { notify('Voice preview is not supported in this browser.'); return }
    window.speechSynthesis.cancel()
    if (previewTimeout.current) window.clearTimeout(previewTimeout.current)
    const message = new SpeechSynthesisUtterance('నమస్కారం రవి గారు. నేను శ్రీ టెక్ నుండి AI అసిస్టెంట్ ప్రియ మాట్లాడుతున్నాను. మీకు మా free demo గురించి కొంచెం తెలుసుకోవాలనే ఆసక్తి ఉందా?')
    message.lang = 'te-IN'
    message.rate = 0.92
    message.onend = () => setPreviewPlaying(false)
    message.onerror = () => { setPreviewPlaying(false); notify('Voice preview could not play on this device.') }
    setPreviewPlaying(true)
    window.speechSynthesis.speak(message)
    previewTimeout.current = window.setTimeout(() => setPreviewPlaying(false), 18000)
  }

  const campaign = dashboard?.campaign
  const metrics = dashboard ? [
    { label: 'Contacts queued', value: String(dashboard.metrics.queued), note: `of ${campaign?.total ?? 0} total`, tone: 'blue' },
    { label: 'Calls in progress', value: String(dashboard.metrics.inProgress).padStart(2, '0'), note: `of ${campaign?.maxConcurrent ?? 0} available lines`, tone: 'violet' },
    { label: 'Connected today', value: String(dashboard.metrics.connected), note: '42.6% connect rate', tone: 'gold' },
    { label: 'Qualified leads', value: String(dashboard.metrics.leads), note: 'ready for follow-up', tone: 'mint' },
  ] : []

  return <main className="app-shell">
    <aside className="sidebar">
      <Logo />
      <div className="workspace-picker"><div className="workspace-icon">ST</div><div><strong>Sree Tech</strong><small>India · te-IN</small></div><CaretDown size={16} /></div>
      <nav>
        <p className="nav-label">Workspace</p>
        {nav.map(({ label, icon: NavIcon }) => <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(label)}><NavIcon size={19} weight="duotone" />{label}{label === 'Campaigns' && <i>1</i>}</button>)}
      </nav>
      <div className="sidebar-footer"><button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Settings')}><GearSix size={19} weight="duotone" />Settings</button><div className="profile"><div className="avatar">SK</div><div><strong>Sree K.</strong><small>Owner</small></div><DotsThree size={20}/></div></div>
    </aside>

    <section className="content">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ArrowRight size={14}/><b>{active}</b></div><div className="top-actions"><button className="icon-button" aria-label="Help" onClick={() => notify('Use Contacts to manage consent, then simulate a test call from Campaigns.')}><WarningCircle size={20}/></button><button className="avatar top-avatar">SK</button></div></header>
      <div className="page">
        {active !== 'Overview' ? <ProductView active={active} notify={notify} /> : <>
        <div className="page-heading"><div><p className="eyebrow">Campaign control room</p><h1>Good evening, Sree.</h1><p className="intro">Your Telugu voice agent is working through today’s audience.</p>{testMode && <p className="test-notice"><WarningCircle size={14} weight="fill"/> Exotel test mode — no real calls are placed.</p>}</div><button className="primary-button" onClick={primaryAction}>{running ? <><Pause size={18} weight="fill"/> Pause campaign</> : <><Play size={18} weight="fill"/> Resume campaign</>}</button></div>

        <section className="campaign-strip"><div className="campaign-main"><div className="pulse-wrap"><span className={running ? 'pulse active' : 'pulse'}></span><Phone size={20} weight="fill"/></div><div><div className="strip-title">{campaign?.name ?? 'Loading campaign…'} <span className={running ? 'status live' : 'status paused'}>{running ? 'Live' : 'Paused'}</span></div><p>Priya · Telugu · {campaign?.maxConcurrent ?? 0} concurrent calls · {campaign?.windowStart ?? '—'}–{campaign?.windowEnd ?? '—'} IST</p></div></div><div className="campaign-progress"><div><strong>{contacted}</strong><span> / {campaign?.total ?? 0} contacted</span></div><div className="progress-track"><span style={{ width: `${campaign ? (contacted / campaign.total) * 100 : 0}%` }} /></div></div><button className="more-button" aria-label="Campaign options" onClick={() => setActive('Campaigns')}><DotsThree size={23}/></button></section>

        <section className="metrics">{metrics.map(metric => <article className="metric" key={metric.label}><div className={`metric-orb ${metric.tone}`}><span /></div><p>{metric.label}</p><div className="metric-value">{metric.value}</div><small>{metric.note}</small></article>)}</section>

        <section className="dashboard-grid"><article className="panel live-panel"><div className="panel-header"><div><p className="section-kicker"><span className="live-dot"/> Live now</p><h2>Calls in progress</h2></div><button className="text-button" onClick={() => setActive('Call logs')}>View all <ArrowRight size={15}/></button></div><div className="live-call"><div className="contact-avatar purple">RK</div><div className="call-details"><strong>Ravi Kumar</strong><span>Hyderabad · +91 98480 32451</span><div className="waveform" aria-label="Call audio waveform">{[6,13,9,19,11,15,7,16,21,8,13,17,9,14,6,19,10,15,7,12,18,9,16,6].map((h, i) => <i key={i} style={{ height: h }} />)}</div></div><div className="duration"><ClockCountdown size={17}/><span>01:32</span></div></div><div className="agent-speaking"><div className="agent-initial">P</div><div><span>Priya is speaking</span><p lang="te">మీకు demo గురించి కొంచెం తెలుసుకోవాలనే ఆసక్తి ఉందా?</p></div></div><div className="mini-calls"><span><i className="dot amber"/> 7 more calls in progress</span><button onClick={() => notify('Live call monitor will open here.')}>Open monitor <ArrowRight size={14}/></button></div></article>

          <article className="panel readiness"><div className="panel-header"><div><p className="section-kicker">Voice agent</p><h2>Priya is ready</h2></div><button className="edit-button" onClick={() => setActive('Agents')}>Edit</button></div><div className="agent-card"><div className="priya-avatar"><span>ప</span></div><div><strong>Priya</strong><p>Warm · Female · Telugu</p></div><span className="voice-tag">te-IN</span></div><button className={previewPlaying ? 'voice-preview playing' : 'voice-preview'} onClick={previewGreeting}>{previewPlaying ? <><span className="voice-bars"><i/><i/><i/></span> Playing preview</> : <><Play size={14} weight="fill"/> Hear Priya’s greeting</>}</button><div className="readiness-list"><div><CheckCircle size={18} weight="fill"/><span>AI disclosure enabled</span></div><div><CheckCircle size={18} weight="fill"/><span>DND check enabled</span></div><div><CheckCircle size={18} weight="fill"/><span>300 sec call limit</span></div></div></article>
        </section>

        <section className="panel recent"><div className="panel-header"><div><p className="section-kicker">Activity</p><h2>Recent completed calls</h2></div><button className="text-button" onClick={() => setActive('Call logs')}>Call logs <ArrowRight size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>Contact</th><th>Phone</th><th>Duration</th><th>Outcome</th><th aria-label="actions"/></tr></thead><tbody>{dashboard?.recentCalls.map(call => { const tone = call.outcome === 'interested' ? 'hot' : call.outcome === 'callback_requested' ? 'warm' : 'muted'; return <tr key={call.id}><td><div className="person"><div className="contact-avatar small">{call.contact.split(' ').map(n => n[0]).join('')}</div><div><strong>{call.contact}</strong><span>Completed call</span></div></div></td><td>{call.phone}</td><td>{call.duration}</td><td><span className={`outcome ${tone}`}>{call.outcome.replace('_', ' ')}</span></td><td><button className="row-button" onClick={() => setActive('Call logs')}>View</button></td></tr> })}</tbody></table></div></section>
        </>}
      </div>
    </section>

    {showStart && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="launch-title"><button className="modal-close" onClick={() => setShowStart(false)} aria-label="Close"><X size={20}/></button><div className="modal-icon"><Play weight="fill" size={23}/></div><p className="eyebrow">Ready to place calls</p><h2 id="launch-title">Start this campaign?</h2><p>782 queued contacts will be processed between 10:00 and 19:00 IST, using up to 10 lines at once.</p><div className="check-row"><CheckCircle size={18} weight="fill"/>DND and consent checks run before every call.</div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowStart(false)}>Not yet</button><button className="primary-button" onClick={startCampaign}><Play size={17} weight="fill"/> Start campaign</button></div></div></div>}
    {toast && <div className="toast"><CheckCircle size={18} weight="fill"/>{toast}</div>}
  </main>
}
