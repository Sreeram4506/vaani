import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowSquareOut, DownloadSimple, FloppyDisk, MagnifyingGlass,
  Phone, Plus, TestTube, UserPlus, X, Envelope, WhatsappLogo
} from '@phosphor-icons/react'

type Props = { active: string; notify: (message: string) => void; openWebCall?: (agentId?: string) => void }
type Contact = { id: string; name: string; phone: string; city: string; listName: string; consent: string; dnd: string }
type Agent = { id: string; name: string; language: string; voice: string; firstMessage: string; prompt: string; maxDuration: number }
type Call = { id: string; contact: string; phone: string; startedAt: string; duration: string; status: string; outcome: string; summary: string; transcript: Array<{ role: string; text: string }> }
type Lead = { id: string; contact: string; phone: string; city: string; interest: string; callback: string; source: string }
type Campaign = { id: string; name: string; status: string; agentId: string; listName: string; contacted: number; total: number; maxConcurrent: number; windowStart: string; windowEnd: string; attempts: number }
type Settings = { businessName: string; timezone: string; publicWebhookUrl: string; dndChecksEnabled: boolean; aiDisclosureEnabled: boolean }

const get = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Request failed')
  return response.json()
}

export function ProductView({ active, notify, openWebCall }: Props) {
  if (active === 'Contacts') return <Contacts notify={notify} />
  if (active === 'Agents') return <Agents notify={notify} openWebCall={openWebCall} />
  if (active === 'Campaigns') return <Campaigns notify={notify} openWebCall={openWebCall} />
  if (active === 'Call logs') return <CallLogs notify={notify} />
  if (active === 'Settings') return <SettingsView notify={notify} />
  return <Leads notify={notify} />
}

function Title({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="product-title">
      <div>
        <p className="eyebrow">ARTH Workspace</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  )
}

function Contacts({ notify }: { notify: Props['notify'] }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', countryCode: '+91', phone: '', city: '', consent: '', dnd: 'clear' })

  const load = () =>
    get<{ contacts: Contact[] }>('/api/contacts')
      .then(r => setContacts(r.contacts))
      .catch(() => notify('Could not load contacts. Start the local API.'))

  useEffect(() => {
    void load()
  }, [])

  const shown = useMemo(
    () =>
      contacts.filter(c =>
        `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(search.toLowerCase())
      ),
    [contacts, search]
  )

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const digits = form.phone.replace(/\D/g, '')
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form,
        phone: `${form.countryCode}${digits}`,
        listName: 'High-Growth Brands & D2C'
      })
    })
    if (!response.ok) {
      notify('Add a name and a unique phone number.')
      return
    }
    setOpen(false)
    setForm({ name: '', countryCode: '+91', phone: '', city: '', consent: '', dnd: 'clear' })
    notify('Contact added to ARTH outreach list.')
    load()
  }

  return (
    <>
      <Title
        title="Contacts"
        detail="Consent-aware prospects across Fitness, Real Estate, Tech, and Local Businesses."
        action={
          <button className="primary-button" onClick={() => setOpen(true)}>
            <UserPlus size={17} /> Add contact
          </button>
        }
      />
      <section className="panel product-panel">
        <div className="toolbar">
          <div className="search">
            <MagnifyingGlass size={17} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by brand, name, or phone"
            />
          </div>
          <span>{contacts.length} contacts</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contact & Brand</th>
                <th>Phone</th>
                <th>List</th>
                <th>Consent</th>
                <th>DND</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <small className="subline">{c.city || 'No city'}</small>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.listName}</td>
                  <td>{c.consent || 'Not recorded'}</td>
                  <td>
                    <span
                      className={`outcome ${
                        c.dnd === 'clear' ? 'hot' : c.dnd === 'blocked' ? 'muted' : 'warm'
                      }`}
                    >
                      {c.dnd}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <Modal title="Add brand contact" close={() => setOpen(false)}>
          <form className="form-grid" onSubmit={save}>
            <label>
              Contact / Brand name
              <input
                required
                placeholder="e.g. Fit Secrets / John"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Country code
              <select
                value={form.countryCode}
                onChange={e => setForm({ ...form, countryCode: e.target.value })}
              >
                <option value="+91">India +91</option>
                <option value="+1">United States +1</option>
                <option value="+44">United Kingdom +44</option>
                <option value="+971">United Arab Emirates +971</option>
                <option value="+65">Singapore +65</option>
              </select>
            </label>
            <label className="wide">
              Phone number
              <input
                required
                inputMode="tel"
                placeholder="98765 43210"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              City
              <input
                placeholder="e.g. Hyderabad / Bangalore"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
              />
            </label>
            <label>
              Consent source
              <input
                required
                placeholder="Inbound audit form, 28 Oct 2026"
                value={form.consent}
                onChange={e => setForm({ ...form, consent: e.target.value })}
              />
            </label>
            <label className="wide">
              DND status
              <select
                value={form.dnd}
                onChange={e => setForm({ ...form, dnd: e.target.value })}
              >
                <option value="clear">Clear — consent and DND check confirmed</option>
                <option value="unknown">Unknown — verify before calling</option>
                <option value="blocked">Blocked — never call</option>
              </select>
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} /> Save contact
            </button>
          </form>
        </Modal>
      )}
    </>
  )
}

function Agents({ notify, openWebCall }: { notify: Props['notify']; openWebCall?: Props['openWebCall'] }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [editing, setEditing] = useState<Agent | null>(null)
  const [creating, setCreating] = useState(false)

  const load = () =>
    get<{ agents: Agent[] }>('/api/agents')
      .then(r => {
        setAgents(r.agents)
        setEditing(r.agents[0] ?? null)
      })
      .catch(() => notify('Could not load agents.'))

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    if (!editing) return
    const response = await fetch(`/api/agents/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(editing)
    })
    if (response.ok) notify(`${editing.name} saved successfully.`)
    else notify('Could not save the agent.')
  }

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        language: form.get('language') || 'en-IN',
        voice: form.get('voice'),
        firstMessage: form.get('firstMessage') || '',
        prompt: form.get('prompt') || '',
        maxDuration: 300
      })
    })
    if (!response.ok) return notify('Could not create the agent.')
    const body = (await response.json()) as { agent: Agent }
    setAgents([...agents, body.agent])
    setEditing(body.agent)
    setCreating(false)
    notify(`${body.agent.name} created.`)
  }

  const getAgentTag = (name: string) => {
    switch (name) {
      case 'Aditi':
        return 'Paid Media & Growth'
      case 'Kabir':
        return 'Reels & Video Creative'
      case 'Dev':
        return 'Web & Tech Integration'
      case 'Priya':
        return 'Telugu Regional Outreach'
      case 'Rhea':
        return 'Marketing Funnel Audit'
      default:
        return 'ARTH Voice AI'
    }
  }

  return (
    <>
      <Title
        title="ARTH Predefined Agents"
        detail="5 pre-configured voice agents specialized in Marketing, Content, Technology, Local Growth, and Audits."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="webcall-btn"
              type="button"
              onClick={() => openWebCall?.(editing?.id)}
            >
              <Phone size={15} weight="fill" />
              <span className="btn-pulse" /> Test Call {editing?.name ?? 'Agent'}
            </button>
            <button className="primary-button" onClick={() => setCreating(true)}>
              <Plus size={17} /> New agent
            </button>
          </div>
        }
      />
      <div className="product-split">
        <aside className="panel agent-list">
          {agents.map(agent => (
            <button
              key={agent.id}
              className={editing?.id === agent.id ? 'agent-row selected' : 'agent-row'}
              onClick={() => setEditing(agent)}
            >
              <span className="agent-tile">{agent.name === 'Priya' ? 'ప' : agent.name[0]}</span>
              <div>
                <strong>{agent.name}</strong>
                <small>{getAgentTag(agent.name)}</small>
                <small style={{ color: '#7c86a8' }}>
                  {agent.language} · {agent.voice}
                </small>
              </div>
            </button>
          ))}
        </aside>

        {editing && (
          <section className="panel editor">
            <div className="panel-header">
              <div>
                <p className="section-kicker">ARTH Agent Configuration</p>
                <h2>
                  {editing.name} <span style={{ fontSize: '12px', fontWeight: 500, color: '#7b839f' }}>({getAgentTag(editing.name)})</span>
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="webcall-btn"
                  type="button"
                  onClick={() => openWebCall?.(editing.id)}
                >
                  <Phone size={15} weight="fill" />
                  <span className="btn-pulse" /> Call {editing.name}
                </button>
                <button className="primary-button" onClick={save}>
                  <FloppyDisk size={16} /> Save changes
                </button>
              </div>
            </div>
            <div className="form-grid agent-form">
              <label>
                Agent name
                <input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label>
                Voice
                <select
                  value={editing.voice}
                  onChange={e => setEditing({ ...editing, voice: e.target.value })}
                >
                  <option>Warm female</option>
                  <option>Clear male</option>
                  <option>Calm female</option>
                  <option>Calm male</option>
                </select>
              </label>
              <label>
                Language code
                <select
                  value={editing.language}
                  onChange={e => setEditing({ ...editing, language: e.target.value })}
                >
                  <option value="en-IN">en-IN (Indian English)</option>
                  <option value="te-IN">te-IN (Telugu)</option>
                  <option value="hi-IN">hi-IN (Hindi / Hinglish)</option>
                  <option value="en-US">en-US (Global English)</option>
                </select>
              </label>
              <label>
                Max call length (seconds)
                <input
                  type="number"
                  min="30"
                  max="1800"
                  value={editing.maxDuration}
                  onChange={e => setEditing({ ...editing, maxDuration: Number(e.target.value) })}
                />
              </label>
              <label className="wide">
                First greeting message
                <textarea
                  value={editing.firstMessage}
                  onChange={e => setEditing({ ...editing, firstMessage: e.target.value })}
                />
              </label>
              <label className="wide">
                System prompt & ARTH company guidelines
                <textarea
                  style={{ minHeight: '140px' }}
                  value={editing.prompt}
                  onChange={e => setEditing({ ...editing, prompt: e.target.value })}
                />
              </label>
            </div>
          </section>
        )}
      </div>

      {creating && (
        <Modal title="Create custom ARTH agent" close={() => setCreating(false)}>
          <form className="form-grid" onSubmit={create}>
            <label>
              Agent name
              <input name="name" required placeholder="e.g. Sam" />
            </label>
            <label>
              Language
              <select name="language" defaultValue="en-IN">
                <option value="en-IN">en-IN (Indian English)</option>
                <option value="te-IN">te-IN (Telugu)</option>
                <option value="hi-IN">hi-IN (Hindi)</option>
                <option value="en-US">en-US (Global English)</option>
              </select>
            </label>
            <label>
              Voice
              <select name="voice" defaultValue="Warm female">
                <option>Warm female</option>
                <option>Clear male</option>
                <option>Calm female</option>
                <option>Calm male</option>
              </select>
            </label>
            <label className="wide">
              First message
              <input
                name="firstMessage"
                placeholder="Hi {name}! This is Sam from ARTH Marketing Media..."
              />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} /> Create agent
            </button>
          </form>
        </Modal>
      )}
    </>
  )
}

function Campaigns({ notify, openWebCall }: { notify: Props['notify']; openWebCall?: Props['openWebCall'] }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [callOpen, setCallOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState('')

  useEffect(() => {
    get<{ campaign: Campaign }>('/api/campaigns/demo').then(r => setCampaign(r.campaign))
    get<{ contacts: Contact[] }>('/api/contacts').then(r => setContacts(r.contacts))
  }, [])

  const update = async (patch: object) => {
    const r = await fetch('/api/campaigns/demo', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    })
    const body = await r.json()
    if (!r.ok) return notify(body.error || 'Could not save campaign settings.')
    setCampaign(body.campaign)
    notify('ARTH campaign settings saved.')
  }

  const testCall = async () => {
    const r = await fetch('/api/campaigns/demo/test-call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contactId: selectedContactId })
    })
    const body = await r.json()
    if (!r.ok) return notify(body.error || 'The selected contact does not pass consent checks.')
    setCallOpen(false)
    notify(
      body.testMode
        ? 'Simulated test call placed and added to monitor & logs.'
        : 'Exotel accepted the call request. Check Call logs for its status.'
    )
  }

  const callableContacts = contacts.filter(contact => contact.dnd === 'clear' && Boolean(contact.consent))

  if (!campaign) return <div className="loading-block">Loading campaign...</div>

  return (
    <>
      <Title
        title="Campaigns"
        detail="Automate outreach to high-growth businesses and schedule complimentary marketing audits."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="webcall-btn" type="button" onClick={() => openWebCall?.()}>
              <Phone size={15} weight="fill" />
              <span className="btn-pulse" /> Live Web Call
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setSelectedContactId(callableContacts[0]?.id ?? '')
                setCallOpen(true)
              }}
            >
              <TestTube size={17} /> Exotel Simulation
            </button>
          </div>
        }
      />
      <section className="panel editor">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Current outreach campaign</p>
            <h2>{campaign.name}</h2>
          </div>
          <span className={`status ${campaign.status === 'running' ? 'live' : 'paused'}`}>
            {campaign.status}
          </span>
        </div>
        <div className="form-grid agent-form">
          <label>
            Campaign name
            <input
              value={campaign.name}
              onChange={e => setCampaign({ ...campaign, name: e.target.value })}
            />
          </label>
          <label>
            Contact audience
            <select
              value={campaign.listName}
              onChange={e => setCampaign({ ...campaign, listName: e.target.value })}
            >
              <option>High-Growth Brands & Local Businesses</option>
              <option>Real Estate & Plotted Communities</option>
              <option>Enterprise Software & SaaS</option>
              <option>Retail & Store Promotions</option>
            </select>
          </label>
          <label>
            Calling window starts
            <input
              type="time"
              value={campaign.windowStart}
              onChange={e => setCampaign({ ...campaign, windowStart: e.target.value })}
            />
          </label>
          <label>
            Calling window ends
            <input
              type="time"
              value={campaign.windowEnd}
              onChange={e => setCampaign({ ...campaign, windowEnd: e.target.value })}
            />
          </label>
          <label>
            Parallel lines
            <input
              type="number"
              min="1"
              max="20"
              value={campaign.maxConcurrent}
              onChange={e => setCampaign({ ...campaign, maxConcurrent: Number(e.target.value) })}
            />
          </label>
          <label>
            Maximum attempts
            <input
              type="number"
              min="1"
              max="3"
              value={campaign.attempts}
              onChange={e => setCampaign({ ...campaign, attempts: Number(e.target.value) })}
            />
          </label>
          <button className="primary-button" onClick={() => update(campaign)}>
            <FloppyDisk size={16} /> Save campaign
          </button>
        </div>
      </section>

      <p className="compliance-note">
        Tip: Use <b>Live Web Call</b> for direct voice conversation and transcription in your browser. Telephony simulation tests verify contact consent and CRM tracking without provider KYC hurdles.
      </p>

      {callOpen && (
        <Modal title="Simulate Exotel campaign call" close={() => setCallOpen(false)}>
          <p className="call-summary">
            Choose a contact with recorded consent. In simulation mode, this verifies safety filters and records a call attempt to your monitor and logs without dialing external phones.
          </p>
          <div className="form-grid call-form">
            <label className="wide">
              Contact
              <select
                value={selectedContactId}
                onChange={e => setSelectedContactId(e.target.value)}
              >
                {callableContacts.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} · {contact.phone}
                  </option>
                ))}
              </select>
            </label>
            <div className="call-safety">
              Only consent-recorded contacts with clear DND status are eligible.
            </div>
            <button
              className="primary-button"
              disabled={!selectedContactId}
              onClick={testCall}
            >
              <TestTube size={16} /> Submit simulated call
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

function CallLogs({ notify }: { notify: Props['notify'] }) {
  const [calls, setCalls] = useState<Call[]>([])
  const [selected, setSelected] = useState<Call | null>(null)

  const load = () =>
    get<{ calls: Call[] }>('/api/calls')
      .then(r => setCalls(r.calls))
      .catch(() => notify('Could not load calls.'))

  useEffect(() => {
    void load()
  }, [])

  return (
    <>
      <Title
        title="Call logs"
        detail="Review outcomes, summaries, and transcripts from every ARTH AI interaction."
      />
      <section className="panel product-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {calls.map(call => (
                <tr key={call.id}>
                  <td>
                    <strong>{call.contact}</strong>
                    <small className="subline">{call.phone}</small>
                  </td>
                  <td>{call.startedAt}</td>
                  <td>{call.duration}</td>
                  <td>
                    <span
                      className={`outcome ${
                        call.outcome === 'interested'
                          ? 'hot'
                          : call.outcome === 'callback_requested'
                          ? 'warm'
                          : 'muted'
                      }`}
                    >
                      {call.outcome.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <button className="row-button" onClick={() => setSelected(call)}>
                      Transcript
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <Modal title={`${selected.contact} - call transcript`} close={() => setSelected(null)}>
          <p className="call-summary">{selected.summary}</p>
          <div className="transcript">
            {selected.transcript.map((line, index) => {
              const isUser = line.role === 'User' || line.role === 'Client' || line.role === 'Rahul' || line.role === 'Suresh' || line.role === 'Deepika'
              return (
                <div key={index} className={isUser ? 'contact-line' : 'agent-line'}>
                  <strong>{line.role}</strong>
                  <p>{line.text}</p>
                </div>
              )
            })}
          </div>
        </Modal>
      )}
    </>
  )
}

function Leads({ notify }: { notify: Props['notify'] }) {
  const [leads, setLeads] = useState<Lead[]>([])

  useEffect(() => {
    get<{ leads: Lead[] }>('/api/leads')
      .then(r => setLeads(r.leads))
      .catch(() => notify('Could not load leads.'))
  }, [])

  return (
    <>
      <Title
        title="Leads and analytics"
        detail="Qualified brand prospects ready for Strategy Calls, Video Concepts, and Website Audits."
        action={
          <a className="primary-button" href="/api/leads/export.csv">
            <DownloadSimple size={17} /> Export CSV
          </a>
        }
      />
      <section className="mini-metrics">
        <div>
          <span>Qualified leads</span>
          <strong>{leads.length}</strong>
        </div>
        <div>
          <span>Connect rate</span>
          <strong>46.8%</strong>
        </div>
        <div>
          <span>Avg call duration</span>
          <strong>01:34</strong>
        </div>
      </section>
      <section className="panel product-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lead & Brand</th>
                <th>Priority</th>
                <th>Callback window</th>
                <th>Service requested</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.contact}</strong>
                    <small className="subline">
                      {lead.city} · {lead.phone}
                    </small>
                  </td>
                  <td>
                    <span className={`outcome ${lead.interest === 'hot' ? 'hot' : 'warm'}`}>
                      {lead.interest}
                    </span>
                  </td>
                  <td>{lead.callback}</td>
                  <td>{lead.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function SettingsView({ notify }: { notify: Props['notify'] }) {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    get<{ settings: Settings }>('/api/settings')
      .then(r => setSettings(r.settings))
      .catch(() => notify('Could not load settings.'))
  }, [])

  const save = async () => {
    if (!settings) return
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings)
    })
    const body = await response.json()
    if (!response.ok) return notify(body.error || 'Could not save settings.')
    setSettings(body.settings)
    notify('ARTH workspace settings saved.')
  }

  if (!settings) return <div className="loading-block">Loading settings...</div>

  return (
    <>
      <Title
        title="Workspace settings"
        detail="Company information, compliance controls, and telephony provider parameters."
      />

      {/* ARTH Company Info Card */}
      <section className="panel" style={{ padding: '22px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <p className="section-kicker">Company Profile</p>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#172044' }}>ARTH Marketing Media</h2>
            <p style={{ margin: '6px 0 0', color: '#6d748e', fontSize: '13px' }}>
              Marketing. Content. Technology. Helping businesses attract customers both online and offline.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <a
              href="https://arth-mauve.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="secondary-button"
              style={{ textDecoration: 'none' }}
            >
              <ArrowSquareOut size={16} /> Website
            </a>
            <a
              href="https://wa.me/919809987999"
              target="_blank"
              rel="noopener noreferrer"
              className="secondary-button"
              style={{ textDecoration: 'none' }}
            >
              <WhatsappLogo size={16} /> WhatsApp
            </a>
            <a
              href="mailto:buildwitharth@gmail.com"
              className="secondary-button"
              style={{ textDecoration: 'none' }}
            >
              <Envelope size={16} /> Email
            </a>
          </div>
        </div>
      </section>

      <section className="panel editor">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Safety and delivery</p>
            <h2>Calling safeguards</h2>
          </div>
          <button className="primary-button" onClick={save}>
            <FloppyDisk size={16} /> Save settings
          </button>
        </div>
        <div className="form-grid agent-form">
          <label>
            Business name
            <input
              value={settings.businessName}
              onChange={e => setSettings({ ...settings, businessName: e.target.value })}
            />
          </label>
          <label>
            Timezone
            <select
              value={settings.timezone}
              onChange={e => setSettings({ ...settings, timezone: e.target.value })}
            >
              <option value="Asia/Kolkata">India Standard Time (IST)</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <label className="wide">
            Provider webhook URL
            <input
              type="url"
              placeholder="https://voice-provider.example/webhooks"
              value={settings.publicWebhookUrl}
              onChange={e => setSettings({ ...settings, publicWebhookUrl: e.target.value })}
            />
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.aiDisclosureEnabled}
              onChange={e => setSettings({ ...settings, aiDisclosureEnabled: e.target.checked })}
            />{' '}
            Require AI disclosure in the opening message
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.dndChecksEnabled}
              onChange={e => setSettings({ ...settings, dndChecksEnabled: e.target.checked })}
            />{' '}
            Run DND checks before placing every call
          </label>
        </div>
      </section>
    </>
  )
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <button className="modal-close" onClick={close} aria-label="Close">
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
