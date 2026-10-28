import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, CaretDown, ChartLineUp, CheckCircle, ClockCountdown,
  DotsThree, Files, GearSix, Headphones, House, Pause, Phone, Play,
  UsersThree, WarningCircle, X, ArrowSquareOut
} from '@phosphor-icons/react'
import { ProductView } from './ProductView'
import { WebCallModal } from './WebCallModal'

type Icon = typeof House

const nav: { label: string; icon: Icon }[] = [
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
    name: string
    contacted: number
    total: number
    maxConcurrent: number
    windowStart: string
    windowEnd: string
    status: string
  }
  metrics: {
    queued: number
    inProgress: number
    connected: number
    leads: number
  }
  recentCalls: Array<{
    id: string
    contact: string
    phone: string
    duration: string
    outcome: string
  }>
}

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <span />
        <span />
        <span />
      </div>
      <span>ARTH</span>
    </div>
  )
}

export default function App() {
  const [active, setActive] = useState('Overview')
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

  const refreshDashboard = () => {
    fetch('/api/dashboard')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => {
        setRunning(data.campaign.status === 'running')
        setContacted(data.campaign.contacted)
        setTestMode(data.testMode)
        setDashboard(data)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    refreshDashboard()
  }, [])

  const primaryAction = async () => {
    if (running) {
      const result = await fetch('/api/campaigns/demo/pause', { method: 'POST' }).catch(() => null)
      if (!result?.ok) return notify('Could not pause the campaign. Check the local API.')
      setRunning(false)
      setDashboard(current =>
        current
          ? {
              ...current,
              campaign: { ...current.campaign, status: 'paused' },
              metrics: { ...current.metrics, inProgress: 0 }
            }
          : current
      )
      notify('Campaign paused. No new outbound calls will be placed.')
    } else {
      setShowStart(true)
    }
  }

  const startCampaign = async () => {
    const result = await fetch('/api/campaigns/demo/start', { method: 'POST' }).catch(() => null)
    if (!result?.ok) return notify('Could not start the campaign. Check the local API.')
    setRunning(true)
    setDashboard(current =>
      current
        ? {
            ...current,
            campaign: { ...current.campaign, status: 'running' },
            metrics: { ...current.metrics, inProgress: 8 }
          }
        : current
    )
    setShowStart(false)
    notify('ARTH campaign started with 10 parallel calling lines.')
  }

  const previewGreeting = () => {
    if (!('speechSynthesis' in window)) {
      notify('Voice preview is not supported in this browser.')
      return
    }
    window.speechSynthesis.cancel()
    if (previewTimeout.current) window.clearTimeout(previewTimeout.current)

    const message = new SpeechSynthesisUtterance(
      'Hi there! This is Aditi from ARTH Marketing Media. We help businesses uncover bottlenecks in their acquisition funnel and scale with Meta and Google ads. Are you looking to generate more qualified leads this quarter?'
    )
    message.lang = 'en-IN'
    message.rate = 0.96
    message.onend = () => setPreviewPlaying(false)
    message.onerror = () => {
      setPreviewPlaying(false)
      notify('Voice preview could not play on this device.')
    }
    setPreviewPlaying(true)
    window.speechSynthesis.speak(message)
    previewTimeout.current = window.setTimeout(() => setPreviewPlaying(false), 14000)
  }

  const launchWebCall = (agentId?: string) => {
    setTargetAgentId(agentId)
    setWebCallOpen(true)
  }

  const campaign = dashboard?.campaign
  const metrics = dashboard
    ? [
        { label: 'Contacts queued', value: String(dashboard.metrics.queued), note: `of ${campaign?.total ?? 0} total`, tone: 'blue' },
        { label: 'Calls in progress', value: String(dashboard.metrics.inProgress).padStart(2, '0'), note: `of ${campaign?.maxConcurrent ?? 0} active lines`, tone: 'violet' },
        { label: 'Connected today', value: String(dashboard.metrics.connected), note: '46.8% connect rate', tone: 'gold' },
        { label: 'Qualified leads', value: String(dashboard.metrics.leads), note: 'audits & strategy calls', tone: 'mint' },
      ]
    : []

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-picker">
          <div className="workspace-icon">AR</div>
          <div>
            <strong>ARTH</strong>
            <small>Marketing Media · India</small>
          </div>
          <CaretDown size={16} />
        </div>
        <nav>
          <p className="nav-label">Workspace</p>
          {nav.map(({ label, icon: NavIcon }) => (
            <button
              key={label}
              className={active === label ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(label)}
            >
              <NavIcon size={19} weight="duotone" />
              {label}
              {label === 'Campaigns' && <i>1</i>}
              {label === 'Agents' && <i>5</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a
            href="https://arth-mauve.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
            style={{ textDecoration: 'none' }}
          >
            <ArrowSquareOut size={19} weight="duotone" />
            arth-mauve.vercel.app
          </a>
          <button
            className={active === 'Settings' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActive('Settings')}
          >
            <GearSix size={19} weight="duotone" />
            Settings
          </button>
          <div className="profile">
            <div className="avatar">AM</div>
            <div>
              <strong>ARTH Team</strong>
              <small>Growth & AI Strategy</small>
            </div>
            <DotsThree size={20} />
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>ARTH</span>
            <ArrowRight size={14} />
            <b>{active}</b>
          </div>
          <div className="top-actions">
            <button
              className="webcall-btn"
              onClick={() => launchWebCall()}
              title="Interactive voice call with ARTH AI agents"
            >
              <Phone size={15} weight="fill" />
              <span className="btn-pulse" />
              <span>Web Call Agent</span>
            </button>
            <a
              href="https://arth-mauve.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="icon-button"
              title="Visit ARTH Website (arth-mauve.vercel.app)"
              style={{ display: 'grid', placeItems: 'center' }}
            >
              <ArrowSquareOut size={19} />
            </a>
            <button className="avatar top-avatar">AM</button>
          </div>
        </header>

        <div className="page">
          {active !== 'Overview' ? (
            <ProductView
              active={active}
              notify={notify}
              openWebCall={launchWebCall}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">ARTH Growth Control Room</p>
                  <h1>Welcome, Team ARTH.</h1>
                  <p className="intro">
                    5 pre-defined AI voice agents are engaging high-growth brands and qualifying acquisition bottlenecks.
                  </p>
                  {testMode && (
                    <p className="test-notice">
                      <WarningCircle size={14} weight="fill" /> Exotel test mode — simulated telephony enabled. Use Web Call for live voice AI.
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="secondary-button" onClick={() => launchWebCall()}>
                    <Phone size={16} weight="fill" /> Test Web Call
                  </button>
                  <button className="primary-button" onClick={primaryAction}>
                    {running ? (
                      <>
                        <Pause size={18} weight="fill" /> Pause campaign
                      </>
                    ) : (
                      <>
                        <Play size={18} weight="fill" /> Resume campaign
                      </>
                    )}
                  </button>
                </div>
              </div>

              <section className="campaign-strip">
                <div className="campaign-main">
                  <div className="pulse-wrap">
                    <span className={running ? 'pulse active' : 'pulse'}></span>
                    <Phone size={20} weight="fill" />
                  </div>
                  <div>
                    <div className="strip-title">
                      {campaign?.name ?? 'ARTH Q4 Brand Growth & Marketing Audit'}{' '}
                      <span className={running ? 'status live' : 'status paused'}>
                        {running ? 'Live' : 'Paused'}
                      </span>
                    </div>
                    <p>
                      Aditi & Multi-Agent Team · English & Telugu · {campaign?.maxConcurrent ?? 10} concurrent calls ·{' '}
                      {campaign?.windowStart ?? '10:00'}–{campaign?.windowEnd ?? '19:00'} IST
                    </p>
                  </div>
                </div>
                <div className="campaign-progress">
                  <div>
                    <strong>{contacted}</strong>
                    <span> / {campaign?.total ?? 1000} contacted</span>
                  </div>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${campaign ? (contacted / campaign.total) * 100 : 25}%`
                      }}
                    />
                  </div>
                </div>
                <button
                  className="more-button"
                  aria-label="Campaign options"
                  onClick={() => setActive('Campaigns')}
                >
                  <DotsThree size={23} />
                </button>
              </section>

              <section className="metrics">
                {metrics.map(metric => (
                  <article className="metric" key={metric.label}>
                    <div className={`metric-orb ${metric.tone}`}>
                      <span />
                    </div>
                    <p>{metric.label}</p>
                    <div className="metric-value">{metric.value}</div>
                    <small>{metric.note}</small>
                  </article>
                ))}
              </section>

              <section className="dashboard-grid">
                <article className="panel live-panel">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">
                        <span className="live-dot" /> Live now
                      </p>
                      <h2>Calls in progress</h2>
                    </div>
                    <button className="text-button" onClick={() => setActive('Call logs')}>
                      View all <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="live-call">
                    <div className="contact-avatar purple">FS</div>
                    <div className="call-details">
                      <strong>Rahul Sharma (Fit Secrets)</strong>
                      <span>Hyderabad · +91 98480 32451</span>
                      <div className="waveform" aria-label="Call audio waveform">
                        {[6, 13, 9, 19, 11, 15, 7, 16, 21, 8, 13, 17, 9, 14, 6, 19, 10, 15, 7, 12, 18, 9, 16, 6].map(
                          (h, i) => (
                            <i key={i} style={{ height: h }} />
                          )
                        )}
                      </div>
                    </div>
                    <div className="duration">
                      <ClockCountdown size={17} />
                      <span>01:32</span>
                    </div>
                  </div>
                  <div className="agent-speaking">
                    <div className="agent-initial">A</div>
                    <div>
                      <span>Aditi (Growth Strategist) is speaking</span>
                      <p>We can run an audit on your ad creative CTRs and set up a dedicated video shoot next week.</p>
                    </div>
                  </div>
                  <div className="mini-calls">
                    <span>
                      <i className="dot amber" /> 7 more calls in progress
                    </span>
                    <button onClick={() => notify('Live call monitor will open here.')}>
                      Open monitor <ArrowRight size={14} />
                    </button>
                  </div>
                </article>

                <article className="panel readiness">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Featured voice agent</p>
                      <h2>Aditi is ready</h2>
                    </div>
                    <button className="edit-button" onClick={() => setActive('Agents')}>
                      View all 5
                    </button>
                  </div>
                  <div className="agent-card">
                    <div className="priya-avatar">
                      <span>A</span>
                    </div>
                    <div>
                      <strong>Aditi</strong>
                      <p>Growth Strategist · en-IN · Paid Media</p>
                    </div>
                    <span className="voice-tag">Meta & Google</span>
                  </div>
                  <button
                    className="webcall-btn"
                    style={{
                      margin: '0 22px 10px',
                      width: 'calc(100% - 44px)',
                      justifyContent: 'center'
                    }}
                    onClick={() => launchWebCall('a-aditi')}
                  >
                    <Phone size={16} weight="fill" />
                    <span>Start Web Voice Call</span>
                  </button>
                  <button
                    className={previewPlaying ? 'voice-preview playing' : 'voice-preview'}
                    onClick={previewGreeting}
                  >
                    {previewPlaying ? (
                      <>
                        <span className="voice-bars">
                          <i />
                          <i />
                          <i />
                        </span>{' '}
                        Playing preview
                      </>
                    ) : (
                      <>
                        <Play size={14} weight="fill" /> Hear Aditi’s greeting
                      </>
                    )}
                  </button>
                  <div className="readiness-list">
                    <div>
                      <CheckCircle size={18} weight="fill" />
                      <span>ARTH 4-step audit knowledge loaded</span>
                    </div>
                    <div>
                      <CheckCircle size={18} weight="fill" />
                      <span>AI disclosure enabled</span>
                    </div>
                    <div>
                      <CheckCircle size={18} weight="fill" />
                      <span>WhatsApp follow-up enabled (+91 9809987999)</span>
                    </div>
                  </div>
                </article>
              </section>

              <section className="panel recent">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Activity</p>
                    <h2>Recent completed calls</h2>
                  </div>
                  <button className="text-button" onClick={() => setActive('Call logs')}>
                    Call logs <ArrowRight size={15} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contact</th>
                        <th>Phone</th>
                        <th>Duration</th>
                        <th>Outcome</th>
                        <th aria-label="actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard?.recentCalls.map(call => {
                        const tone =
                          call.outcome === 'interested'
                            ? 'hot'
                            : call.outcome === 'callback_requested'
                            ? 'warm'
                            : 'muted'
                        return (
                          <tr key={call.id}>
                            <td>
                              <div className="person">
                                <div className="contact-avatar small">
                                  {call.contact
                                    .replace(/\(.*?\)/, '')
                                    .trim()
                                    .split(' ')
                                    .map(n => n[0])
                                    .join('')
                                    .slice(0, 2)}
                                </div>
                                <div>
                                  <strong>{call.contact}</strong>
                                  <span>Completed call</span>
                                </div>
                              </div>
                            </td>
                            <td>{call.phone}</td>
                            <td>{call.duration}</td>
                            <td>
                              <span className={`outcome ${tone}`}>
                                {call.outcome.replace('_', ' ')}
                              </span>
                            </td>
                            <td>
                              <button
                                className="row-button"
                                onClick={() => setActive('Call logs')}
                              >
                                View
                              </button>
                            </td>
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
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="launch-title">
            <button
              className="modal-close"
              onClick={() => setShowStart(false)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <div className="modal-icon">
              <Play weight="fill" size={23} />
            </div>
            <p className="eyebrow">Ready to place calls</p>
            <h2 id="launch-title">Start ARTH outreach campaign?</h2>
            <p>
              752 queued contacts will be engaged for marketing audits, video reels, and web revamps between 10:00 and 19:00 IST.
            </p>
            <div className="check-row">
              <CheckCircle size={18} weight="fill" />
              DND and consent checks run before every call.
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowStart(false)}>
                Not yet
              </button>
              <button className="primary-button" onClick={startCampaign}>
                <Play size={17} weight="fill" /> Start campaign
              </button>
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
        />
      )}
      {toast && (
        <div className="toast">
          <CheckCircle size={18} weight="fill" />
          {toast}
        </div>
      )}
    </main>
  )
}
