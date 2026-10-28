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

// ─── Types ──────────────────────────────────────────────

type Organization = {
  id: string; name: string; slug: string; initials: string; industry: string
  plan: 'starter' | 'growth' | 'enterprise'; status: 'active' | 'trial' | 'suspended'
  createdAt: string; contactEmail: string; contactPhone: string; website: string
  color: string; maxAgents: number; maxContacts: number; monthlyMinutes: number; usedMinutes: number
}
type Contact = { id: string; name: string; phone: string; city: string; listName: string; consent: string; dnd: 'clear' | 'unknown' | 'blocked' }
type Agent = { id: string; name: string; language: string; voice: string; firstMessage: string; prompt: string; maxDuration: number }
type Campaign = { id: string; name: string; status: 'running' | 'paused' | 'draft'; agentId: string; listName: string; contacted: number; total: number; maxConcurrent: number; windowStart: string; windowEnd: string; attempts: number }
type Call = { id: string; contactId: string; contact: string; phone: string; startedAt: string; duration: string; status: string; outcome: string; summary: string; transcript: Array<{ role: string; text: string }> }
type Lead = { id: string; contact: string; phone: string; city: string; interest: string; callback: string; source: string }
type Settings = { businessName: string; timezone: string; publicWebhookUrl: string; dndChecksEnabled: boolean; aiDisclosureEnabled: boolean }
type OrgStore = { org: Organization; contacts: Contact[]; agents: Agent[]; campaigns: Campaign[]; calls: Call[]; leads: Lead[]; settings: Settings }

// ─── Helpers ────────────────────────────────────────────

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
const normalisePhone = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 10 ? `+91${digits}` : value.startsWith('+') ? `+${digits}` : `+${digits}` }
const openaiReady = () => Boolean(openai.apiKey)
const streamUrl = () => { try { const url = new URL(exotel.streamUrl); url.searchParams.set('sample-rate', '24000'); return url.toString() } catch { return '' } }
const providerReady = () => provider === 'exotel' && [exotel.accountSid, exotel.apiKey, exotel.apiToken, exotel.callerId, streamUrl()].every(Boolean) && openaiReady()
const events: Array<{ id: string; receivedAt: string; payload: unknown }> = []
const planLimits = (plan: string) => ({
  maxAgents: plan === 'enterprise' ? 100 : plan === 'growth' ? 10 : 3,
  maxContacts: plan === 'enterprise' ? 100000 : plan === 'growth' ? 5000 : 500,
  monthlyMinutes: plan === 'enterprise' ? 50000 : plan === 'growth' ? 2000 : 500,
})

// ─── Multi-Tenant Store ─────────────────────────────────

const orgs = new Map<string, OrgStore>()

// ── 1. ARTH Marketing Media ─────────────────────────────

orgs.set('org-arth', {
  org: {
    id: 'org-arth', name: 'ARTH Marketing Media', slug: 'arth', initials: 'AR', industry: 'Marketing & Advertising',
    plan: 'enterprise', status: 'active', createdAt: '2026-06-15T00:00:00Z',
    contactEmail: 'buildwitharth@gmail.com', contactPhone: '+919809987999', website: 'https://arth-mauve.vercel.app/',
    color: '#4659b8', maxAgents: 100, maxContacts: 100000, monthlyMinutes: 50000, usedMinutes: 4280
  },
  contacts: [
    { id: 'c-1', name: 'Rahul Sharma (Fit Secrets)', phone: '+919848032451', city: 'Hyderabad', listName: 'High-Growth Brands & D2C', consent: 'Inbound inquiry, 24 Oct 2026', dnd: 'clear' },
    { id: 'c-2', name: 'Suresh Reddy (Quantumrise Infra)', phone: '+919985199765', city: 'Bangalore', listName: 'Real Estate & Plotted Communities', consent: 'Website audit request, 25 Oct 2026', dnd: 'clear' },
    { id: 'c-3', name: 'Ananya Rao (Samadhai Technologies)', phone: '+919701027613', city: 'Hyderabad', listName: 'Enterprise Software & SaaS', consent: 'Strategy call form, 21 Oct 2026', dnd: 'clear' },
    { id: 'c-4', name: 'Vikram Joshi (Acuity Tax)', phone: '+919847651287', city: 'Hyderabad', listName: 'Tax, Legal & Compliance', consent: 'Referral, 23 Oct 2026', dnd: 'clear' },
    { id: 'c-5', name: 'Deepika Verma (Urban Stores)', phone: '+919809987111', city: 'Bangalore', listName: 'Retail & Store Promotions', consent: 'WhatsApp campaign opt-in, 26 Oct 2026', dnd: 'clear' },
  ],
  agents: [
    {
      id: 'a-aditi', name: 'Aditi', language: 'en-IN', voice: 'Warm female', maxDuration: 300,
      firstMessage: 'Hi {name}! This is Aditi from ARTH Marketing Media. We help businesses uncover bottlenecks in their customer acquisition funnel and scale with Meta and Google Ads. Are you looking to generate more qualified leads or scale your ad spend this quarter?',
      prompt: `You are Aditi, Senior Growth Strategist at ARTH Marketing Media (arth-mauve.vercel.app).\nCompany Overview:\n- ARTH stands for Marketing, Content, and Technology.\n- Proven 4-Step Process: 1. Audit 2. Strategy 3. Launch 4. Scale\n- Services: Meta Ads, Google Ads, Lead Generation, Social Media, Influencer Marketing, Local SEO.\n- Case Study: Fit Secrets — complete content and growth partner.\n- CTA: Offer complimentary marketing audit. WhatsApp +91 9809987999 or buildwitharth@gmail.com.\nTone: Concise, strategic, warm.`
    },
    {
      id: 'a-kabir', name: 'Kabir', language: 'en-IN', voice: 'Clear male', maxDuration: 300,
      firstMessage: 'Hey {name}! Kabir here from ARTH. We produce high-converting short-form videos, reels, and product ad creatives—like our ongoing work with Fit Secrets. How is your brand currently approaching video content?',
      prompt: `You are Kabir, Creative & Video Producer at ARTH Marketing Media.\nExpertise: Reels, product video shoots, performance ad creatives, campaign scripting.\nCase Study: Fit Secrets — shoots, edits, social media, ad creatives.\nCTA: Invite to review portfolio or schedule brainstorm via WhatsApp +91 9809987999.\nTone: Energetic, creative, direct.`
    },
    {
      id: 'a-dev', name: 'Dev', language: 'en-IN', voice: 'Calm male', maxDuration: 300,
      firstMessage: 'Hello {name}! Dev from ARTH Technology. We design and build ultra-fast business websites, e-commerce stores, and custom WhatsApp integrations. Is your team looking to upgrade your web presence?',
      prompt: `You are Dev, Technology & Web Solutions Lead at ARTH Marketing Media.\nOfferings: Websites, e-commerce, landing pages, WhatsApp API integration, SEO.\nCase Studies: Quantumrise Infra (real estate), Samadhai Technologies (AI), Acuity Tax (finance).\nCTA: Offer free website speed & SEO diagnostic. WhatsApp +91 9809987999.\nTone: Knowledgeable, consultative.`
    },
    {
      id: 'a-priya', name: 'Priya', language: 'te-IN', voice: 'Warm female', maxDuration: 300,
      firstMessage: 'నమస్కారం {name} గారు! నేను ARTH Marketing Media నుండి ప్రియ మాట్లాడుతున్నాను. మీ వ్యాపారానికి ఆన్‌లైన్ సోషల్ మీడియా మరియు ఆఫ్‌లైన్ ప్రమోషన్స్ ద్వారా ఎక్కువ మంది కస్టమర్లను తీసుకురావడంలో మేము సహాయం చేస్తాము.',
      prompt: `You are Priya, Local & Regional Outreach Specialist at ARTH Marketing Media.\nLanguage: Fluent Telugu mixed with English terms.\nExpertise: Offline growth, local promotions, shop/store promotions, event marketing, online+offline integration.\nCase Studies: Fit Secrets, Quantumrise Infra, Samadhai Technologies, Acuity Tax.\nContact: WhatsApp +91 9809987999.\nTone: Respectful, conversational Telugu.`
    },
    {
      id: 'a-rhea', name: 'Rhea', language: 'en-IN', voice: 'Calm female', maxDuration: 300,
      firstMessage: 'Hi {name}! Rhea from ARTH Marketing Media. We offer complimentary marketing audits for qualified brands to pinpoint where growth is leaking. Would you like to review your current growth bottlenecks?',
      prompt: `You are Rhea, Inbound Growth & Marketing Audit Specialist at ARTH Marketing Media.\nRole: Rapid diagnostic of acquisition funnels. Explain ARTH's 4 pillars: Marketing, Reels & Video, Technology, Offline Growth.\nCite track record: Fitness, Real Estate, Tech, Finance.\nCTA: Book a strategy call. WhatsApp +91 9809987999.\nTone: Warm, executive, articulate.`
    }
  ],
  campaigns: [{
    id: 'arth-q4-growth-audit', name: 'ARTH Q4 Brand Growth & Marketing Audit', status: 'running', agentId: 'a-aditi',
    listName: 'High-Growth Brands & Local Businesses', contacted: 248, total: 1000, maxConcurrent: 10, windowStart: '10:00', windowEnd: '19:00', attempts: 3
  }],
  calls: [
    { id: 'call-1', contactId: 'c-1', contact: 'Rahul Sharma (Fit Secrets)', phone: '+919848032451', startedAt: 'Today, 17:11', duration: '01:32', status: 'completed', outcome: 'interested', summary: 'Discussed scaling Q4 Meta Ads and scheduling a new product video shoot.', transcript: [{ role: 'Aditi', text: 'Hi Rahul! Following up on your Q4 growth goals.' }, { role: 'Rahul', text: 'Our Instagram reels are performing well, but we want to scale Meta Ads.' }, { role: 'Aditi', text: 'We can run an audit on your ad creative CTRs and set up a dedicated video shoot next week.' }] },
    { id: 'call-2', contactId: 'c-2', contact: 'Suresh Reddy (Quantumrise Infra)', phone: '+919985199765', startedAt: 'Today, 16:46', duration: '01:15', status: 'completed', outcome: 'interested', summary: 'Reviewed website traffic and Google Ads for Bangalore plotted communities.', transcript: [{ role: 'Dev', text: 'Hello Suresh! Checking in on your website conversion rates.' }, { role: 'Suresh', text: 'The site is clean. We want targeted Google Ads.' }, { role: 'Dev', text: 'We can audit your landing page conversion rate and map unit economics.' }] },
    { id: 'call-3', contactId: 'c-3', contact: 'Ananya Rao (Samadhai Technologies)', phone: '+919701027613', startedAt: 'Today, 16:05', duration: '00:48', status: 'completed', outcome: 'callback_requested', summary: 'In an engineering sprint. Callback tomorrow at 18:30.', transcript: [{ role: 'Dev', text: 'Hi Ananya! Dev here from ARTH.' }, { role: 'Ananya', text: 'Heading into a sprint. Can we talk tomorrow at 6:30 PM?' }] },
    { id: 'call-4', contactId: 'c-5', contact: 'Deepika Verma (Urban Stores)', phone: '+919809987111', startedAt: 'Today, 15:20', duration: '01:40', status: 'completed', outcome: 'interested', summary: 'Inquired about offline promotional campaigns and WhatsApp integration.', transcript: [{ role: 'Priya', text: 'నమస్కారం దీపిక గారు! ARTH నుండి ప్రియ.' }, { role: 'Deepika', text: 'మా స్టోర్ కి ఫుట్‌ఫాల్ పెంచాలి.' }, { role: 'Priya', text: 'ఇన్‌స్టాగ్రామ్ యాడ్స్ + లోకల్ ప్రమోషన్స్ ప్లాన్ చేస్తాము.' }] }
  ],
  leads: [
    { id: 'lead-1', contact: 'Rahul Sharma (Fit Secrets)', phone: '+919848032451', city: 'Hyderabad', interest: 'hot', callback: '28 Oct, 18:00', source: 'Meta Ads & Reels Outreach' },
    { id: 'lead-2', contact: 'Suresh Reddy (Quantumrise Infra)', phone: '+919985199765', city: 'Bangalore', interest: 'hot', callback: '28 Oct, 16:30', source: 'Real Estate Web & SEO' },
    { id: 'lead-3', contact: 'Ananya Rao (Samadhai Technologies)', phone: '+919701027613', city: 'Hyderabad', interest: 'warm', callback: '29 Oct, 18:30', source: 'Enterprise Platform Revamp' },
    { id: 'lead-4', contact: 'Deepika Verma (Urban Stores)', phone: '+919809987111', city: 'Bangalore', interest: 'hot', callback: '29 Oct, 15:00', source: 'Offline + Online Retail' }
  ],
  settings: { businessName: 'ARTH Marketing Media', timezone: 'Asia/Kolkata', publicWebhookUrl: '', dndChecksEnabled: true, aiDisclosureEnabled: true }
})

// ── 2. MedPulse Healthcare ──────────────────────────────

orgs.set('org-medpulse', {
  org: {
    id: 'org-medpulse', name: 'MedPulse Healthcare', slug: 'medpulse', initials: 'MP', industry: 'Healthcare',
    plan: 'growth', status: 'active', createdAt: '2026-07-22T00:00:00Z',
    contactEmail: 'ops@medpulse.in', contactPhone: '+919876001234', website: 'https://medpulse.in',
    color: '#2e8b6e', maxAgents: 10, maxContacts: 5000, monthlyMinutes: 2000, usedMinutes: 1450
  },
  contacts: [
    { id: 'mp-c1', name: 'Sanjay Kumar', phone: '+919845001111', city: 'Hyderabad', listName: 'Patient Follow-up', consent: 'Registration form, 20 Oct 2026', dnd: 'clear' },
    { id: 'mp-c2', name: 'Preethi Nair', phone: '+919845002222', city: 'Chennai', listName: 'Appointment Reminders', consent: 'App consent, 18 Oct 2026', dnd: 'clear' },
    { id: 'mp-c3', name: 'Ramesh Iyer', phone: '+919845003333', city: 'Bangalore', listName: 'Insurance Queries', consent: 'Phone consent, 22 Oct 2026', dnd: 'clear' },
  ],
  agents: [
    { id: 'mp-a1', name: 'Dr. Maya', language: 'en-IN', voice: 'Calm female', maxDuration: 300, firstMessage: 'Hello {name}, this is Dr. Maya from MedPulse Healthcare. I am calling to help you schedule your upcoming appointment or answer any health queries.', prompt: 'You are Dr. Maya, an AI appointment scheduler for MedPulse Healthcare. Help patients book, reschedule, or cancel appointments. Be empathetic and professional.' },
    { id: 'mp-a2', name: 'Arjun', language: 'en-IN', voice: 'Clear male', maxDuration: 300, firstMessage: 'Hi {name}, Arjun here from MedPulse. Just following up on your recent visit to ensure your recovery is going well.', prompt: 'You are Arjun, a patient follow-up coordinator at MedPulse Healthcare. Check on patients after visits, remind them about medication, and schedule follow-ups.' },
    { id: 'mp-a3', name: 'Neha', language: 'en-IN', voice: 'Warm female', maxDuration: 300, firstMessage: 'Hello {name}, this is Neha from MedPulse. I can help you with any insurance or billing queries related to your treatment.', prompt: 'You are Neha, insurance and billing specialist at MedPulse Healthcare. Help patients understand their coverage, claims status, and billing questions.' },
  ],
  campaigns: [{ id: 'mp-camp1', name: 'Patient Follow-up Q4', status: 'running', agentId: 'mp-a2', listName: 'Patient Follow-up', contacted: 312, total: 800, maxConcurrent: 5, windowStart: '09:00', windowEnd: '17:00', attempts: 2 }],
  calls: [
    { id: 'mp-call1', contactId: 'mp-c1', contact: 'Sanjay Kumar', phone: '+919845001111', startedAt: 'Today, 14:20', duration: '01:05', status: 'completed', outcome: 'interested', summary: 'Scheduled follow-up appointment for next Tuesday.', transcript: [{ role: 'Dr. Maya', text: 'Hello Sanjay, this is Dr. Maya from MedPulse.' }, { role: 'Sanjay', text: 'Hi, I need to reschedule my check-up.' }] },
    { id: 'mp-call2', contactId: 'mp-c2', contact: 'Preethi Nair', phone: '+919845002222', startedAt: 'Today, 11:30', duration: '00:52', status: 'completed', outcome: 'callback_requested', summary: 'Patient requested callback after 5 PM.', transcript: [{ role: 'Arjun', text: 'Hi Preethi, following up on your visit.' }, { role: 'Preethi', text: 'Can you call back after 5?' }] },
  ],
  leads: [
    { id: 'mp-l1', contact: 'Sanjay Kumar', phone: '+919845001111', city: 'Hyderabad', interest: 'hot', callback: '29 Oct, 10:00', source: 'Follow-up Appointment' },
    { id: 'mp-l2', contact: 'Preethi Nair', phone: '+919845002222', city: 'Chennai', interest: 'warm', callback: '28 Oct, 17:00', source: 'Post-visit Check' },
  ],
  settings: { businessName: 'MedPulse Healthcare', timezone: 'Asia/Kolkata', publicWebhookUrl: '', dndChecksEnabled: true, aiDisclosureEnabled: true }
})

// ── 3. Zenith Properties ────────────────────────────────

orgs.set('org-zenith', {
  org: {
    id: 'org-zenith', name: 'Zenith Properties', slug: 'zenith', initials: 'ZP', industry: 'Real Estate',
    plan: 'enterprise', status: 'active', createdAt: '2026-05-10T00:00:00Z',
    contactEmail: 'sales@zenithprop.com', contactPhone: '+919900112233', website: 'https://zenithproperties.in',
    color: '#b85846', maxAgents: 100, maxContacts: 100000, monthlyMinutes: 50000, usedMinutes: 3100
  },
  contacts: [
    { id: 'zp-c1', name: 'Aditya Mehta', phone: '+919900221100', city: 'Bangalore', listName: 'Villa Prospects', consent: 'Website form, 19 Oct 2026', dnd: 'clear' },
    { id: 'zp-c2', name: 'Kavitha Rao', phone: '+919900331100', city: 'Hyderabad', listName: 'Plot Buyers', consent: 'WhatsApp opt-in, 20 Oct 2026', dnd: 'clear' },
    { id: 'zp-c3', name: 'Nikhil Gupta', phone: '+919900441100', city: 'Mumbai', listName: 'Premium Apartments', consent: 'Referral, 21 Oct 2026', dnd: 'clear' },
  ],
  agents: [
    { id: 'zp-a1', name: 'Rohan', language: 'en-IN', voice: 'Clear male', maxDuration: 300, firstMessage: 'Hello {name}! Rohan from Zenith Properties. We have premium plotted communities and villas across South India. Are you exploring investment opportunities?', prompt: 'You are Rohan, Property Inquiry Specialist at Zenith Properties. Help prospects learn about available plots, villas, pricing and locations. Be knowledgeable about real estate trends.' },
    { id: 'zp-a2', name: 'Meera', language: 'en-IN', voice: 'Warm female', maxDuration: 300, firstMessage: 'Hi {name}! Meera from Zenith Properties. I can help you schedule a site visit to any of our ongoing projects. When would be convenient?', prompt: 'You are Meera, Site Visit Coordinator at Zenith Properties. Schedule site visits, provide directions, and share project details.' },
    { id: 'zp-a3', name: 'Anil', language: 'en-IN', voice: 'Calm male', maxDuration: 300, firstMessage: 'Hello {name}, Anil from Zenith Properties. I specialize in home loan assistance and can help you understand financing options for your property purchase.', prompt: 'You are Anil, Home Loan Specialist at Zenith Properties. Help buyers understand EMI options, loan eligibility, and documentation.' },
  ],
  campaigns: [{ id: 'zp-camp1', name: 'Festive Season Plot Launch', status: 'running', agentId: 'zp-a1', listName: 'Villa Prospects', contacted: 420, total: 1500, maxConcurrent: 12, windowStart: '10:00', windowEnd: '20:00', attempts: 3 }],
  calls: [
    { id: 'zp-call1', contactId: 'zp-c1', contact: 'Aditya Mehta', phone: '+919900221100', startedAt: 'Today, 15:45', duration: '02:10', status: 'completed', outcome: 'interested', summary: 'Interested in East Bangalore villa plots. Site visit scheduled.', transcript: [{ role: 'Rohan', text: 'Hello Aditya! Rohan from Zenith Properties.' }, { role: 'Aditya', text: 'I saw your Sarjapur Road project. What is the pricing?' }] },
    { id: 'zp-call2', contactId: 'zp-c2', contact: 'Kavitha Rao', phone: '+919900331100', startedAt: 'Today, 14:10', duration: '01:28', status: 'completed', outcome: 'interested', summary: 'Exploring plots near Hyderabad ORR. Requested brochure.', transcript: [{ role: 'Meera', text: 'Hi Kavitha! Meera from Zenith Properties.' }, { role: 'Kavitha', text: 'What options do you have near the ORR?' }] },
  ],
  leads: [
    { id: 'zp-l1', contact: 'Aditya Mehta', phone: '+919900221100', city: 'Bangalore', interest: 'hot', callback: '30 Oct, 10:00', source: 'Villa Plot Inquiry' },
    { id: 'zp-l2', contact: 'Kavitha Rao', phone: '+919900331100', city: 'Hyderabad', interest: 'hot', callback: '29 Oct, 14:00', source: 'Plot Brochure Request' },
  ],
  settings: { businessName: 'Zenith Properties', timezone: 'Asia/Kolkata', publicWebhookUrl: '', dndChecksEnabled: true, aiDisclosureEnabled: true }
})

// ── 4. CloudStack Technologies ──────────────────────────

orgs.set('org-cloudstack', {
  org: {
    id: 'org-cloudstack', name: 'CloudStack Technologies', slug: 'cloudstack', initials: 'CS', industry: 'SaaS & Technology',
    plan: 'starter', status: 'trial', createdAt: '2026-10-05T00:00:00Z',
    contactEmail: 'hello@cloudstack.dev', contactPhone: '+919822110055', website: 'https://cloudstack.dev',
    color: '#8b46b8', maxAgents: 3, maxContacts: 500, monthlyMinutes: 500, usedMinutes: 180
  },
  contacts: [
    { id: 'cs-c1', name: 'Farid Sheikh', phone: '+919822001100', city: 'Pune', listName: 'Demo Requests', consent: 'Website demo form, 25 Oct 2026', dnd: 'clear' },
    { id: 'cs-c2', name: 'Sneha Kulkarni', phone: '+919822002200', city: 'Mumbai', listName: 'Support Tickets', consent: 'Product signup, 23 Oct 2026', dnd: 'clear' },
  ],
  agents: [
    { id: 'cs-a1', name: 'Alex', language: 'en-IN', voice: 'Calm male', maxDuration: 300, firstMessage: 'Hello {name}, Alex from CloudStack Technologies. How can I help you with our platform today?', prompt: 'You are Alex, Technical Support at CloudStack Technologies, a SaaS platform. Help users troubleshoot issues, explain features, and escalate complex problems.' },
    { id: 'cs-a2', name: 'Ravi', language: 'en-IN', voice: 'Clear male', maxDuration: 300, firstMessage: 'Hi {name}! Ravi from CloudStack. I saw you requested a product demo. Let me walk you through how we can help your team.', prompt: 'You are Ravi, Sales Demo Specialist at CloudStack Technologies. Conduct product demos, explain pricing tiers, and help prospects evaluate the platform.' },
  ],
  campaigns: [{ id: 'cs-camp1', name: 'Q4 Product Demo Outreach', status: 'paused', agentId: 'cs-a2', listName: 'Demo Requests', contacted: 45, total: 200, maxConcurrent: 3, windowStart: '10:00', windowEnd: '18:00', attempts: 2 }],
  calls: [
    { id: 'cs-call1', contactId: 'cs-c1', contact: 'Farid Sheikh', phone: '+919822001100', startedAt: 'Today, 12:30', duration: '01:45', status: 'completed', outcome: 'interested', summary: 'Interested in enterprise plan. Demo scheduled for Friday.', transcript: [{ role: 'Ravi', text: 'Hi Farid! Ravi from CloudStack.' }, { role: 'Farid', text: 'We need a solution for 200+ team members.' }] },
  ],
  leads: [
    { id: 'cs-l1', contact: 'Farid Sheikh', phone: '+919822001100', city: 'Pune', interest: 'hot', callback: '31 Oct, 11:00', source: 'Enterprise Demo Request' },
  ],
  settings: { businessName: 'CloudStack Technologies', timezone: 'Asia/Kolkata', publicWebhookUrl: '', dndChecksEnabled: true, aiDisclosureEnabled: true }
})

// ── 5. FreshBasket ──────────────────────────────────────

orgs.set('org-freshbasket', {
  org: {
    id: 'org-freshbasket', name: 'FreshBasket', slug: 'freshbasket', initials: 'FB', industry: 'Food & Beverage',
    plan: 'growth', status: 'active', createdAt: '2026-08-01T00:00:00Z',
    contactEmail: 'support@freshbasket.co.in', contactPhone: '+914422003300', website: 'https://freshbasket.co.in',
    color: '#b89246', maxAgents: 10, maxContacts: 5000, monthlyMinutes: 2000, usedMinutes: 890
  },
  contacts: [
    { id: 'fb-c1', name: 'Aruna Devi', phone: '+914422111100', city: 'Chennai', listName: 'Loyalty Members', consent: 'App registration, 22 Oct 2026', dnd: 'clear' },
    { id: 'fb-c2', name: 'Mohan Raj', phone: '+914422222200', city: 'Coimbatore', listName: 'Franchise Leads', consent: 'Franchise form, 24 Oct 2026', dnd: 'clear' },
  ],
  agents: [
    { id: 'fb-a1', name: 'Lakshmi', language: 'en-IN', voice: 'Warm female', maxDuration: 300, firstMessage: 'Hello {name}! Lakshmi from FreshBasket. I can help you with your recent order, delivery tracking, or any product queries.', prompt: 'You are Lakshmi, Customer Support at FreshBasket, an online grocery chain. Help customers with orders, deliveries, returns, and product availability.' },
    { id: 'fb-a2', name: 'Kiran', language: 'en-IN', voice: 'Clear male', maxDuration: 300, firstMessage: 'Hi {name}! Kiran from FreshBasket Franchise Division. Interested in owning a FreshBasket store in your city? Let me share the details.', prompt: 'You are Kiran, Franchise Development Manager at FreshBasket. Explain franchise models, investment requirements, ROI projections, and territory availability.' },
  ],
  campaigns: [{ id: 'fb-camp1', name: 'Diwali Loyalty Promo', status: 'running', agentId: 'fb-a1', listName: 'Loyalty Members', contacted: 189, total: 600, maxConcurrent: 6, windowStart: '09:00', windowEnd: '18:00', attempts: 2 }],
  calls: [
    { id: 'fb-call1', contactId: 'fb-c1', contact: 'Aruna Devi', phone: '+914422111100', startedAt: 'Today, 10:15', duration: '01:02', status: 'completed', outcome: 'interested', summary: 'Excited about Diwali hamper offer. Placed pre-order.', transcript: [{ role: 'Lakshmi', text: 'Hello Aruna! Lakshmi from FreshBasket.' }, { role: 'Aruna', text: 'What is the Diwali offer on premium hampers?' }] },
  ],
  leads: [
    { id: 'fb-l1', contact: 'Aruna Devi', phone: '+914422111100', city: 'Chennai', interest: 'hot', callback: '28 Oct, 11:00', source: 'Diwali Promo' },
    { id: 'fb-l2', contact: 'Mohan Raj', phone: '+914422222200', city: 'Coimbatore', interest: 'warm', callback: '30 Oct, 15:00', source: 'Franchise Inquiry' },
  ],
  settings: { businessName: 'FreshBasket', timezone: 'Asia/Kolkata', publicWebhookUrl: '', dndChecksEnabled: true, aiDisclosureEnabled: true }
})

// ─── Health ─────────────────────────────────────────────

const healthHandler = (_req: express.Request, res: express.Response) => res.json({ ok: true, platform: 'Vaani Voice AI', testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), realtimeModel: openai.model })
app.get('/api/health', healthHandler)
app.get('/health', healthHandler)
app.get('/healthz', healthHandler)

// ─── Platform API ───────────────────────────────────────

app.get('/api/platform/overview', (_req, res) => {
  const all = Array.from(orgs.values())
  const planRevenue: Record<string, number> = { starter: 299, growth: 799, enterprise: 1999 }
  res.json({
    totalOrganizations: all.length,
    activeOrganizations: all.filter(o => o.org.status === 'active').length,
    trialOrganizations: all.filter(o => o.org.status === 'trial').length,
    suspendedOrganizations: all.filter(o => o.org.status === 'suspended').length,
    totalCalls: all.reduce((s, o) => s + o.calls.length, 0),
    totalLeads: all.reduce((s, o) => s + o.leads.length, 0),
    totalContacts: all.reduce((s, o) => s + o.contacts.length, 0),
    totalMinutesUsed: all.reduce((s, o) => s + o.org.usedMinutes, 0),
    totalMinutesAllotted: all.reduce((s, o) => s + o.org.monthlyMinutes, 0),
    activeCampaigns: all.reduce((s, o) => s + o.campaigns.filter(c => c.status === 'running').length, 0),
    monthlyRevenue: all.filter(o => o.org.status !== 'suspended').reduce((s, o) => s + (planRevenue[o.org.plan] ?? 0), 0),
    recentCalls: all.flatMap(o => o.calls.slice(0, 3).map(c => ({ orgId: o.org.id, orgName: o.org.name, orgInitials: o.org.initials, orgColor: o.org.color, ...c }))).slice(0, 10),
    organizations: all.map(o => ({
      ...o.org,
      totalContacts: o.contacts.length,
      totalCalls: o.calls.length,
      totalLeads: o.leads.length,
      activeCampaigns: o.campaigns.filter(c => c.status === 'running').length,
      agentCount: o.agents.length
    }))
  })
})

app.get('/api/platform/organizations', (req, res) => {
  const search = String(req.query.search ?? '').toLowerCase()
  const all = Array.from(orgs.values())
    .filter(o => !search || `${o.org.name} ${o.org.industry} ${o.org.slug}`.toLowerCase().includes(search))
    .map(o => ({
      ...o.org,
      totalContacts: o.contacts.length,
      totalCalls: o.calls.length,
      totalLeads: o.leads.length,
      activeCampaigns: o.campaigns.filter(c => c.status === 'running').length,
      agentCount: o.agents.length
    }))
  res.json({ organizations: all })
})

app.post('/api/platform/organizations', (req, res) => {
  const { name, industry, plan = 'starter', contactEmail = '', contactPhone = '', website = '' } = req.body as Record<string, string>
  if (!name?.trim()) return res.status(400).json({ error: 'Organization name is required.' })
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const words = name.trim().split(/\s+/)
  const initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  const colors = ['#4659b8', '#2e8b6e', '#b85846', '#8b46b8', '#b89246', '#468bb8', '#6e8b2e', '#b84686']
  const limits = planLimits(plan)
  const org: Organization = {
    id: uid('org'), name: name.trim(), slug, initials, industry: industry || 'General',
    plan: (plan as Organization['plan']) || 'starter', status: plan === 'enterprise' ? 'active' : 'trial',
    createdAt: new Date().toISOString(), contactEmail, contactPhone, website,
    color: colors[orgs.size % colors.length], ...limits, usedMinutes: 0
  }
  const defaultAgent: Agent = {
    id: uid('a'), name: 'Default Agent', language: 'en-IN', voice: 'Warm female',
    firstMessage: `Hi {name}! This is your AI assistant from ${org.name}. How can I help you today?`,
    prompt: `You are a helpful AI voice assistant for ${org.name} in the ${org.industry} industry. Be professional, concise, and helpful.`,
    maxDuration: 300
  }
  const store: OrgStore = {
    org, contacts: [], agents: [defaultAgent],
    campaigns: [{ id: uid('camp'), name: `${org.name} Outreach`, status: 'draft', agentId: defaultAgent.id, listName: 'Default', contacted: 0, total: 0, maxConcurrent: 5, windowStart: '10:00', windowEnd: '18:00', attempts: 2 }],
    calls: [], leads: [],
    settings: { businessName: org.name, timezone: 'Asia/Kolkata', publicWebhookUrl: '', dndChecksEnabled: true, aiDisclosureEnabled: true }
  }
  orgs.set(org.id, store)
  res.status(201).json({ organization: { ...org, totalContacts: 0, totalCalls: 0, totalLeads: 0, activeCampaigns: 0, agentCount: 1 } })
})

app.get('/api/platform/organizations/:orgId', (req, res) => {
  const store = orgs.get(req.params.orgId)
  if (!store) return res.sendStatus(404)
  res.json({
    organization: {
      ...store.org,
      totalContacts: store.contacts.length, totalCalls: store.calls.length,
      totalLeads: store.leads.length,
      activeCampaigns: store.campaigns.filter(c => c.status === 'running').length,
      agentCount: store.agents.length
    }
  })
})

app.patch('/api/platform/organizations/:orgId', (req, res) => {
  const store = orgs.get(req.params.orgId)
  if (!store) return res.sendStatus(404)
  const allowed = ['name', 'industry', 'plan', 'status', 'contactEmail', 'contactPhone', 'website']
  for (const key of allowed) { if (req.body[key] !== undefined) (store.org as Record<string, unknown>)[key] = req.body[key] }
  if (req.body.plan) Object.assign(store.org, planLimits(req.body.plan))
  if (req.body.name) {
    const words = String(req.body.name).trim().split(/\s+/)
    store.org.initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : String(req.body.name).slice(0, 2).toUpperCase()
    store.org.slug = String(req.body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }
  res.json({ organization: { ...store.org, totalContacts: store.contacts.length, totalCalls: store.calls.length, totalLeads: store.leads.length, activeCampaigns: store.campaigns.filter(c => c.status === 'running').length, agentCount: store.agents.length } })
})

app.delete('/api/platform/organizations/:orgId', (req, res) => {
  if (!orgs.has(req.params.orgId)) return res.sendStatus(404)
  orgs.delete(req.params.orgId)
  res.json({ deleted: true })
})

// ─── Org-Scoped API ─────────────────────────────────────

const orgRouter = express.Router({ mergeParams: true })
orgRouter.use((req, res, next) => {
  const store = orgs.get(req.params.orgId)
  if (!store) return res.status(404).json({ error: 'Organization not found' })
  ;(req as Record<string, unknown>).store = store
  next()
})
const s = (req: express.Request): OrgStore => (req as Record<string, unknown>).store as OrgStore

orgRouter.get('/dashboard', (req, res) => {
  const store = s(req); const c = store.campaigns[0]
  res.json({
    testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(),
    businessName: store.settings.businessName, campaign: c,
    metrics: {
      queued: c ? Math.max(c.total - c.contacted, 0) : 0,
      inProgress: c?.status === 'running' ? Math.min(c.maxConcurrent, Math.max(c.total - c.contacted, 0)) : 0,
      connected: Math.max(Math.round(store.calls.length * 2.4), store.calls.length),
      leads: store.leads.length
    },
    recentCalls: store.calls.slice(0, 5)
  })
})

orgRouter.get('/contacts', (req, res) => {
  const store = s(req); const search = String(req.query.search ?? '').toLowerCase()
  res.json({ contacts: store.contacts.filter(c => !search || `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(search)) })
})
orgRouter.post('/contacts', (req, res) => {
  const store = s(req)
  const { name, phone, city = '', listName = 'Default', consent = '', dnd = 'unknown' } = req.body as Partial<Contact>
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' })
  const normalised = normalisePhone(phone)
  if (store.contacts.some(c => c.phone === normalised)) return res.status(409).json({ error: 'Phone number already exists.' })
  const contact: Contact = { id: uid('c'), name, phone: normalised, city, listName, consent, dnd: dnd === 'blocked' ? 'blocked' : dnd === 'clear' ? 'clear' : 'unknown' }
  store.contacts.unshift(contact)
  res.status(201).json({ contact })
})
orgRouter.post('/contacts/import', (req, res) => {
  const store = s(req); const rows = Array.isArray(req.body?.contacts) ? req.body.contacts : []
  let imported = 0, skipped = 0
  rows.forEach((row: Partial<Contact>) => {
    if (!row.name || !row.phone) { skipped++; return }
    const phone = normalisePhone(row.phone)
    if (store.contacts.some(c => c.phone === phone)) { skipped++; return }
    store.contacts.push({ id: uid('c'), name: row.name, phone, city: row.city ?? '', listName: row.listName ?? 'Imported', consent: row.consent ?? '', dnd: 'unknown' })
    imported++
  })
  res.status(201).json({ imported, skipped })
})
orgRouter.patch('/contacts/:cid', (req, res) => {
  const store = s(req); const contact = store.contacts.find(c => c.id === req.params.cid)
  if (!contact) return res.sendStatus(404)
  const { name, city, consent, dnd } = req.body as Partial<Contact>
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty.' })
  if (dnd !== undefined && !['clear', 'unknown', 'blocked'].includes(dnd)) return res.status(400).json({ error: 'Invalid DND status.' })
  Object.assign(contact, { ...(name !== undefined ? { name: String(name).trim() } : {}), ...(city !== undefined ? { city: String(city) } : {}), ...(consent !== undefined ? { consent: String(consent) } : {}), ...(dnd !== undefined ? { dnd } : {}) })
  res.json({ contact })
})

orgRouter.get('/agents', (req, res) => res.json({ agents: s(req).agents }))
orgRouter.post('/agents', (req, res) => {
  const store = s(req)
  const agent: Agent = { id: uid('a'), name: req.body.name || 'New agent', language: req.body.language || 'en-IN', voice: req.body.voice || 'Warm female', firstMessage: req.body.firstMessage || '', prompt: req.body.prompt || '', maxDuration: Number(req.body.maxDuration) || 300 }
  store.agents.push(agent)
  res.status(201).json({ agent })
})
orgRouter.patch('/agents/:aid', (req, res) => {
  const store = s(req); const agent = store.agents.find(a => a.id === req.params.aid)
  if (!agent) return res.sendStatus(404)
  const nextDuration = req.body.maxDuration === undefined ? agent.maxDuration : Number(req.body.maxDuration)
  if (!Number.isInteger(nextDuration) || nextDuration < 30 || nextDuration > 1800) return res.status(400).json({ error: 'Call length must be between 30 and 1800 seconds.' })
  Object.assign(agent, { ...req.body, maxDuration: nextDuration })
  res.json({ agent })
})

orgRouter.get('/campaigns', (req, res) => res.json({ campaigns: s(req).campaigns }))
orgRouter.get('/campaigns/demo', (req, res) => {
  const store = s(req); const c = store.campaigns[0]
  res.json({ testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign: c })
})
orgRouter.patch('/campaigns/demo', (req, res) => {
  const store = s(req); const campaign = store.campaigns[0]
  if (!campaign) return res.sendStatus(404)
  const patch = req.body as Partial<Campaign>
  const maxConcurrent = patch.maxConcurrent === undefined ? campaign.maxConcurrent : Number(patch.maxConcurrent)
  const attempts = patch.attempts === undefined ? campaign.attempts : Number(patch.attempts)
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 20) return res.status(400).json({ error: 'Parallel calls must be between 1 and 20.' })
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) return res.status(400).json({ error: 'Attempts must be between 1 and 3.' })
  if (patch.windowStart && patch.windowEnd && patch.windowStart >= patch.windowEnd) return res.status(400).json({ error: 'Calling window must end after it starts.' })
  Object.assign(campaign, { ...patch, maxConcurrent, attempts })
  res.json({ testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign })
})
orgRouter.post('/campaigns/demo/start', (req, res) => {
  const store = s(req); const c = store.campaigns[0]; if (c) c.status = 'running'
  res.json({ testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign: c })
})
orgRouter.post('/campaigns/demo/pause', (req, res) => {
  const store = s(req); const c = store.campaigns[0]; if (c) c.status = 'paused'
  res.json({ testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign: c })
})
orgRouter.post('/campaigns/demo/test-call', async (req, res) => {
  const store = s(req)
  const contact = store.contacts.find(c => c.id === req.body.contactId) ?? store.contacts[0]
  if (!contact) return res.status(400).json({ error: 'No contacts available.' })
  if (contact.dnd === 'blocked' || !contact.consent) return res.status(422).json({ error: 'Contact cannot be called because consent or DND checks failed.' })
  if (testMode) {
    const call: Call = { id: uid('call'), contactId: contact.id, contact: contact.name, phone: contact.phone, startedAt: 'Just now', duration: '00:00', status: 'in_progress', outcome: 'pending', summary: `Test call simulation for ${store.org.name}.`, transcript: [] }
    store.calls.unshift(call)
    return res.status(201).json({ call, testMode: true, provider })
  }
  if (!providerReady()) return res.status(503).json({ error: 'Live calling requires Exotel credentials, an approved ExoPhone, a public stream URL, and OPENAI_API_KEY.' })
  const body = new URLSearchParams({ From: contact.phone, CallerId: exotel.callerId, StreamUrl: streamUrl(), StreamType: 'bidirectional', Record: 'true', TimeLimit: String(store.agents[0]?.maxDuration ?? 300), ...(exotel.statusCallbackUrl ? { StatusCallback: exotel.statusCallbackUrl, 'StatusCallbackEvents[]': 'terminal' } : {}) })
  const primaryHost = ['sg', 'global', 'com'].includes(exotel.region) ? 'https://api.exotel.com' : 'https://api.in.exotel.com'
  const fallbackHost = primaryHost === 'https://api.exotel.com' ? 'https://api.in.exotel.com' : 'https://api.exotel.com'
  const callExotel = async (h: string) => {
    const response = await fetch(`${h}/v1/Accounts/${exotel.accountSid}/Calls/connect`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${exotel.apiKey}:${exotel.apiToken}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body })
    const raw = await response.text()
    const json = raw.trim().startsWith('{') ? JSON.parse(raw) as { Call?: { Sid?: string; Status?: string }; RestException?: { Message?: string } } : undefined
    const xmlValue = (tag: string) => raw.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'))?.[1]
    const error = json?.RestException?.Message ?? xmlValue('Message') ?? xmlValue('Error')
    return { response, json, xmlValue, error }
  }
  try {
    let result = await callExotel(primaryHost)
    if (result.response.status === 401) { const fb = await callExotel(fallbackHost); if (fb.response.ok || fb.response.status !== 401) result = fb }
    if (!result.response.ok) return res.status(result.response.status).json({ error: result.error ?? 'Exotel rejected the call.' })
    const call: Call = { id: result.json?.Call?.Sid ?? result.xmlValue('Sid') ?? uid('exotel'), contactId: contact.id, contact: contact.name, phone: contact.phone, startedAt: 'Just now', duration: '00:00', status: result.json?.Call?.Status ?? result.xmlValue('Status') ?? 'queued', outcome: 'pending', summary: 'Exotel call accepted.', transcript: [] }
    store.calls.unshift(call)
    res.status(201).json({ call, testMode: false, provider })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error'
    res.status(502).json({ error: 'Could not reach Exotel.', detail: reason })
  }
})

orgRouter.get('/calls', (req, res) => res.json({ calls: s(req).calls }))
orgRouter.get('/calls/:callId', (req, res) => {
  const call = s(req).calls.find(c => c.id === req.params.callId)
  if (!call) return res.sendStatus(404)
  res.json({ call })
})

orgRouter.get('/leads', (req, res) => res.json({ leads: s(req).leads }))
orgRouter.get('/leads/export.csv', (req, res) => {
  const store = s(req)
  res.type('text/csv').attachment(`${store.org.slug}-leads.csv`)
  res.send(['contact,phone,city,interest,callback,source', ...store.leads.map(l => [l.contact, l.phone, l.city, l.interest, l.callback, l.source].map(v => `"${v}"`).join(','))].join('\n'))
})

orgRouter.get('/settings', (req, res) => res.json({ settings: s(req).settings }))
orgRouter.patch('/settings', (req, res) => {
  const store = s(req); const patch = req.body as Partial<Settings>
  if (patch.publicWebhookUrl && !/^https:\/\//.test(patch.publicWebhookUrl)) return res.status(400).json({ error: 'Webhook URL must start with https://.' })
  Object.assign(store.settings, patch)
  res.json({ settings: store.settings })
})

function detectOutcome(messages: Array<{ role: string; text: string }>, reply: string): string {
  const text = (messages.map(m => m.text).join(' ') + ' ' + reply).toLowerCase()
  if (/callback|రేపు|tomorrow|call back|later|schedule|next week|busy/.test(text)) return 'callback_requested'
  if (/not interested|వద్దు|no thanks|stop calling|remove me|unsubscribe/.test(text)) return 'not_interested'
  if (/audit|strategy|demo|interested|yes|sure|pricing|website|campaign|sign up|book|సరే|ఆసక్తి/.test(text)) return 'interested'
  return 'in_progress'
}

orgRouter.post('/web-call/reply', async (req, res) => {
  const store = s(req)
  const { messages = [], userName = 'Client', agentId } = req.body as { messages: Array<{ role: 'user' | 'assistant' | 'system'; text: string }>; userName?: string; agentId?: string }
  const activeAgent = store.agents.find(a => a.id === agentId) ?? store.agents[0]
  if (!activeAgent) return res.json({ reply: 'No agent configured.', outcome: 'in_progress', agentName: 'System' })
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.text ?? ''

  if (openai.apiKey) {
    try {
      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${openai.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `${activeAgent.prompt}\nThe prospect's name is ${userName}. Maintain natural telephone pacing (1-2 sentences). Disclose you are an AI if asked.` },
            ...messages.slice(-8).map(m => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }))
          ],
          max_tokens: 160, temperature: 0.7
        })
      })
      if (aiResponse.ok) {
        const data = await aiResponse.json() as { choices?: Array<{ message?: { content?: string } }> }
        const reply = data.choices?.[0]?.message?.content?.trim()
        if (reply) return res.json({ reply, outcome: detectOutcome(messages, reply), agentName: activeAgent.name })
      }
    } catch { /* fall through */ }
  }

  const lower = lastUserMsg.toLowerCase()
  let reply = '', outcome = 'in_progress'
  if (!lastUserMsg) { reply = activeAgent.firstMessage.replace('{name}', userName) }
  else if (/yes|sure|ok|interested|audit|demo|strategy|pricing|cost|book/.test(lower)) { reply = `Great to hear! Our team at ${store.org.name} will follow up within 24 hours. What time works best for you?`; outcome = 'interested' }
  else if (/tomorrow|later|next week|busy|callback|call me back/.test(lower)) { reply = `Noted! We will schedule the callback. Thank you for your time!`; outcome = 'callback_requested' }
  else if (/no|not interested|stop|unsubscribe/.test(lower)) { reply = `Understood! Thank you for your time. ${store.org.name} is always here if you need us. Have a great day!`; outcome = 'not_interested' }
  else { reply = `Thanks for sharing. At ${store.org.name}, we would love to help. Would you like to learn more about our services?` }
  res.json({ reply, outcome, agentName: activeAgent.name })
})

orgRouter.post('/web-call/complete', (req, res) => {
  const store = s(req)
  const { duration = '01:12', transcript = [], contactName = 'Web Caller', phone = '', outcome = 'interested', summary = 'Web voice call completed.', agentName = 'Agent' } = req.body as { duration?: string; transcript?: Array<{ role: string; text: string }>; contactName?: string; phone?: string; outcome?: string; summary?: string; agentName?: string }
  const newCall: Call = { id: uid('call'), contactId: uid('c'), contact: contactName, phone, startedAt: 'Just now', duration, status: 'completed', outcome, summary: `${summary} (${agentName} · ${store.org.name})`, transcript }
  store.calls.unshift(newCall)
  const c = store.campaigns[0]; if (c) c.contacted = Math.min(c.contacted + 1, c.total)
  if (outcome === 'interested' || outcome === 'callback_requested') {
    store.leads.unshift({ id: uid('lead'), contact: contactName, phone, city: 'Web Call', interest: outcome === 'interested' ? 'hot' : 'warm', callback: 'Upcoming', source: `Voice Agent (${agentName})` })
  }
  store.org.usedMinutes += Math.max(1, Math.round(parseInt(duration.split(':')[0] || '0') + parseInt(duration.split(':')[1] || '0') / 60))
  res.status(201).json({ ok: true, call: newCall })
})

orgRouter.post('/test/calls/complete', (req, res) => {
  if (!testMode) return res.status(403).json({ error: 'Test endpoints are disabled.' })
  const store = s(req); const c = store.campaigns[0]; if (c) c.contacted = Math.min(c.contacted + 1, c.total)
  const event = { id: uid('event'), receivedAt: new Date().toISOString(), payload: req.body }
  events.unshift(event)
  res.status(201).json({ event, testMode, provider, providerReady: providerReady(), openaiReady: openaiReady(), campaign: c })
})
orgRouter.post('/webhooks/voice', (req, res) => { events.unshift({ id: uid('event'), receivedAt: new Date().toISOString(), payload: req.body }); res.status(202).json({ accepted: true }) })
orgRouter.post('/webhooks/exotel', (req, res) => { events.unshift({ id: uid('exotel-event'), receivedAt: new Date().toISOString(), payload: req.body }); res.status(202).json({ accepted: true }) })
orgRouter.get('/webhooks/events', (_req, res) => res.json({ events }))

app.use('/api/org/:orgId', orgRouter)

// ─── Static & SPA ───────────────────────────────────────

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
const indexHtml = path.join(distDir, 'index.html')
app.use(express.static(distDir))
const serveApp = (_req: express.Request, res: express.Response) => { if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml); return res.status(200).send('Vaani Voice AI platform running (API online). UI build not found.') }
app.get('/', serveApp)
app.get('/{*splat}', (req, res) => { if (req.path.startsWith('/api') || req.path.startsWith('/exotel')) return res.status(404).json({ error: 'Endpoint not found' }); return serveApp(req, res) })

// ─── WebSocket Bridge (Exotel ↔ OpenAI Realtime) ────────

const server = createServer(app)
const exotelStreams = new WebSocketServer({ noServer: true })
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname !== '/exotel/media') return socket.destroy()
  exotelStreams.handleUpgrade(request, socket, head, stream => exotelStreams.emit('connection', stream, request))
})

exotelStreams.on('connection', exotelSocket => {
  if (!openaiReady()) return exotelSocket.close(1011, 'OpenAI is not configured')
  const firstOrg = Array.from(orgs.values())[0]
  const defaultAgent = firstOrg?.agents[0]
  let streamSid = '', customerName = 'there', greeted = false
  const realtime = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(openai.model)}`, { headers: { Authorization: `Bearer ${openai.apiKey}` } })
  const close = () => { if (realtime.readyState === WebSocket.OPEN || realtime.readyState === WebSocket.CONNECTING) realtime.close(); if (exotelSocket.readyState === WebSocket.OPEN || exotelSocket.readyState === WebSocket.CONNECTING) exotelSocket.close() }
  realtime.on('open', () => realtime.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'], instructions: defaultAgent?.prompt ?? 'You are an AI voice assistant.', audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'server_vad' } }, output: { format: { type: 'audio/pcm', rate: 24000 }, voice: openai.voice } } } })))
  realtime.on('message', raw => { try { const msg = JSON.parse(raw.toString()) as { type: string; delta?: string; error?: { message?: string } }; if (msg.type === 'session.updated' && !greeted) { greeted = true; const greeting = (defaultAgent?.firstMessage ?? 'Hello, I am an AI assistant.').replace('{name}', customerName); realtime.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['audio'], instructions: `Open with: ${greeting}` } })) } if (msg.type === 'response.output_audio.delta' && msg.delta && streamSid && exotelSocket.readyState === WebSocket.OPEN) exotelSocket.send(JSON.stringify({ event: 'media', stream_sid: streamSid, media: { payload: msg.delta } })); if (msg.type === 'error') console.error(`OpenAI Realtime error: ${msg.error?.message}`) } catch { /* ignore */ } })
  realtime.on('error', err => console.error(`OpenAI Realtime error: ${err.message}`))
  exotelSocket.on('message', raw => { try { const ev = JSON.parse(raw.toString()) as { event: string; start?: { stream_sid?: string; from?: string }; media?: { payload?: string } }; if (ev.event === 'start') { streamSid = ev.start?.stream_sid ?? ''; customerName = ev.start?.from ?? 'there' } if (ev.event === 'media' && ev.media?.payload && realtime.readyState === WebSocket.OPEN) realtime.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: ev.media.payload })); if (ev.event === 'stop') close() } catch { exotelSocket.close(1003, 'Invalid event') } })
  exotelSocket.on('close', () => { if (realtime.readyState === WebSocket.OPEN || realtime.readyState === WebSocket.CONNECTING) realtime.close() })
  exotelSocket.on('error', err => console.error(`Exotel stream error: ${err.message}`))
})

server.listen(port, host, () => console.log(`Vaani Voice AI platform listening on ${host}:${port} (${testMode ? 'test mode' : 'live mode'}) — ${orgs.size} organizations loaded`))
