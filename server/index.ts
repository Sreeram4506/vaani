import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const app = express()
const port = Number(process.env.PORT ?? 8787)
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
  region: process.env.EXOTEL_REGION === 'sg' ? 'sg' : 'in',
}
const openai = { apiKey: process.env.OPENAI_API_KEY ?? '', model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime', voice: process.env.OPENAI_REALTIME_VOICE ?? 'marin' }
app.use(cors())
app.use(express.json({ limit: '2mb' }))

type Contact = { id: string; name: string; phone: string; city: string; listName: string; consent: string; dnd: 'clear' | 'unknown' | 'blocked' }
type Agent = { id: string; name: string; language: string; voice: string; firstMessage: string; prompt: string; maxDuration: number }
type Call = { id: string; contactId: string; contact: string; phone: string; startedAt: string; duration: string; status: string; outcome: string; summary: string; transcript: Array<{ role: string; text: string }> }
type Lead = { id: string; contact: string; phone: string; city: string; interest: string; callback: string; source: string }
type Settings = { businessName: string; timezone: string; publicWebhookUrl: string; dndChecksEnabled: boolean; aiDisclosureEnabled: boolean }

const contacts: Contact[] = [
  { id: 'c-1', name: 'Ravi Kumar', phone: '+919848032451', city: 'Hyderabad', listName: 'October product demo', consent: 'Web form, 24 Oct 2026', dnd: 'clear' },
  { id: 'c-2', name: 'Sowmya Reddy', phone: '+919985199765', city: 'Warangal', listName: 'October product demo', consent: 'Facebook lead form, 25 Oct 2026', dnd: 'clear' },
  { id: 'c-3', name: 'M. Prakash', phone: '+919701027613', city: 'Vijayawada', listName: 'October product demo', consent: 'Website form, 21 Oct 2026', dnd: 'unknown' },
  { id: 'c-4', name: 'Anusha Devi', phone: '+919847651287', city: 'Guntur', listName: 'October product demo', consent: 'Referral, 23 Oct 2026', dnd: 'clear' },
]
const agents: Agent[] = [{ id: 'a-priya', name: 'Priya', language: 'te-IN', voice: 'Warm female', maxDuration: 300, firstMessage: 'నమస్కారం {name} గారు. నేను Sree Tech నుండి AI అసిస్టెంట్ ప్రియ మాట్లాడుతున్నాను.', prompt: 'Speak friendly, everyday Telugu mixed with common English. Say you are an AI assistant in the first line. Ask one short question at a time. Honour do-not-call requests immediately.' }]
const campaign = { id: 'demo-october-outreach', name: 'October product demo outreach', status: 'running' as 'running' | 'paused' | 'draft', agentId: 'a-priya', listName: 'October product demo', contacted: 219, total: 1000, maxConcurrent: 10, windowStart: '10:00', windowEnd: '19:00', attempts: 3 }
const calls: Call[] = [
  { id: 'call-1', contactId: 'c-1', contact: 'Ravi Kumar', phone: '+919848032451', startedAt: 'Today, 17:11', duration: '01:32', status: 'completed', outcome: 'interested', summary: 'Asked for a weekday demo. Prefers an evening callback.', transcript: [{ role: 'Priya', text: 'నమస్కారం రవి గారు. నేను Sree Tech నుండి AI అసిస్టెంట్ ప్రియ మాట్లాడుతున్నాను.' }, { role: 'Ravi', text: 'చెప్పండి, నేను వింటున్నాను.' }, { role: 'Priya', text: 'మా free demo గురించి కొంచెం తెలుసుకోవాలనే ఆసక్తి ఉందా?' }] },
  { id: 'call-2', contactId: 'c-2', contact: 'Sowmya Reddy', phone: '+919985199765', startedAt: 'Today, 16:46', duration: '00:48', status: 'completed', outcome: 'callback_requested', summary: 'Busy now. Asked for a callback tomorrow at 18:30.', transcript: [{ role: 'Priya', text: 'నమస్కారం సౌమ్య గారు.' }, { role: 'Sowmya', text: 'ఇప్పుడు busy గా ఉన్నాను. రేపు సాయంత్రం call చేయండి.' }] },
  { id: 'call-3', contactId: 'c-3', contact: 'M. Prakash', phone: '+919701027613', startedAt: 'Today, 16:05', duration: '00:18', status: 'completed', outcome: 'not_interested', summary: 'Not interested.', transcript: [{ role: 'Priya', text: 'నమస్కారం ప్రకాష్ గారు.' }, { role: 'Prakash', text: 'నాకు ఆసక్తి లేదు.' }] },
]
const leads: Lead[] = [
  { id: 'lead-1', contact: 'Ravi Kumar', phone: '+919848032451', city: 'Hyderabad', interest: 'hot', callback: '27 Oct, 18:00', source: 'Voice campaign' },
  { id: 'lead-2', contact: 'Sowmya Reddy', phone: '+919985199765', city: 'Warangal', interest: 'warm', callback: '27 Oct, 18:30', source: 'Voice campaign' },
]
const settings: Settings = { businessName: 'Sree Tech', timezone: 'Asia/Kolkata', publicWebhookUrl: '', dndChecksEnabled: true, aiDisclosureEnabled: true }
const events: Array<{ id: string; receivedAt: string; payload: unknown }> = []
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
const normalisePhone = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 10 ? `+91${digits}` : value.startsWith('+') ? `+${digits}` : `+${digits}` }
const openaiReady = () => Boolean(openai.apiKey)
const streamUrl = () => { try { const url = new URL(exotel.streamUrl); url.searchParams.set('sample-rate', '24000'); return url.toString() } catch { return '' } }
const providerReady = () => provider === 'exotel' && [exotel.accountSid, exotel.apiKey, exotel.apiToken, exotel.callerId, streamUrl()].every(Boolean) && openaiReady()
const payload = () => ({ testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign })

app.get('/api/health', (_req, res) => res.json({ ok: true, testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), realtimeModel: openai.model }))
app.get('/api/dashboard', (_req, res) => res.json({ testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign, metrics: { queued: Math.max(campaign.total - campaign.contacted, 0), inProgress: campaign.status === 'running' ? 8 : 0, connected: 146, leads: leads.length }, recentCalls: calls.slice(0, 5) }))
app.get('/api/contacts', (req, res) => { const search = String(req.query.search ?? '').toLowerCase(); res.json({ contacts: contacts.filter(c => !search || `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(search)) }) })
app.post('/api/contacts', (req, res) => { const { name, phone, city = '', listName = 'Imported contacts', consent = '', dnd = 'unknown' } = req.body as Partial<Contact>; if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' }); const normalised = normalisePhone(phone); if (contacts.some(c => c.phone === normalised)) return res.status(409).json({ error: 'This phone number already exists.' }); const contact: Contact = { id: id('c'), name, phone: normalised, city, listName, consent, dnd: dnd === 'blocked' ? 'blocked' : dnd === 'clear' ? 'clear' : 'unknown' }; contacts.unshift(contact); res.status(201).json({ contact }) })
app.post('/api/contacts/import', (req, res) => { const rows = Array.isArray(req.body?.contacts) ? req.body.contacts : []; let imported = 0; let skipped = 0; rows.forEach((row: Partial<Contact>) => { if (!row.name || !row.phone) { skipped++; return }; const phone = normalisePhone(row.phone); if (contacts.some(c => c.phone === phone)) { skipped++; return }; contacts.push({ id: id('c'), name: row.name, phone, city: row.city ?? '', listName: row.listName ?? 'Imported contacts', consent: row.consent ?? '', dnd: 'unknown' }); imported++ }); res.status(201).json({ imported, skipped }) })
app.patch('/api/contacts/:id', (req, res) => { const contact = contacts.find(c => c.id === req.params.id); if (!contact) return res.sendStatus(404); const { name, city, consent, dnd } = req.body as Partial<Contact>; if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' }); if (dnd !== undefined && !['clear', 'unknown', 'blocked'].includes(dnd)) return res.status(400).json({ error: 'Invalid DND status.' }); Object.assign(contact, { ...(name !== undefined ? { name: String(name).trim() } : {}), ...(city !== undefined ? { city: String(city) } : {}), ...(consent !== undefined ? { consent: String(consent) } : {}), ...(dnd !== undefined ? { dnd } : {}) }); res.json({ contact }) })
app.get('/api/agents', (_req, res) => res.json({ agents }))
app.post('/api/agents', (req, res) => { const agent: Agent = { id: id('a'), name: req.body.name || 'New agent', language: req.body.language || 'te-IN', voice: req.body.voice || 'Warm female', firstMessage: req.body.firstMessage || '', prompt: req.body.prompt || '', maxDuration: Number(req.body.maxDuration) || 300 }; agents.push(agent); res.status(201).json({ agent }) })
app.patch('/api/agents/:id', (req, res) => { const agent = agents.find(a => a.id === req.params.id); if (!agent) return res.sendStatus(404); const nextDuration = req.body.maxDuration === undefined ? agent.maxDuration : Number(req.body.maxDuration); if (!Number.isInteger(nextDuration) || nextDuration < 30 || nextDuration > 1800) return res.status(400).json({ error: 'Call length must be between 30 and 1800 seconds.' }); Object.assign(agent, { ...req.body, maxDuration: nextDuration }); res.json({ agent }) })
app.get('/api/campaigns', (_req, res) => res.json({ campaigns: [campaign] }))
app.get('/api/campaigns/demo', (_req, res) => res.json(payload()))
app.patch('/api/campaigns/demo', (req, res) => { const patch = req.body as Partial<typeof campaign>; const maxConcurrent = patch.maxConcurrent === undefined ? campaign.maxConcurrent : Number(patch.maxConcurrent); const attempts = patch.attempts === undefined ? campaign.attempts : Number(patch.attempts); if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 20) return res.status(400).json({ error: 'Parallel calls must be between 1 and 20.' }); if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) return res.status(400).json({ error: 'Attempts must be between 1 and 3.' }); if (patch.windowStart && patch.windowEnd && patch.windowStart >= patch.windowEnd) return res.status(400).json({ error: 'The calling window must end after it starts.' }); Object.assign(campaign, { ...patch, maxConcurrent, attempts }); res.json(payload()) })
app.post('/api/campaigns/demo/start', (_req, res) => { campaign.status = 'running'; res.json(payload()) })
app.post('/api/campaigns/demo/pause', (_req, res) => { campaign.status = 'paused'; res.json(payload()) })
app.post('/api/campaigns/demo/test-call', async (req, res) => { const contact = contacts.find(c => c.id === req.body.contactId) ?? contacts[0]; if (contact.dnd === 'blocked' || !contact.consent) return res.status(422).json({ error: 'Contact cannot be called because consent or DND checks failed.' }); if (testMode) { const call: Call = { id: id('call'), contactId: contact.id, contact: contact.name, phone: contact.phone, startedAt: 'Just now', duration: '00:00', status: 'in_progress', outcome: 'pending', summary: 'Exotel test call simulation started. No phone number was dialed.', transcript: [] }; calls.unshift(call); return res.status(201).json({ call, testMode: true, provider }) } if (!providerReady()) return res.status(503).json({ error: 'Live calling requires Exotel credentials, an approved ExoPhone, a public stream URL, and OPENAI_API_KEY.' }); const body = new URLSearchParams({ From: contact.phone, CallerId: exotel.callerId, StreamUrl: streamUrl(), StreamType: 'bidirectional', Record: 'true', TimeLimit: String(agents[0]?.maxDuration ?? 300), ...(exotel.statusCallbackUrl ? { StatusCallback: exotel.statusCallbackUrl, 'StatusCallbackEvents[]': 'terminal' } : {}) }); const host = exotel.region === 'in' ? 'https://api.in.exotel.com' : 'https://api.exotel.com'; try { const response = await fetch(`${host}/v1/Accounts/${exotel.accountSid}/Calls/connect`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${exotel.apiKey}:${exotel.apiToken}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body }); const data = await response.json() as { Call?: { Sid?: string; Status?: string }; RestException?: { Message?: string } }; if (!response.ok) return res.status(response.status).json({ error: data.RestException?.Message ?? 'Exotel rejected the call request.' }); const call: Call = { id: data.Call?.Sid ?? id('exotel'), contactId: contact.id, contact: contact.name, phone: contact.phone, startedAt: 'Just now', duration: '00:00', status: data.Call?.Status ?? 'queued', outcome: 'pending', summary: 'Exotel call request accepted.', transcript: [] }; calls.unshift(call); res.status(201).json({ call, testMode: false, provider }) } catch { res.status(502).json({ error: 'Could not reach Exotel. Check the configured region and network connection.' }) } })
app.get('/api/calls', (_req, res) => res.json({ calls }))
app.get('/api/calls/:id', (req, res) => { const call = calls.find(c => c.id === req.params.id); if (!call) return res.sendStatus(404); res.json({ call }) })
app.get('/api/leads', (_req, res) => res.json({ leads }))
app.get('/api/settings', (_req, res) => res.json({ settings }))
app.patch('/api/settings', (req, res) => { const patch = req.body as Partial<Settings>; if (patch.publicWebhookUrl && !/^https:\/\//.test(patch.publicWebhookUrl)) return res.status(400).json({ error: 'Webhook URL must start with https://.' }); Object.assign(settings, patch); res.json({ settings }) })
app.get('/api/leads/export.csv', (_req, res) => { res.type('text/csv'); res.attachment('vaanii-leads.csv'); res.send(['contact,phone,city,interest,callback,source', ...leads.map(l => [l.contact, l.phone, l.city, l.interest, l.callback, l.source].map(v => `"${v}"`).join(','))].join('\n')) })
app.post('/api/test/calls/complete', (req, res) => { if (!testMode) return res.status(403).json({ error: 'Test endpoints are disabled.' }); campaign.contacted = Math.min(campaign.contacted + 1, campaign.total); const event = { id: id('event'), receivedAt: new Date().toISOString(), payload: req.body }; events.unshift(event); res.status(201).json({ event, ...payload() }) })
app.post('/api/webhooks/voice', (req, res) => { const event = { id: id('event'), receivedAt: new Date().toISOString(), payload: req.body }; events.unshift(event); res.status(202).json({ accepted: true, id: event.id }) })
app.post('/api/webhooks/exotel', (req, res) => { const event = { id: id('exotel-event'), receivedAt: new Date().toISOString(), payload: req.body }; events.unshift(event); res.status(202).json({ accepted: true, id: event.id }) })
app.get('/api/webhooks/events', (_req, res) => res.json({ events }))

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
app.use(express.static(distDir))
app.get('/', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))

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
  realtime.on('open', () => realtime.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'], instructions: agents[0]?.prompt ?? 'You are a helpful Telugu voice assistant. Clearly disclose that you are an AI assistant.', audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'server_vad' } }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: openai.voice } } } })))
  realtime.on('message', raw => { try { const message = JSON.parse(raw.toString()) as { type: string; delta?: string; error?: { message?: string } }; if (message.type === 'session.updated' && !greeted) { greeted = true; const greeting = (agents[0]?.firstMessage ?? 'Hello, I am an AI assistant.').replace('{name}', customerName); realtime.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['audio'], instructions: `${agents[0]?.prompt ?? ''}\nOpen with this greeting exactly: ${greeting}` } })) } if (message.type === 'response.output_audio.delta' && message.delta && streamSid && exotelSocket.readyState === WebSocket.OPEN) exotelSocket.send(JSON.stringify({ event: 'media', stream_sid: streamSid, media: { payload: message.delta } })); if (message.type === 'error') console.error(`OpenAI Realtime error: ${message.error?.message ?? 'unknown error'}`) } catch { /* Ignore malformed provider frames. */ } })
  realtime.on('error', error => console.error(`OpenAI Realtime connection error: ${error.message}`))
  exotelSocket.on('message', raw => { try { const event = JSON.parse(raw.toString()) as { event: string; start?: { stream_sid?: string; from?: string }; media?: { payload?: string } }; if (event.event === 'start') { streamSid = event.start?.stream_sid ?? ''; customerName = event.start?.from ?? 'there' } if (event.event === 'media' && event.media?.payload && realtime.readyState === WebSocket.OPEN) realtime.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: event.media.payload })); if (event.event === 'stop') close() } catch { exotelSocket.close(1003, 'Invalid Exotel event') } })
  exotelSocket.on('close', () => { if (realtime.readyState === WebSocket.OPEN || realtime.readyState === WebSocket.CONNECTING) realtime.close() })
  exotelSocket.on('error', error => console.error(`Exotel stream error: ${error.message}`))
})

server.listen(port, host, () => console.log(`Vaanii server listening on ${host}:${port} (${testMode ? 'test mode' : 'live mode'})`))
