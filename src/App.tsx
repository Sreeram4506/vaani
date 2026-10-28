import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowSquareOut, CaretDown, ChartLineUp, CheckCircle,
  ClockCountdown, DotsThree, Files, GearSix, Headphones, House, Pause, Phone,
  Play, UsersThree, WarningCircle, X, Buildings, CurrencyDollar
} from '@phosphor-icons/react'
import { ProductView } from './ProductView'
import { WebCallModal } from './WebCallModal'
import { PlatformView } from './PlatformView'

type Icon = typeof House

const platformNav: { label: string; icon: Icon }[] = [
  { label: 'Overview', icon: House },
  { label: 'Clients', icon: Buildings },
  { label: 'Usage', icon: ChartLineUp },
  { label: 'Platform Settings', icon: GearSix },
]

const clientNav: { label: string; icon: Icon }[] = [
  { label: 'Overview', icon: House },
  { label: 'Contacts', icon: UsersThree },
  { label: 'Agents', icon: Headphones },
  { label: 'Campaigns', icon: Phone },
  { label: 'Call logs', icon: Files },
  { label: 'Analytics', icon: ChartLineUp },
]

type Dashboard = {
  businessName?: string
  campaign: {
    name: string; contacted: number; total: number; maxConcurrent: number
    windowStart: string; windowEnd: string; status: string
  }
  metrics: { queued: number; inProgress: number; connected: number; leads: number }
  recentCalls: Array<{ id: string; contact: string; phone: string; duration: string; outcome: string }>
}

type OrgInfo = { id: string; name: string; initials: string; industry: string; plan: string; color: string }

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark"><span /><span /><span /></div>
      <span>Vaani</span>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<'platform' | 'client'>('platform')
  const [active, setActive] = useState('Overview')
  const [orgId, setOrgId] = useState('')
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)

  const [running, setRunning] = useState(true)
  const [contacted, setContacted] = useState(248)
  const [testMode, setTestMode] = useState(true)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [showStart, setShowStart] = useState(false)
  const [webCallOpen, setWebCallOpen] = useState(false)
  const [targetAgentId, setTargetAgentId] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const previewTimeout = useRef<number | undefined>(undefined)

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3500)
  }

  const enterOrg = (id: string) => {
    setOrgId(id)
    setMode('client')
    setActive('Overview')
    setDashboard(null)
    fetch(`/api/platform/organizations/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { organization: OrgInfo }) => setOrgInfo(data.organization))
      .catch(() => setOrgInfo({ id, name: id, initials: '??', industry: '', plan: '', color: '#4659b8' }))
  }

  const exitOrg = () => {
    setMode('platform')
    setActive('Overview')
    setOrgId('')
    setOrgInfo(null)
    setDashboard(null)
  }

  const apiBase = `/api/org/${orgId}`

  const refreshDashboard = () => {
    if (!orgId) return
    fetch(`${apiBase}/dashboard`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setRunning(data.campaign.status === 'running')
        setContacted(data.campaign.contacted)
        setTestMode(data.testMode)
        setDashboard(data)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    if (mode === 'client' && orgId) refreshDashboard()
  }, [mode, orgId])

  const primaryAction = async () => {
    if (running) {
      const result = await fetch(`${apiBase}/campaigns/demo/pause`, { method: 'POST' }).catch(() => null)
      if (!result?.ok) return notify('Could not pause the campaign.')
      setRunning(false)
      setDashboard(c => c ? { ...c, campaign: { ...c.campaign, status: 'paused' }, metrics: { ...c.metrics, inProgress: 0 } } : c)
      notify('Campaign paused.')
    } else {
      setShowStart(true)
    }
  }

  const startCampaign = async () => {
    const result = await fetch(`${apiBase}/campaigns/demo/start`, { method: 'POST' }).catch(() => null)
    if (!result?.ok) return notify('Could not start the campaign.')
    setRunning(true)
    setDashboard(c => c ? { ...c, campaign: { ...c.campaign, status: 'running' }, metrics: { ...c.metrics, inProgress: 8 } } : c)
    setShowStart(false)
    notify('Campaign started.')
  }

  const previewGreeting = () => {
    if (!('speechSynthesis' in window)) return notify('Voice preview not supported.')
    window.speechSynthesis.cancel()
    if (previewTimeout.current) window.clearTimeout(previewTimeout.current)
    const msg = new SpeechSynthesisUtterance('Hi there! Welcome to Vaani Voice AI platform. We help businesses engage customers through intelligent voice automation.')
    msg.lang = 'en-IN'; msg.rate = 0.96
    msg.onend = () => setPreviewPlaying(false)
    msg.onerror = () => { setPreviewPlaying(false); notify('Voice preview could not play.') }
    setPreviewPlaying(true)
    window.speechSynthesis.speak(msg)
    previewTimeout.current = window.setTimeout(() => setPreviewPlaying(false), 14000)
  }

  const launchWebCall = (agentId?: string) => { setTargetAgentId(agentId); setWebCallOpen(true) }

  const campaign = dashboard?.campaign
  const metrics = dashboard ? [
    { label: 'Contacts queued', value: String(dashboard.metrics.queued), note: `of ${campaign?.total ?? 0} total`, tone: 'blue' },
    { label: 'Calls in progress', value: String(dashboard.metrics.inProgress).padStart(2, '0'), note: `of ${campaign?.maxConcurrent ?? 0} lines`, tone: 'violet' },
    { label: 'Connected today', value: String(dashboard.metrics.connected), note: 'connect rate', tone: 'gold' },
    { label: 'Qualified leads', value: String(dashboard.metrics.leads), note: 'from calls', tone: 'mint' },
  ] : []

  // ── Platform mode ────────────────────────────────────
  if (mode === 'platform') {
    return (
      <main className="app-shell">
        <aside className="sidebar">
          <Logo />
          <div className="workspace-picker">
            <div className="workspace-icon" style={{ background: '#c8d1ff', color: '#2a3580' }}>V</div>
            <div>
              <strong>Vaani</strong>
              <small>Voice AI Platform</small>
            </div>
            <CaretDown size={16} />
          </div>
          <nav>
            <p className="nav-label">Platform</p>
            {platformNav.map(({ label, icon: NavIcon }) => (
              <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(label)}>
                <NavIcon size={19} weight="duotone" />
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="profile">
              <div className="avatar" style={{ background: '#c8d1ff', color: '#2a3580' }}>VA</div>
              <div>
                <strong>Platform Admin</strong>
                <small>Vaani Voice AI</small>
              </div>
              <DotsThree size={20} />
            </div>
          </div>
        </aside>
        <section className="content">
          <header className="topbar">
            <div className="breadcrumb">
              <span>Vaani</span>
              <ArrowRight size={14} />
              <b>{active}</b>
            </div>
            <div className="top-actions">
              <button className="avatar top-avatar" style={{ background: '#c8d1ff', color: '#2a3580' }}>VA</button>
            </div>
          </header>
          <div className="page">
            <PlatformView active={active} notify={notify} onSelectOrg={enterOrg} />
          </div>
        </section>
        {toast && <div className="toast"><CheckCircle size={18} weight="fill" />{toast}</div>}
      </main>
    )
  }

  // ── Client workspace mode ────────────────────────────
  const oi = orgInfo
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Logo />
        <button className="back-to-platform" onClick={exitOrg}>
          <ArrowLeft size={15} /> Back to Platform
        </button>
        <div className="workspace-picker">
          <div className="workspace-icon" style={{ background: (oi?.color ?? '#4659b8') + '33', color: oi?.color ?? '#4659b8' }}>
            {oi?.initials ?? '??'}
          </div>
          <div>
            <strong>{oi?.name ?? 'Loading...'}</strong>
            <small>{oi?.industry ?? ''} · {oi?.plan ?? ''}</small>
          </div>
          <CaretDown size={16} />
        </div>
        <nav>
          <p className="nav-label">Workspace</p>
          {clientNav.map(({ label, icon: NavIcon }) => (
            <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(label)}>
              <NavIcon size={19} weight="duotone" />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className={active === 'Settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('Settings')}>
            <GearSix size={19} weight="duotone" />
            Settings
          </button>
          <div className="profile">
            <div className="avatar" style={{ background: (oi?.color ?? '#4659b8') + '33', color: oi?.color ?? '#4659b8' }}>
              {oi?.initials ?? '??'}
            </div>
            <div>
              <strong>{oi?.name ?? ''}</strong>
              <small>{oi?.plan ?? ''} plan</small>
            </div>
            <DotsThree size={20} />
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="breadcrumb-link" onClick={exitOrg}>Vaani</button>
            <ArrowRight size={14} />
            <span>{oi?.name ?? ''}</span>
            <ArrowRight size={14} />
            <b>{active}</b>
          </div>
          <div className="top-actions">
            <button className="webcall-btn" onClick={() => launchWebCall()} title="Voice call with AI agents">
              <Phone size={15} weight="fill" />
              <span className="btn-pulse" />
              <span>Web Call</span>
            </button>
            <button className="avatar top-avatar" style={{ background: (oi?.color ?? '#4659b8') + '33', color: oi?.color ?? '#4659b8' }}>
              {oi?.initials ?? '??'}
            </button>
          </div>
        </header>

        <div className="page">
          {active !== 'Overview' ? (
            <ProductView active={active} notify={notify} openWebCall={launchWebCall} orgId={orgId} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{oi?.name ?? ''} Control Room</p>
                  <h1>Welcome back.</h1>
                  <p className="intro">
                    Voice AI agents are engaging prospects and qualifying leads for {oi?.name ?? 'this organization'}.
                  </p>
                  {testMode && (
                    <p className="test-notice">
                      <WarningCircle size={14} weight="fill" /> Test mode — simulated telephony. Use Web Call for live voice AI.
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="secondary-button" onClick={() => launchWebCall()}>
                    <Phone size={16} weight="fill" /> Test Web Call
                  </button>
                  <button className="primary-button" onClick={primaryAction}>
                    {running ? (<><Pause size={18} weight="fill" /> Pause campaign</>) : (<><Play size={18} weight="fill" /> Resume campaign</>)}
                  </button>
                </div>
              </div>

              <section className="campaign-strip">
                <div className="campaign-main">
                  <div className="pulse-wrap">
                    <span className={running ? 'pulse active' : 'pulse'} />
                    <Phone size={20} weight="fill" />
                  </div>
                  <div>
                    <div className="strip-title">
                      {campaign?.name ?? 'Campaign'}{' '}
                      <span className={running ? 'status live' : 'status paused'}>{running ? 'Live' : 'Paused'}</span>
                    </div>
                    <p>{campaign?.maxConcurrent ?? 10} concurrent calls · {campaign?.windowStart ?? '10:00'}–{campaign?.windowEnd ?? '19:00'} IST</p>
                  </div>
                </div>
                <div className="campaign-progress">
                  <div><strong>{contacted}</strong><span> / {campaign?.total ?? 1000} contacted</span></div>
                  <div className="progress-track">
                    <span style={{ width: `${campaign ? (contacted / campaign.total) * 100 : 25}%` }} />
                  </div>
                </div>
                <button className="more-button" aria-label="Campaign options" onClick={() => setActive('Campaigns')}>
                  <DotsThree size={23} />
                </button>
              </section>

              <section className="metrics">
                {metrics.map(m => (
                  <article className="metric" key={m.label}>
                    <div className={`metric-orb ${m.tone}`}><span /></div>
                    <p>{m.label}</p>
                    <div className="metric-value">{m.value}</div>
                    <small>{m.note}</small>
                  </article>
                ))}
              </section>

              <section className="dashboard-grid">
                <article className="panel live-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker"><span className="live-dot" /> Live now</p>
                      <h2>Calls in progress</h2>
                    </div>
                    <button className="text-button" onClick={() => setActive('Call logs')}>View all <ArrowRight size={15} /></button>
                  </div>
                  <div className="live-call">
                    <div className="contact-avatar purple">C</div>
                    <div className="call-details">
                      <strong>Active Call</strong>
                      <span>In progress</span>
                      <div className="waveform" aria-label="Call audio waveform">
                        {[6, 13, 9, 19, 11, 15, 7, 16, 21, 8, 13, 17, 9, 14, 6, 19, 10, 15, 7, 12, 18, 9, 16, 6].map((h, i) => (
                          <i key={i} style={{ height: h }} />
                        ))}
                      </div>
                    </div>
                    <div className="duration"><ClockCountdown size={17} /><span>01:32</span></div>
                  </div>
                  <div className="mini-calls">
                    <span><i className="dot amber" /> {dashboard?.metrics.inProgress ?? 0} calls in progress</span>
                    <button onClick={() => setActive('Call logs')}>Open monitor <ArrowRight size={14} /></button>
                  </div>
                </article>

                <article className="panel readiness">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Voice agents</p>
                      <h2>Agents ready</h2>
                    </div>
                    <button className="edit-button" onClick={() => setActive('Agents')}>View all</button>
                  </div>
                  <button
                    className="webcall-btn"
                    style={{ margin: '0 22px 10px', width: 'calc(100% - 44px)', justifyContent: 'center' }}
                    onClick={() => launchWebCall()}
                  >
                    <Phone size={16} weight="fill" />
                    <span>Start Web Voice Call</span>
                  </button>
                  <button className={previewPlaying ? 'voice-preview playing' : 'voice-preview'} onClick={previewGreeting}>
                    {previewPlaying ? (<><span className="voice-bars"><i /><i /><i /></span> Playing preview</>) : (<><Play size={14} weight="fill" /> Hear greeting</>)}
                  </button>
                  <div className="readiness-list">
                    <div><CheckCircle size={18} weight="fill" /><span>AI voice agents configured</span></div>
                    <div><CheckCircle size={18} weight="fill" /><span>AI disclosure enabled</span></div>
                    <div><CheckCircle size={18} weight="fill" /><span>DND compliance active</span></div>
                  </div>
                </article>
              </section>

              <section className="panel recent">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Activity</p>
                    <h2>Recent completed calls</h2>
                  </div>
                  <button className="text-button" onClick={() => setActive('Call logs')}>Call logs <ArrowRight size={15} /></button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Contact</th><th>Phone</th><th>Duration</th><th>Outcome</th><th aria-label="actions" /></tr></thead>
                    <tbody>
                      {dashboard?.recentCalls.map(call => {
                        const tone = call.outcome === 'interested' ? 'hot' : call.outcome === 'callback_requested' ? 'warm' : 'muted'
                        return (
                          <tr key={call.id}>
                            <td>
                              <div className="person">
                                <div className="contact-avatar small">
                                  {call.contact.replace(/\(.*?\)/, '').trim().split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <div><strong>{call.contact}</strong><span>Completed call</span></div>
                              </div>
                            </td>
                            <td>{call.phone}</td>
                            <td>{call.duration}</td>
                            <td><span className={`outcome ${tone}`}>{call.outcome.replace('_', ' ')}</span></td>
                            <td><button className="row-button" onClick={() => setActive('Call logs')}>View</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </section>

      {showStart && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <button className="modal-close" onClick={() => setShowStart(false)} aria-label="Close"><X size={20} /></button>
            <div className="modal-icon"><Play weight="fill" size={23} /></div>
            <p className="eyebrow">Ready to place calls</p>
            <h2>Start outreach campaign?</h2>
            <p>Queued contacts will be engaged between {campaign?.windowStart ?? '10:00'} and {campaign?.windowEnd ?? '19:00'} IST.</p>
            <div className="check-row"><CheckCircle size={18} weight="fill" /> DND and consent checks run before every call.</div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowStart(false)}>Not yet</button>
              <button className="primary-button" onClick={startCampaign}><Play size={17} weight="fill" /> Start campaign</button>
            </div>
          </div>
        </div>
      )}

      {webCallOpen && (
        <WebCallModal
          close={() => setWebCallOpen(false)}
          notify={notify}
          onCallSaved={refreshDashboard}
          initialAgentId={targetAgentId}
          orgId={orgId}
        />
      )}
      {toast && <div className="toast"><CheckCircle size={18} weight="fill" />{toast}</div>}
    </main>
  )
}
