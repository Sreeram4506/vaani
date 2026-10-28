# ARTH Voice AI & Campaign Dashboard

AI-powered voice outreach and campaign control room for **ARTH Marketing Media** ([arth-mauve.vercel.app](https://arth-mauve.vercel.app/)) — *Marketing. Content. Technology.*

Includes 5 pre-defined voice agents specialized across ARTH's core capabilities:
- **Aditi**: Senior Growth & Paid Media Strategist (Meta & Google Ads, Funnel Audits)
- **Kabir**: Creative & Video Producer (Reels, Product Shoots, Ad Creatives)
- **Dev**: Technology & Web Solutions Lead (Websites, E-Commerce, SEO, WhatsApp Integration)
- **Priya**: Regional & Local Outreach Specialist (Telugu / English vernacular growth & offline promotions)
- **Rhea**: Inbound Growth & Marketing Audit Specialist (Complimentary Funnel Audits)

---

## Run locally

```bash
npm install
npm run dev:full
```

Open `http://localhost:5173` in your browser.

- `dev:full` runs both the Vite dashboard and the local API on port `8787`.
- **Live Web Call**: Click **Web Call Agent** in the dashboard to test interactive voice calls with any of the 5 agents with real-time speech recognition and synthesis.
- **Test Mode**: Simulated campaign calls verify safety and CRM tracking without dialing actual phone numbers.

---

## Deploying to Render

Deploy via the included `render.yaml` Blueprint or as a standard Node Web Service:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`

---

## Contacts & Sourcing

Data is sourced from [ARTH Marketing Media](https://arth-mauve.vercel.app/):
- **Email**: `buildwitharth@gmail.com`
- **WhatsApp**: `+91 9809987999`
- **Case Studies**: Fit Secrets (Fitness), Quantumrise Infra (Bangalore Real Estate), Samadhai Technologies (AI Software), Acuity Tax (Corporate Tax & Legal).
