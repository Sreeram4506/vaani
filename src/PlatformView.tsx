import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Buildings, CaretDown, ChartLineUp, CurrencyDollar,
  MagnifyingGlass, Phone, Plus, Users, X, CheckCircle, Crown,
  Rocket, Lightning, Pause, Trash
} from '@phosphor-icons/react'

type Organization = {
  id: string; name: string; slug: string; initials: string; industry: string
  plan: 'starter' | 'growth' | 'enterprise'
  status: 'active' | 'trial' | 'suspended'
  createdAt: string; contactEmail: string; contactPhone: string; website: string
  color: string; maxAgents: number; maxContacts: number; monthlyMinutes: number; usedMinutes: number
  totalContacts?: number; totalCalls?: number; totalLeads?: number
  activeCampaigns?: number; agentCount?: number
}

type PlatformOverview = {
  totalOrganizations: number; activeOrganizations: number
  totalContacts: number; totalCalls: number; totalLeads: number
  totalMinutesUsed: number; totalMinutesAllotted: number
  monthlyRevenue: number
  organizations: Array<{
    id: string; name: string; initials: string; plan: string
    status: string; color: string; usedMinutes: number; monthlyMinutes: number
    totalContacts?: number; totalCalls?: number
  }>
}

type Props = {
  active: string
  notify: (message: string) => void
  onSelectOrg: (orgId: string) => void
}

const planIcon = (plan: string) => {
  if (plan === 'enterprise') return <Crown size={12} weight="fill" />
  if (plan === 'growth') return <Rocket size={12} weight="fill" />
  return <Lightning size={12} weight="fill" />
}

const planColor = (plan: string) => {
  if (plan === 'enterprise') return { bg: '#f0e8ff', color: '#7c4dbd' }
  if (plan === 'growth') return { bg: '#e0f6ee', color: '#168263' }
  return { bg: '#fff3d9', color: '#a47116' }
}

const statusStyle = (status: string) => {
  if (status === 'active') return 'hot'
  if (status === 'trial') return 'warm'
  return 'muted'
}

export function PlatformView({ active, notify, onSelectOrg }: Props) {
  if (active === 'Clients') return <ClientsView notify={notify} onSelectOrg={onSelectOrg} />
  if (active === 'Usage') return <UsageView notify={notify} />
  if (active === 'Platform Settings') return <PlatformSettingsView notify={notify} />
  return <OverviewView notify={notify} onSelectOrg={onSelectOrg} />
}

function OverviewView({ notify, onSelectOrg }: { notify: Props['notify']; onSelectOrg: Props['onSelectOrg'] }) {
  const [overview, setOverview] = useState<PlatformOverview | null>(null)

  useEffect(() => {
    fetch('/api/platform/overview')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setOverview)
      .catch(() => notify('Could not load platform overview.'))
  }, [])

  if (!overview) return <div className="loading-block">Loading platform overview...</div>

  const metrics = [
    { label: 'Organizations', value: String(overview.totalOrganizations), note: `${overview.activeOrganizations} active`, tone: 'blue' },
    { label: 'Total Contacts', value: overview.totalContacts.toLocaleString(), note: 'across all clients', tone: 'violet' },
    { label: 'Calls Made', value: String(overview.totalCalls), note: `${overview.totalMinutesUsed.toLocaleString()} min used`, tone: 'gold' },
    { label: 'Monthly Revenue', value: `$${overview.monthlyRevenue.toLocaleString()}`, note: 'active subscriptions', tone: 'mint' },
  ]

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Vaani Platform Admin</p>
          <h1>Platform Overview</h1>
          <p className="intro">
            Manage {overview.totalOrganizations} client organizations across your voice AI platform.
          </p>
        </div>
      </div>

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

      <section className="panel recent" style={{ marginTop: 17 }}>
        <div className="panel-header">
          <div>
            <p className="section-kicker">All organizations</p>
            <h2>Client breakdown</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Minutes used</th>
                <th>Contacts</th>
                <th>Calls</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overview.organizations.map(org => {
                const pc = planColor(org.plan)
                return (
                  <tr key={org.id}>
                    <td>
                      <div className="person">
                        <div className="contact-avatar small" style={{ background: org.color + '22', color: org.color }}>
                          {org.initials}
                        </div>
                        <div>
                          <strong>{org.name}</strong>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="plan-badge" style={{ background: pc.bg, color: pc.color }}>
                        {planIcon(org.plan)} {org.plan}
                      </span>
                    </td>
                    <td><span className={`outcome ${statusStyle(org.status)}`}>{org.status}</span></td>
                    <td>
                      <div className="usage-mini">
                        <span>{org.usedMinutes.toLocaleString()} / {org.monthlyMinutes.toLocaleString()}</span>
                        <div className="progress-track" style={{ width: 80 }}>
                          <span style={{ width: `${Math.min(100, (org.usedMinutes / org.monthlyMinutes) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>{org.totalContacts ?? 0}</td>
                    <td>{org.totalCalls ?? 0}</td>
                    <td>
                      <button className="row-button" onClick={() => onSelectOrg(org.id)}>
                        Open <ArrowRight size={12} />
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
  )
}

function ClientsView({ notify, onSelectOrg }: { notify: Props['notify']; onSelectOrg: Props['onSelectOrg'] }) {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '', slug: '', industry: '', plan: 'starter' as 'starter' | 'growth' | 'enterprise',
    contactEmail: '', contactPhone: '', website: ''
  })

  const load = () =>
    fetch('/api/platform/organizations')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { organizations: Organization[] }) => setOrgs(data.organizations))
      .catch(() => notify('Could not load organizations.'))

  useEffect(() => { void load() }, [])

  const shown = useMemo(
    () => orgs.filter(o =>
      `${o.name} ${o.slug} ${o.industry} ${o.plan}`.toLowerCase().includes(search.toLowerCase())
    ),
    [orgs, search]
  )

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/platform/organizations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed' }))
      return notify(body.error || 'Could not create organization.')
    }
    setCreating(false)
    setForm({ name: '', slug: '', industry: '', plan: 'starter', contactEmail: '', contactPhone: '', website: '' })
    notify('Organization created successfully.')
    load()
  }

  const deleteOrg = async (orgId: string, orgName: string) => {
    if (!window.confirm(`Delete "${orgName}"? This cannot be undone.`)) return
    const res = await fetch(`/api/platform/organizations/${orgId}`, { method: 'DELETE' })
    if (!res.ok) return notify('Could not delete organization.')
    notify(`${orgName} deleted.`)
    load()
  }

  const toggleStatus = async (org: Organization) => {
    const newStatus = org.status === 'suspended' ? 'active' : 'suspended'
    const res = await fetch(`/api/platform/organizations/${org.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    })
    if (!res.ok) return notify('Could not update status.')
    notify(`${org.name} ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}.`)
    load()
  }

  return (
    <>
      <div className="product-title">
        <div>
          <p className="eyebrow">Vaani Platform</p>
          <h1>Client Organizations</h1>
          <p>Manage all client workspaces, plans, and access.</p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={17} /> New Client
        </button>
      </div>

      <section className="panel product-panel">
        <div className="toolbar">
          <div className="search">
            <MagnifyingGlass size={17} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organizations..." />
          </div>
          <span>{orgs.length} organizations</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Industry</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Agents</th>
                <th>Contacts</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(org => {
                const pc = planColor(org.plan)
                return (
                  <tr key={org.id}>
                    <td>
                      <div className="person">
                        <div className="contact-avatar small" style={{ background: org.color + '22', color: org.color }}>
                          {org.initials}
                        </div>
                        <div>
                          <strong>{org.name}</strong>
                          <span>{org.contactEmail}</span>
                        </div>
                      </div>
                    </td>
                    <td>{org.industry}</td>
                    <td>
                      <span className="plan-badge" style={{ background: pc.bg, color: pc.color }}>
                        {planIcon(org.plan)} {org.plan}
                      </span>
                    </td>
                    <td><span className={`outcome ${statusStyle(org.status)}`}>{org.status}</span></td>
                    <td>{org.agentCount ?? '-'}</td>
                    <td>{org.totalContacts ?? '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="row-button" onClick={() => onSelectOrg(org.id)}>Open</button>
                        <button
                          className="row-button"
                          onClick={() => toggleStatus(org)}
                          title={org.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        >
                          <Pause size={13} />
                        </button>
                        <button className="row-button" style={{ color: '#c0392b' }} onClick={() => deleteOrg(org.id, org.name)}>
                          <Trash size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {creating && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 'min(520px, 100%)' }}>
            <button className="modal-close" onClick={() => setCreating(false)} aria-label="Close"><X size={20} /></button>
            <div className="modal-icon"><Buildings size={23} weight="fill" /></div>
            <h2>Create new client</h2>
            <form className="form-grid" onSubmit={create}>
              <label>
                Organization name
                <input required placeholder="e.g. Acme Corp" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                Slug (URL-safe)
                <input required placeholder="e.g. acme-corp" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
              </label>
              <label>
                Industry
                <input placeholder="e.g. Healthcare" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} />
              </label>
              <label>
                Plan
                <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value as 'starter' | 'growth' | 'enterprise' })}>
                  <option value="starter">Starter ($299/mo)</option>
                  <option value="growth">Growth ($799/mo)</option>
                  <option value="enterprise">Enterprise ($1,999/mo)</option>
                </select>
              </label>
              <label>
                Contact email
                <input type="email" placeholder="admin@acme.com" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} />
              </label>
              <label>
                Contact phone
                <input placeholder="+91 98765 43210" value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} />
              </label>
              <label className="wide">
                Website
                <input type="url" placeholder="https://acme.com" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
              </label>
              <button className="primary-button" type="submit"><Plus size={16} /> Create Organization</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function UsageView({ notify }: { notify: Props['notify'] }) {
  const [overview, setOverview] = useState<PlatformOverview | null>(null)

  useEffect(() => {
    fetch('/api/platform/overview')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setOverview)
      .catch(() => notify('Could not load usage data.'))
  }, [])

  if (!overview) return <div className="loading-block">Loading usage data...</div>

  const totalAllotted = overview.totalMinutesAllotted
  const totalUsed = overview.totalMinutesUsed
  const utilizationPct = totalAllotted > 0 ? ((totalUsed / totalAllotted) * 100).toFixed(1) : '0'

  return (
    <>
      <div className="product-title">
        <div>
          <p className="eyebrow">Vaani Platform</p>
          <h1>Usage & Analytics</h1>
          <p>Monitor platform-wide voice AI consumption and resource allocation.</p>
        </div>
      </div>

      <section className="mini-metrics">
        <div>
          <span>Total Minutes Used</span>
          <strong>{totalUsed.toLocaleString()}</strong>
        </div>
        <div>
          <span>Total Allotted</span>
          <strong>{totalAllotted.toLocaleString()}</strong>
        </div>
        <div>
          <span>Utilization</span>
          <strong>{utilizationPct}%</strong>
        </div>
      </section>

      <section className="panel product-panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Per-organization breakdown</p>
            <h2>Minutes usage by client</h2>
          </div>
        </div>
        <div style={{ padding: '0 22px 22px' }}>
          {overview.organizations.map(org => {
            const pct = org.monthlyMinutes > 0 ? (org.usedMinutes / org.monthlyMinutes) * 100 : 0
            return (
              <div key={org.id} className="usage-bar-row">
                <div className="usage-bar-label">
                  <div className="contact-avatar small" style={{ background: org.color + '22', color: org.color, width: 24, height: 24, fontSize: 8 }}>
                    {org.initials}
                  </div>
                  <strong>{org.name}</strong>
                  <span className="plan-badge" style={{ ...planColor(org.plan), fontSize: 9, padding: '2px 5px' }}>
                    {org.plan}
                  </span>
                </div>
                <div className="usage-bar-track">
                  <div className="usage-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: org.color }} />
                </div>
                <div className="usage-bar-numbers">
                  <span>{org.usedMinutes.toLocaleString()}</span>
                  <span className="usage-bar-total">/ {org.monthlyMinutes.toLocaleString()} min</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel product-panel" style={{ marginTop: 17 }}>
        <div className="panel-header">
          <div>
            <p className="section-kicker">Revenue</p>
            <h2>Monthly recurring revenue</h2>
          </div>
        </div>
        <div style={{ padding: '0 22px 22px' }}>
          <div className="revenue-summary">
            <div className="revenue-big">
              <CurrencyDollar size={28} weight="bold" />
              <span>${overview.monthlyRevenue.toLocaleString()}</span>
            </div>
            <p>from {overview.activeOrganizations} active subscriptions</p>
          </div>
        </div>
      </section>
    </>
  )
}

function PlatformSettingsView({ notify }: { notify: Props['notify'] }) {
  return (
    <>
      <div className="product-title">
        <div>
          <p className="eyebrow">Vaani Platform</p>
          <h1>Platform Settings</h1>
          <p>Global configuration for the Vaani Voice AI enterprise platform.</p>
        </div>
      </div>
      <section className="panel editor">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Platform configuration</p>
            <h2>General settings</h2>
          </div>
        </div>
        <div className="form-grid agent-form">
          <label>
            Platform name
            <input value="Vaani Voice AI" readOnly />
          </label>
          <label>
            Default plan for new clients
            <select defaultValue="starter">
              <option value="starter">Starter ($299/mo)</option>
              <option value="growth">Growth ($799/mo)</option>
              <option value="enterprise">Enterprise ($1,999/mo)</option>
            </select>
          </label>
          <label className="switch-row">
            <input type="checkbox" defaultChecked /> Require AI disclosure for all organizations
          </label>
          <label className="switch-row">
            <input type="checkbox" defaultChecked /> Enable DND compliance checks globally
          </label>
          <button className="primary-button" onClick={() => notify('Platform settings saved.')}>
            <CheckCircle size={16} weight="fill" /> Save settings
          </button>
        </div>
      </section>
    </>
  )
}
