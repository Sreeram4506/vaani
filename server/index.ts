import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const app = express()
const port = Number(process.env.PORT || 8787) || 8787
const host = process.env.HOST ?? '0.0.0.0'
const testMode = process.env.TEST_MODE !== 'false'
const provider = process.env.VOICE_PROVIDER ?? 'exotel'
const exotel = {
  accountSid: process.env.EXOTEL_ACCOUNT_SID ?? '',
  apiKey: process.env.EXOTEL_API_KEY ?? '',
  apiToken: process.env.EXOTEL_API_TOKEN ?? '',
  callerId: process.env.EXOTEL_CALLER_ID ?? '',
  streamUrl: process.env.EXOTEL_STREAM_URL ?? '',
  statusCallbackUrl: process.env.EXOTEL_STATUS_CALLBACK_URL ?? '',
  region: ['sg', 'global', 'com'].includes((process.env.EXOTEL_REGION ?? '').toLowerCase()) ? 'sg' : 'in',
}
const openai = { apiKey: process.env.OPENAI_API_KEY ?? '', model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime', voice: process.env.OPENAI_REALTIME_VOICE ?? 'marin' }
app.use(cors())
app.use(express.json({ limit: '2mb' }))

type Contact = { id: string; name: string; phone: string; city: string; listName: string; consent: string; dnd: 'clear' | 'unknown' | 'blocked' }
type Agent = { id: string; name: string; language: string; voice: string; firstMessage: string; prompt: string; maxDuration: number }
type Call = { id: string; contactId: string; contact: string; phone: string; startedAt: string; duration: string; status: string; outcome: string; summary: string; transcript: Array<{ role: string; text: string }> }
type Lead = { id: string; contact: string; phone: string; city: string; interest: string; callback: string; source: string }
type Settings = { businessName: string; timezone: string; publicWebhookUrl: string; dndChecksEnabled: boolean; aiDisclosureEnabled: boolean }

// Pre-defined contacts based on ARTH client sectors (Fitness, Real Estate, Tech, Professional Services, Retail)
const contacts: Contact[] = [
  { id: 'c-1', name: 'Rahul Sharma (Fit Secrets)', phone: '+919848032451', city: 'Hyderabad', listName: 'High-Growth Brands & D2C', consent: 'Inbound inquiry, 24 Oct 2026', dnd: 'clear' },
  { id: 'c-2', name: 'Suresh Reddy (Quantumrise Infra)', phone: '+919985199765', city: 'Bangalore', listName: 'Real Estate & Plotted Communities', consent: 'Website audit request, 25 Oct 2026', dnd: 'clear' },
  { id: 'c-3', name: 'Ananya Rao (Samadhai Technologies)', phone: '+919701027613', city: 'Hyderabad', listName: 'Enterprise Software & SaaS', consent: 'Strategy call form, 21 Oct 2026', dnd: 'clear' },
  { id: 'c-4', name: 'Vikram Joshi (Acuity Tax)', phone: '+919847651287', city: 'Hyderabad', listName: 'Tax, Legal & Compliance', consent: 'Referral, 23 Oct 2026', dnd: 'clear' },
  { id: 'c-5', name: 'Deepika Verma (Urban Stores)', phone: '+919809987111', city: 'Bangalore', listName: 'Retail & Store Promotions', consent: 'WhatsApp campaign opt-in, 26 Oct 2026', dnd: 'clear' },
]

// Pre-defined voice agents for ARTH Marketing Media (Marketing, Content, Technology, Offline Growth, Audits)
const agents: Agent[] = [
  {
    id: 'a-aditi',
    name: 'Aditi',
    language: 'en-IN',
    voice: 'Warm female',
    maxDuration: 300,
    firstMessage: 'Hi {name}! This is Aditi from ARTH Marketing Media. We help businesses uncover bottlenecks in their customer acquisition funnel and scale with Meta and Google Ads. Are you looking to generate more qualified leads or scale your ad spend this quarter?',
    prompt: `You are Aditi, Senior Growth Strategist at ARTH Marketing Media (arth-mauve.vercel.app).
Company Overview:
- ARTH stands for Marketing, Content, and Technology ("Helping businesses attract customers both online and offline").
- Philosophy: "We don't just create content. We create ways for businesses to get attention, generate enquiries and grow."
- Proven 4-Step Process:
  1. Audit: Dig into the funnel, ad accounts, and analytics to identify exactly where growth is leaking.
  2. Strategy: Channel plan built around unit economics, with budgets, creative angles, and KPIs agreed up front.
  3. Launch: Campaigns, landing pages, and tracking go live fast, instrumented from day one.
  4. Scale: Weekly testing and reporting—double down on what works and cut what doesn't.
- Services in Paid Media & Marketing: Meta Ads, Google Ads, Lead Generation, Social Media Management, Influencer Marketing, Local SEO.
- Real Case Study: Fit Secrets (@fit_secrets_store) - Complete content and growth partner (video shooting & editing, social media, Meta Ads, and SEO).
- Call to Action: Offer a complimentary marketing audit and 20-minute Strategy Call. Mention they can connect directly over WhatsApp (+91 9809987999) or email (buildwitharth@gmail.com).
Tone: Concise (1-2 sentences), strategic, warm, executive conversational style.`
  },
  {
    id: 'a-kabir',
    name: 'Kabir',
    language: 'en-IN',
    voice: 'Clear male',
    maxDuration: 300,
    firstMessage: 'Hey {name}! Kabir here from ARTH. We produce high-converting short-form videos, reels, and product ad creatives—like our ongoing work with Fit Secrets. How is your brand currently approaching video content and ad creatives on Instagram?',
    prompt: `You are Kabir, Creative & Video Producer at ARTH Marketing Media (arth-mauve.vercel.app).
Role & Expertise:
- Video & Creative Production: Reels & short-form videos, product video shoots, performance ad creatives.
- Scripts & Creatives: Campaign scripting, high-converting posters & banners, AI-assisted creatives.
- Case Study Proof: Fit Secrets (Fitness) — ARTH shoots and edits their videos, manages their social media, and produces ad creatives driving verified revenue.
- Core Belief: "We don't just create content. We create ways for businesses to get attention, generate enquiries and grow."
- Call to Action: Invite them to review our creative portfolio or schedule a video concept brainstorm via WhatsApp (+91 9809987999) or buildwitharth@gmail.com.
Tone: Energetic, creative, direct, natural telephone voice (1-2 crisp sentences).`
  },
  {
    id: 'a-dev',
    name: 'Dev',
    language: 'en-IN',
    voice: 'Calm male',
    maxDuration: 300,
    firstMessage: 'Hello {name}! Dev from ARTH Technology. We design and build ultra-fast business websites, e-commerce stores, and custom WhatsApp integrations for companies like Samadhai Technologies, Quantumrise Infra, and Acuity Tax. Is your team looking to upgrade your web presence or scale your digital conversions?',
    prompt: `You are Dev, Technology & Web Solutions Lead at ARTH Marketing Media (arth-mauve.vercel.app).
Role & Expertise:
- Technology Offerings: Modern business websites, e-commerce platforms, product catalogues, conversion landing pages, WhatsApp API integration, and website maintenance.
- Real Case Studies:
  1. Quantumrise Infra (Bangalore) — Premium plotted communities developer. Designed & built high-converting website, handled SEO (quantumriseinfra.com).
  2. Samadhai Technologies (Hyderabad) — AI-driven enterprise software company. Built website and handled SEO (samadhaitechnologies.com).
  3. Acuity Tax (Hyderabad) — Tax & compliance firm. Built official website and handled SEO (acuitytax.in).
- Call to Action: Offer a complimentary website speed and SEO diagnostic or schedule a scoping call via WhatsApp (+91 9809987999) or buildwitharth@gmail.com.
Tone: Knowledgeable, consultative, clear, 1-2 concise conversational sentences.`
  },
  {
    id: 'a-priya',
    name: 'Priya',
    language: 'te-IN',
    voice: 'Warm female',
    maxDuration: 300,
    firstMessage: 'నమస్కారం {name} గారు! నేను ARTH Marketing Media నుండి ప్రియ మాట్లాడుతున్నాను. మీ వ్యాపారానికి ఆన్‌లైన్ సోషల్ మీడియా మరియు ఆఫ్‌లైన్ ప్రమోషన్స్ ద్వారా ఎక్కువ మంది కస్టమర్లను మరియు సేల్స్‌ను తీసుకురావడంలో మేము సహాయం చేస్తాము. మీతో మాట్లాడవచ్చా?',
    prompt: `You are Priya, Local & Regional Outreach Specialist at ARTH Marketing Media (arth-mauve.vercel.app).
Language: Fluent, friendly, natural Telugu mixed with everyday English terms.
Expertise:
- ARTH helps businesses attract customers both online and offline.
- Offline Growth Services: Local promotional campaigns, shop/store promotions, event promotions, outdoor advertising concepts, print campaign ideas, and online + offline campaign integration.
- Marketing & Content: Meta Ads, Instagram marketing, short-form reels, business websites, and WhatsApp integration.
- Case Studies: Fit Secrets (fitness), Quantumrise Infra (Bangalore real estate), Samadhai Technologies (software), Acuity Tax (corporate advisory).
- Contact: WhatsApp +91 9809987999 or buildwitharth@gmail.com.
- Tone: Respectful, conversational Telugu, one short question at a time.`
  },
  {
    id: 'a-rhea',
    name: 'Rhea',
    language: 'en-IN',
    voice: 'Calm female',
    maxDuration: 300,
    firstMessage: 'Hi {name}! Rhea from ARTH Marketing Media. We offer complimentary marketing audits for qualified brands to pinpoint where growth is leaking across your ads, content, and website. Would you like to review your current growth bottlenecks?',
    prompt: `You are Rhea, Inbound Growth & Marketing Audit Specialist at ARTH Marketing Media (arth-mauve.vercel.app).
Role:
- Conduct rapid diagnostic checks of prospective clients' acquisition funnels.
- Explain ARTH's 4 core service pillars: Marketing (paid ads/lead gen), Reels & Video, Technology (websites & WhatsApp), and Offline Growth.
- Cite ARTH's track record across Fitness (Fit Secrets), Real Estate (Quantumrise Infra), Tech (Samadhai Technologies), and Finance (Acuity Tax).
- Guide qualified prospects to book a strategy call or message ARTH on WhatsApp at +91 9809987999 or email buildwitharth@gmail.com.
Tone: Warm, executive, articulate, conversational (1-2 sentences).`
  }
]

const campaign = {
  id: 'arth-q4-growth-audit',
  name: 'ARTH Q4 Brand Growth & Marketing Audit',
  status: 'running' as 'running' | 'paused' | 'draft',
  agentId: 'a-aditi',
  listName: 'High-Growth Brands & Local Businesses',
  contacted: 248,
  total: 1000,
  maxConcurrent: 10,
  windowStart: '10:00',
  windowEnd: '19:00',
  attempts: 3
}

const calls: Call[] = [
  {
    id: 'call-1',
    contactId: 'c-1',
    contact: 'Rahul Sharma (Fit Secrets)',
    phone: '+919848032451',
    startedAt: 'Today, 17:11',
    duration: '01:32',
    status: 'completed',
    outcome: 'interested',
    summary: 'Discussed scaling Q4 Meta Ads and scheduling a new product video shoot. Requested a strategy follow-up tomorrow.',
    transcript: [
      { role: 'Aditi', text: 'Hi Rahul! This is Aditi from ARTH Marketing Media. Following up on your Q4 growth goals.' },
      { role: 'Rahul', text: 'Hey Aditi, our Instagram reels are performing well, but we want to scale Meta Ads for our new fitness line.' },
      { role: 'Aditi', text: 'That sounds perfect. We can run an audit on your ad creative CTRs and set up a dedicated video shoot next week.' },
      { role: 'Rahul', text: 'Great, send the calendar invite or message me on WhatsApp.' }
    ]
  },
  {
    id: 'call-2',
    contactId: 'c-2',
    contact: 'Suresh Reddy (Quantumrise Infra)',
    phone: '+919985199765',
    startedAt: 'Today, 16:46',
    duration: '01:15',
    status: 'completed',
    outcome: 'interested',
    summary: 'Reviewed website traffic and Google Ads for East Bangalore plotted communities. Setting up an audit call.',
    transcript: [
      { role: 'Dev', text: 'Hello Suresh! Dev from ARTH Technology. Checking in on your website conversion rates for the Bangalore project.' },
      { role: 'Suresh', text: 'Hi Dev. The site is looking clean. We are seeing organic search enquiries, but we want to launch targeted Google Ads.' },
      { role: 'Dev', text: 'Understood. We can audit your current landing page conversion rate and map out the unit economics before launch.' }
    ]
  },
  {
    id: 'call-3',
    contactId: 'c-3',
    contact: 'Ananya Rao (Samadhai Technologies)',
    phone: '+919701027613',
    startedAt: 'Today, 16:05',
    duration: '00:48',
    status: 'completed',
    outcome: 'callback_requested',
    summary: 'In an engineering sprint. Requested a callback tomorrow at 18:30 to discuss enterprise landing pages.',
    transcript: [
      { role: 'Dev', text: 'Hi Ananya! Dev here from ARTH.' },
      { role: 'Ananya', text: 'Hey Dev, I am heading into a product sprint right now. Can we talk tomorrow around 6:30 PM?' },
      { role: 'Dev', text: 'Absolutely! I will note that down and follow up tomorrow at 6:30 PM.' }
    ]
  },
  {
    id: 'call-4',
    contactId: 'c-5',
    contact: 'Deepika Verma (Urban Stores)',
    phone: '+919809987111',
    startedAt: 'Today, 15:20',
    duration: '01:40',
    status: 'completed',
    outcome: 'interested',
    summary: 'Inquired about ARTH offline promotional campaigns and WhatsApp integration for retail customer acquisition.',
    transcript: [
      { role: 'Priya', text: 'నమస్కారం దీపిక గారు! నేను ARTH Marketing Media నుండి ప్రియ మాట్లాడుతున్నాను.' },
      { role: 'Deepika', text: 'హలో ప్రియ, మా స్టోర్ కి కస్టమర్ ఫుట్‌ఫాల్ పెంచడానికి ఏదైనా లోకల్ క్యాంపెయిన్ చేయాలనుకుంటున్నాము.' },
      { role: 'Priya', text: 'తప్పకుండా! మేము ఆన్‌లైన్ ఇన్‌స్టాగ్రామ్ యాడ్స్ మరియు లోకల్ ఆఫ్‌లైన్ స్టోర్ ప్రమోషన్స్ కలిపి ప్లాన్ చేస్తాము. పూర్తి వివరాలు వాట్సాప్ లో పంపమంటారా?' },
      { role: 'Deepika', text: 'అవును, తప్పకుండా పంపండి.' }
    ]
  }
]

const leads: Lead[] = [
  { id: 'lead-1', contact: 'Rahul Sharma (Fit Secrets)', phone: '+919848032451', city: 'Hyderabad', interest: 'hot', callback: '28 Oct, 18:00', source: 'Meta Ads & Reels Outreach' },
  { id: 'lead-2', contact: 'Suresh Reddy (Quantumrise Infra)', phone: '+919985199765', city: 'Bangalore', interest: 'hot', callback: '28 Oct, 16:30', source: 'Real Estate Web & SEO' },
  { id: 'lead-3', contact: 'Ananya Rao (Samadhai Technologies)', phone: '+919701027613', city: 'Hyderabad', interest: 'warm', callback: '29 Oct, 18:30', source: 'Enterprise Platform Revamp' },
  { id: 'lead-4', contact: 'Deepika Verma (Urban Stores)', phone: '+919809987111', city: 'Bangalore', interest: 'hot', callback: '29 Oct, 15:00', source: 'Offline + Online Retail Promotion' }
]

const settings: Settings = {
  businessName: 'ARTH Marketing Media',
  timezone: 'Asia/Kolkata',
  publicWebhookUrl: '',
  dndChecksEnabled: true,
  aiDisclosureEnabled: true
}

const events: Array<{ id: string; receivedAt: string; payload: unknown }> = []
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
const normalisePhone = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 10 ? `+91${digits}` : value.startsWith('+') ? `+${digits}` : `+${digits}` }
const openaiReady = () => Boolean(openai.apiKey)
const streamUrl = () => { try { const url = new URL(exotel.streamUrl); url.searchParams.set('sample-rate', '24000'); return url.toString() } catch { return '' } }
const providerReady = () => provider === 'exotel' && [exotel.accountSid, exotel.apiKey, exotel.apiToken, exotel.callerId, streamUrl()].every(Boolean) && openaiReady()
const payload = () => ({ testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign })

const healthHandler = (_req: express.Request, res: express.Response) => res.json({ ok: true, business: 'ARTH Marketing Media', testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), realtimeModel: openai.model })
app.get('/api/health', healthHandler)
app.get('/health', healthHandler)
app.get('/healthz', healthHandler)
app.get('/api/dashboard', (_req, res) => res.json({
  testMode,
  provider,
  providerReady: providerReady(),
  openaiReady: openaiReady(),
  businessName: settings.businessName,
  campaign,
  metrics: {
    queued: Math.max(campaign.total - campaign.contacted, 0),
    inProgress: campaign.status === 'running' ? 8 : 0,
    connected: 182,
    leads: leads.length
  },
  recentCalls: calls.slice(0, 5)
}))
app.get('/api/contacts', (req, res) => { const search = String(req.query.search ?? '').toLowerCase(); res.json({ contacts: contacts.filter(c => !search || `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(search)) }) })
app.post('/api/contacts', (req, res) => {
  const { name, phone, city = '', listName = 'High-Growth Brands & D2C', consent = '', dnd = 'unknown' } = req.body as Partial<Contact>
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' })
  const normalised = normalisePhone(phone)
  if (contacts.some(c => c.phone === normalised)) return res.status(409).json({ error: 'This phone number already exists.' })
  const contact: Contact = { id: id('c'), name, phone: normalised, city, listName, consent, dnd: dnd === 'blocked' ? 'blocked' : dnd === 'clear' ? 'clear' : 'unknown' }
  contacts.unshift(contact)
  res.status(201).json({ contact })
})
app.post('/api/contacts/import', (req, res) => {
  const rows = Array.isArray(req.body?.contacts) ? req.body.contacts : []
  let imported = 0
  let skipped = 0
  rows.forEach((row: Partial<Contact>) => {
    if (!row.name || !row.phone) { skipped++; return }
    const phone = normalisePhone(row.phone)
    if (contacts.some(c => c.phone === phone)) { skipped++; return }
    contacts.push({ id: id('c'), name: row.name, phone, city: row.city ?? '', listName: row.listName ?? 'Imported contacts', consent: row.consent ?? '', dnd: 'unknown' })
    imported++
  })
  res.status(201).json({ imported, skipped })
})
app.patch('/api/contacts/:id', (req, res) => {
  const contact = contacts.find(c => c.id === req.params.id)
  if (!contact) return res.sendStatus(404)
  const { name, city, consent, dnd } = req.body as Partial<Contact>
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' })
  if (dnd !== undefined && !['clear', 'unknown', 'blocked'].includes(dnd)) return res.status(400).json({ error: 'Invalid DND status.' })
  Object.assign(contact, {
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(city !== undefined ? { city: String(city) } : {}),
    ...(consent !== undefined ? { consent: String(consent) } : {}),
    ...(dnd !== undefined ? { dnd } : {})
  })
  res.json({ contact })
})
app.get('/api/agents', (_req, res) => res.json({ agents }))
app.post('/api/agents', (req, res) => {
  const agent: Agent = {
    id: id('a'),
    name: req.body.name || 'New agent',
    language: req.body.language || 'en-IN',
    voice: req.body.voice || 'Warm female',
    firstMessage: req.body.firstMessage || '',
    prompt: req.body.prompt || '',
    maxDuration: Number(req.body.maxDuration) || 300
  }
  agents.push(agent)
  res.status(201).json({ agent })
})
app.patch('/api/agents/:id', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.sendStatus(404)
  const nextDuration = req.body.maxDuration === undefined ? agent.maxDuration : Number(req.body.maxDuration)
  if (!Number.isInteger(nextDuration) || nextDuration < 30 || nextDuration > 1800) return res.status(400).json({ error: 'Call length must be between 30 and 1800 seconds.' })
  Object.assign(agent, { ...req.body, maxDuration: nextDuration })
  res.json({ agent })
})
app.get('/api/campaigns', (_req, res) => res.json({ campaigns: [campaign] }))
app.get('/api/campaigns/demo', (_req, res) => res.json(payload()))
app.patch('/api/campaigns/demo', (req, res) => {
  const patch = req.body as Partial<typeof campaign>
  const maxConcurrent = patch.maxConcurrent === undefined ? campaign.maxConcurrent : Number(patch.maxConcurrent)
  const attempts = patch.attempts === undefined ? campaign.attempts : Number(patch.attempts)
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 20) return res.status(400).json({ error: 'Parallel calls must be between 1 and 20.' })
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) return res.status(400).json({ error: 'Attempts must be between 1 and 3.' })
  if (patch.windowStart && patch.windowEnd && patch.windowStart >= patch.windowEnd) return res.status(400).json({ error: 'The calling window must end after it starts.' })
  Object.assign(campaign, { ...patch, maxConcurrent, attempts })
  res.json(payload())
})
app.post('/api/campaigns/demo/start', (_req, res) => { campaign.status = 'running'; res.json(payload()) })
app.post('/api/campaigns/demo/pause', (_req, res) => { campaign.status = 'paused'; res.json(payload()) })
app.post('/api/campaigns/demo/test-call', async (req, res) => {
  const contact = contacts.find(c => c.id === req.body.contactId) ?? contacts[0]
  if (contact.dnd === 'blocked' || !contact.consent) return res.status(422).json({ error: 'Contact cannot be called because consent or DND checks failed.' })
  if (testMode) {
    const call: Call = { id: id('call'), contactId: contact.id, contact: contact.name, phone: contact.phone, startedAt: 'Just now', duration: '00:00', status: 'in_progress', outcome: 'pending', summary: 'Exotel test call simulation started for ARTH outreach. No external phone dialed.', transcript: [] }
    calls.unshift(call)
    return res.status(201).json({ call, testMode: true, provider })
  }
  if (!providerReady()) return res.status(503).json({ error: 'Live calling requires Exotel credentials, an approved ExoPhone, a public stream URL, and OPENAI_API_KEY.' })
  const body = new URLSearchParams({ From: contact.phone, CallerId: exotel.callerId, StreamUrl: streamUrl(), StreamType: 'bidirectional', Record: 'true', TimeLimit: String(agents[0]?.maxDuration ?? 300), ...(exotel.statusCallbackUrl ? { StatusCallback: exotel.statusCallbackUrl, 'StatusCallbackEvents[]': 'terminal' } : {}) })
  const primaryHost = ['sg', 'global', 'com'].includes(exotel.region) ? 'https://api.exotel.com' : 'https://api.in.exotel.com'
  const fallbackHost = primaryHost === 'https://api.exotel.com' ? 'https://api.in.exotel.com' : 'https://api.exotel.com'

  const callExotel = async (host: string) => {
    const response = await fetch(`${host}/v1/Accounts/${exotel.accountSid}/Calls/connect`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${exotel.apiKey}:${exotel.apiToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body
    })
    const raw = await response.text()
    const json = raw.trim().startsWith('{') ? JSON.parse(raw) as { Call?: { Sid?: string; Status?: string }; RestException?: { Message?: string } } : undefined
    const xmlValue = (tag: string) => raw.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'))?.[1]
    const error = json?.RestException?.Message ?? xmlValue('Message') ?? xmlValue('Error')
    return { response, json, xmlValue, error }
  }

  try {
    let result = await callExotel(primaryHost)
    if (result.response.status === 401) {
      const fallbackResult = await callExotel(fallbackHost)
      if (fallbackResult.response.ok || fallbackResult.response.status !== 401) {
        result = fallbackResult
      }
    }

    if (!result.response.ok) return res.status(result.response.status).json({ error: result.error ?? 'Exotel rejected the call request.' })
    const call: Call = { id: result.json?.Call?.Sid ?? result.xmlValue('Sid') ?? id('exotel'), contactId: contact.id, contact: contact.name, phone: contact.phone, startedAt: 'Just now', duration: '00:00', status: result.json?.Call?.Status ?? result.xmlValue('Status') ?? 'queued', outcome: 'pending', summary: 'Exotel call request accepted.', transcript: [] }
    calls.unshift(call)
    res.status(201).json({ call, testMode: false, provider })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error'
    console.error(`Exotel call request failed for ${contact.id}: ${reason}`)
    res.status(502).json({ error: 'Could not reach Exotel from this deployment.', detail: reason })
  }
})
app.get('/api/calls', (_req, res) => res.json({ calls }))
app.get('/api/calls/:id', (req, res) => { const call = calls.find(c => c.id === req.params.id); if (!call) return res.sendStatus(404); res.json({ call }) })
app.get('/api/leads', (_req, res) => res.json({ leads }))
app.get('/api/settings', (_req, res) => res.json({ settings }))
app.patch('/api/settings', (req, res) => {
  const patch = req.body as Partial<Settings>
  if (patch.publicWebhookUrl && !/^https:\/\//.test(patch.publicWebhookUrl)) return res.status(400).json({ error: 'Webhook URL must start with https://.' })
  Object.assign(settings, patch)
  res.json({ settings })
})
app.get('/api/leads/export.csv', (_req, res) => {
  res.type('text/csv')
  res.attachment('arth-leads.csv')
  res.send(['contact,phone,city,interest,callback,source', ...leads.map(l => [l.contact, l.phone, l.city, l.interest, l.callback, l.source].map(v => `"${v}"`).join(','))].join('\n'))
})
app.post('/api/test/calls/complete', (req, res) => {
  if (!testMode) return res.status(403).json({ error: 'Test endpoints are disabled.' })
  campaign.contacted = Math.min(campaign.contacted + 1, campaign.total)
  const event = { id: id('event'), receivedAt: new Date().toISOString(), payload: req.body }
  events.unshift(event)
  res.status(201).json({ event, ...payload() })
})
app.post('/api/webhooks/voice', (req, res) => { const event = { id: id('event'), receivedAt: new Date().toISOString(), payload: req.body }; events.unshift(event); res.status(202).json({ accepted: true, id: event.id }) })
app.post('/api/webhooks/exotel', (req, res) => { const event = { id: id('exotel-event'), receivedAt: new Date().toISOString(), payload: req.body }; events.unshift(event); res.status(202).json({ accepted: true, id: event.id }) })
app.get('/api/webhooks/events', (_req, res) => res.json({ events }))

function detectOutcome(messages: Array<{ role: string; text: string }>, reply: string): string {
  const text = (messages.map(m => m.text).join(' ') + ' ' + reply).toLowerCase()
  if (/callback|రేపు|సాయంత్రం|tomorrow|call back|later|schedule|next week|evening|morning|busy/.test(text)) return 'callback_requested'
  if (/not interested|వద్దు|no thanks|వద్దండి|stop calling|remove me|unsubscribe|don't call/.test(text)) return 'not_interested'
  if (/audit|strategy|demo|interested|yes|sure|pricing|cost|budget|website|reels|campaign|sign up|book|call me|సరే|ఆసక్తి|కొటేషన్/.test(text)) return 'interested'
  return 'in_progress'
}

app.post('/api/web-call/reply', async (req, res) => {
  const { messages = [], userName = 'Client', agentId = 'a-aditi' } = req.body as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; text: string }>
    userName?: string
    agentId?: string
  }
  const activeAgent = agents.find(a => a.id === agentId) ?? agents[0]
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.text ?? ''

  // Attempt OpenAI GPT if configured
  if (openai.apiKey) {
    try {
      const openAiMessages = [
        {
          role: 'system',
          content: `${activeAgent.prompt}\nThe prospect's name is ${userName}. Maintain natural, high-impact telephone pacing (1 to 2 short sentences max). Disclose you are an AI assistant from ARTH Marketing Media if asked.`
        },
        ...messages.slice(-8).map(m => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text
        }))
      ]

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${openai.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: openAiMessages,
          max_tokens: 160,
          temperature: 0.7
        })
      })

      if (aiResponse.ok) {
        const data = await aiResponse.json() as { choices?: Array<{ message?: { content?: string } }> }
        const reply = data.choices?.[0]?.message?.content?.trim()
        if (reply) {
          const outcome = detectOutcome(messages, reply)
          return res.json({ reply, outcome, agentName: activeAgent.name })
        }
      }
    } catch {
      // Continue to local conversation engine
    }
  }

  // Built-in intelligent conversation engine powered by ARTH knowledge (arth-mauve.vercel.app)
  const lower = lastUserMsg.toLowerCase()
  let reply = ''
  let outcome = 'in_progress'

  if (activeAgent.language === 'te-IN') {
    // Telugu conversational logic for Priya
    if (!lastUserMsg) {
      reply = `నమస్కారం ${userName} గారు! నేను ARTH Marketing Media నుండి ప్రియ మాట్లాడుతున్నాను. మీ వ్యాపారానికి ఎక్కువ మంది కస్టమర్లను మరియు సేల్స్‌ను తీసుకురావడంలో మేము సహాయం చేస్తాము.`
    } else if (/process|ప్రాసెస్|ఎలా|how|చేస్తారు/.test(lower)) {
      reply = 'మేము 4 దశల్లో పనిచేస్తాము: ఆడిట్, స్ట్రాటజీ, క్యాంపెయిన్ లాంచ్, మరియు స్కేలింగ్. కస్టమర్ లీడ్స్ మరియు ఆఫ్‌లైన్ సేల్స్ పెంచడమే మా లక్ష్యం.'
      outcome = 'interested'
    } else if (/cost|price|ధర|ఖర్చు|pricing|budget/.test(lower)) {
      reply = 'మేము ముందుగా మీ బిజినెస్ కి ఉచిత మార్కెటింగ్ ఆడిట్ అందిస్తాము. మీ బడ్జెట్ మరియు యూనిట్ ఎకనామిక్స్ కి తగిన విధంగా ప్లాన్స్ ఉంటాయి.'
      outcome = 'interested'
    } else if (/case studies|clients|ఎవరికి|ఎవరు|fit secrets|samadhai/.test(lower)) {
      reply = 'మేము ఫిట్‌నెస్ లో Fit Secrets, రియల్ ఎస్టేట్ లో Quantumrise Infra, మరియు సాఫ్ట్‌వేర్ లో Samadhai Tech వంటి ప్రముఖ బ్రాండ్స్ కి కంటెంట్, వెబ్‌సైట్స్ మరియు గ్రోత్ మేనేజ్ చేస్తున్నాము.'
      outcome = 'interested'
    } else if (/audit|demo|yes|sure|సరే|ఆసక్తి|interested|చెప్పండి|avunu/.test(lower)) {
      reply = 'చాలా సంతోషం! మా స్ట్రాటజీ టీమ్ మీకు ఉచిత మార్కెటింగ్ ఆడిట్ మరియు పూర్తి ప్లాన్ తో కనెక్ట్ అవుతారు. మీకు రేపు ఏ సమయంలో కాల్ మాట్లాడవచ్చు?'
      outcome = 'interested'
    } else if (/tomorrow|రేపు|evening|సాయంత్రం|morning|ఉదయం|తర్వాత/.test(lower)) {
      reply = 'ఖచ్చితంగా నోట్ చేసుకున్నాను! మా టీమ్ మీకు సరైన సమయంలో కాల్ చేస్తారు లేదా వాట్సాప్ (+91 9809987999) ద్వారా వివరాలు పంపుతారు. ధన్యవాదాలు!'
      outcome = 'callback_requested'
    } else if (/no|వద్దు|not interested|busy/.test(lower)) {
      reply = 'అర్థమైంది అండి. మీ సమయానికి ధన్యవాదాలు! భవిష్యత్తులో మీ బిజినెస్ గ్రోత్ కి ARTH Marketing Media ఎల్లప్పుడూ తోడుగా ఉంటుంది. హావ్ ఏ గ్రేట్ డే!'
      outcome = 'not_interested'
    } else {
      reply = 'మేము సోషల్ మీడియా, వీడియో రీల్స్, వెబ్‌సైట్స్ మరియు లోకల్ ఆఫ్‌లైన్ ప్రమోషన్స్ అన్నీ ఒకే చోట అందిస్తాము. మీకు మా ఉచిత ఆడిట్ బుక్ చేయమంటారా?'
    }
  } else {
    // English conversational engine for Aditi, Kabir, Dev, Rhea
    if (!lastUserMsg) {
      reply = activeAgent.firstMessage.replace('{name}', userName)
    } else if (/4-step|four step|process|how you work|methodology|how do you work/.test(lower)) {
      reply = 'Every ARTH engagement runs on our 4-step framework: 1. Audit funnel leaks, 2. Agree on unit economics & strategy, 3. Rapid campaign & landing page launch, and 4. Weekly testing to scale winners and cut what fails.'
      outcome = 'interested'
    } else if (/fit secrets|quantumrise|samadhai|acuity|case stud|portfolio|clients|track record/.test(lower)) {
      reply = 'We handle complete video shooting, Meta Ads, and SEO for Fit Secrets, designed and built portals for Quantumrise Infra and Samadhai Technologies, and run lead gen for Acuity Tax. Would you like our case study brief?'
      outcome = 'interested'
    } else if (/video|reel|creative|shooting|camera|content|shoot/.test(lower)) {
      reply = 'At ARTH, we handle end-to-end video production: shooting on-location product videos, high-converting Instagram reels, and performance ad creatives. Would you like to review sample reels?'
      outcome = 'interested'
    } else if (/tech|website|web|e-commerce|whatsapp|landing page|seo/.test(lower)) {
      reply = 'Our tech team builds ultra-fast business websites, custom catalogues, and automated WhatsApp integrations with clean SEO instrumentation from day one. Would you like a speed & conversion audit of your current site?'
      outcome = 'interested'
    } else if (/offline|store|shop|local|print|promotions|footfall/.test(lower)) {
      reply = 'We specialize in online + offline integration—driving footfall through shop promotions, local geo-targeted ads, outdoor concepts, and WhatsApp customer re-engagement.'
      outcome = 'interested'
    } else if (/audit|free audit|strategy call|complimentary/.test(lower)) {
      reply = 'We offer a complimentary marketing audit where we uncover leaks in your acquisition funnel and provide actionable next steps within 24 hours. What is the best phone or WhatsApp number for you?'
      outcome = 'interested'
    } else if (/cost|price|rates|pricing|fees|spend|budget/.test(lower)) {
      reply = 'Our pricing is customized to your channel unit economics and growth targets. We start with a complimentary audit, then align upfront on budgets and KPIs. Shall we schedule that 20-minute call?'
      outcome = 'interested'
    } else if (/whatsapp|contact|email|phone|reach/.test(lower)) {
      reply = 'You can reach ARTH directly via WhatsApp at +91 9809987999, email us at buildwitharth@gmail.com, or check out our work at arth-mauve.vercel.app.'
      outcome = 'interested'
    } else if (/yes|sure|ok|sounds good|interested|definitely|let's do it|lets do it/.test(lower)) {
      reply = 'Fantastic! Our strategy team will review your channels and follow up within 24 hours. Would tomorrow morning or afternoon suit you best for a quick strategy walkthrough?'
      outcome = 'interested'
    } else if (/tomorrow|later|next week|evening|morning|busy|callback|call me back/.test(lower)) {
      reply = 'Noted! We will schedule the callback accordingly and send a confirmation to your WhatsApp (+91 9809987999). Thank you for your time!'
      outcome = 'callback_requested'
    } else if (/no|not interested|stop|unsubscribe|don't want/.test(lower)) {
      reply = 'Understood! Thank you for your time. If you ever want to explore online or offline growth down the road, ARTH Marketing Media is always here. Have a great day!'
      outcome = 'not_interested'
    } else {
      reply = `Thanks for sharing. At ARTH, we help businesses get attention, generate enquiries, and grow across marketing, content, tech, and offline channels. Would you like to see how we can assist your brand?`
    }
  }

  res.json({ reply, outcome, agentName: activeAgent.name })
})

app.post('/api/web-call/complete', (req, res) => {
  const {
    duration = '01:12',
    transcript = [],
    contactName = 'Web Caller (ARTH Live Test)',
    phone = '+91 98099 87999',
    outcome = 'interested',
    summary = 'Interactive web voice call completed with real-time transcription.',
    agentName = 'Aditi'
  } = req.body as {
    duration?: string
    transcript?: Array<{ role: string; text: string }>
    contactName?: string
    phone?: string
    outcome?: string
    summary?: string
    agentName?: string
  }

  const callId = id('call')
  const newCall: Call = {
    id: callId,
    contactId: id('c'),
    contact: contactName,
    phone,
    startedAt: 'Just now',
    duration,
    status: 'completed',
    outcome,
    summary: `${summary} (Spoke with ${agentName} · ARTH Marketing Media)`,
    transcript
  }

  calls.unshift(newCall)
  campaign.contacted = Math.min(campaign.contacted + 1, campaign.total)

  if (outcome === 'interested' || outcome === 'callback_requested') {
    leads.unshift({
      id: id('lead'),
      contact: contactName,
      phone,
      city: 'Inbound Web Call',
      interest: outcome === 'interested' ? 'hot' : 'warm',
      callback: 'Upcoming today',
      source: `ARTH Voice Agent (${agentName})`
    })
  }

  res.status(201).json({ ok: true, call: newCall })
})

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
const indexHtml = path.join(distDir, 'index.html')

app.use(express.static(distDir))

const serveApp = (_req: express.Request, res: express.Response) => {
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml)
  }
  return res.status(200).send('ARTH Voice Agent server running (API online). UI build not found.')
}

app.get('/', serveApp)
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/exotel')) {
    return res.status(404).json({ error: 'Endpoint not found' })
  }
  return serveApp(req, res)
})

const server = createServer(app)
const exotelStreams = new WebSocketServer({ noServer: true })
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname !== '/exotel/media') return socket.destroy()
  exotelStreams.handleUpgrade(request, socket, head, stream => exotelStreams.emit('connection', stream, request))
})

exotelStreams.on('connection', exotelSocket => {
  if (!openaiReady()) return exotelSocket.close(1011, 'OpenAI is not configured')
  let streamSid = ''
  let customerName = 'there'
  let greeted = false
  const realtime = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(openai.model)}`, { headers: { Authorization: `Bearer ${openai.apiKey}` } })
  const close = () => { if (realtime.readyState === WebSocket.OPEN || realtime.readyState === WebSocket.CONNECTING) realtime.close(); if (exotelSocket.readyState === WebSocket.OPEN || exotelSocket.readyState === WebSocket.CONNECTING) exotelSocket.close() }
  realtime.on('open', () => realtime.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'], instructions: agents[0]?.prompt ?? 'You are Aditi from ARTH Marketing Media. Clearly disclose you are an AI assistant.', audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'server_vad' } }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: openai.voice } } } })))
  realtime.on('message', raw => { try { const message = JSON.parse(raw.toString()) as { type: string; delta?: string; error?: { message?: string } }; if (message.type === 'session.updated' && !greeted) { greeted = true; const greeting = (agents[0]?.firstMessage ?? 'Hello, I am an AI assistant from ARTH Marketing Media.').replace('{name}', customerName); realtime.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['audio'], instructions: `${agents[0]?.prompt ?? ''}\nOpen with this greeting exactly: ${greeting}` } })) } if (message.type === 'response.output_audio.delta' && message.delta && streamSid && exotelSocket.readyState === WebSocket.OPEN) exotelSocket.send(JSON.stringify({ event: 'media', stream_sid: streamSid, media: { payload: message.delta } })); if (message.type === 'error') console.error(`OpenAI Realtime error: ${message.error?.message ?? 'unknown error'}`) } catch { /* Ignore malformed provider frames. */ } })
  realtime.on('error', error => console.error(`OpenAI Realtime connection error: ${error.message}`))
  exotelSocket.on('message', raw => { try { const event = JSON.parse(raw.toString()) as { event: string; start?: { stream_sid?: string; from?: string }; media?: { payload?: string } }; if (event.event === 'start') { streamSid = event.start?.stream_sid ?? ''; customerName = event.start?.from ?? 'there' } if (event.event === 'media' && event.media?.payload && realtime.readyState === WebSocket.OPEN) realtime.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: event.media.payload })); if (event.event === 'stop') close() } catch { exotelSocket.close(1003, 'Invalid Exotel event') } })
  exotelSocket.on('close', () => { if (realtime.readyState === WebSocket.OPEN || realtime.readyState === WebSocket.CONNECTING) realtime.close() })
  exotelSocket.on('error', error => console.error(`Exotel stream error: ${error.message}`))
})

server.listen(port, host, () => console.log(`ARTH Voice Agent server listening on ${host}:${port} (${testMode ? 'test mode' : 'live mode'})`))
