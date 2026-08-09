# Deployment — ShopPilot AI

## Prerequisites

- Node.js 20+
- A Supabase project (URL + anon key)
- (Optional) An OpenAI-compatible API key for the AI assistant

## Environment Variables

Create a `.env` file (or set them in your hosting platform):

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `AI_API_KEY` | No | OpenAI-compatible API key (set as Supabase Edge Function secret) |
| `AI_BASE_URL` | No | API base URL (default: `https://api.openai.com/v1`) |
| `AI_MODEL` | No | Model name (default: `gpt-4o-mini`) |
| `AI_TIMEOUT_MS` | No | Request timeout in ms (default: 30000) |
| `AI_MAX_RETRIES` | No | Retry count (default: 2) |

**Note**: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`, and `AI_MAX_RETRIES` are server-side secrets stored in Supabase Edge Function secrets, NOT in the frontend `.env`.

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your Supabase URL and anon key
npm run dev
```

## Production Build

```bash
npm run build
# Output is in dist/
npm run preview  # Test the production build locally
```

## Docker Deployment

### Using Docker Compose

```bash
docker-compose up -d --build
```

The app will be available at `http://localhost:5173`.

### Using Docker directly

```bash
docker build -t shoppilot-ai .
docker run -p 5173:80 shoppilot-ai
```

The Dockerfile uses a multi-stage build:
1. **Build stage**: Node 20 Alpine, installs deps, runs `npm run build`
2. **Production stage**: Nginx Alpine, serves the static `dist/` with SPA routing

## Cloud Deployment

### Vercel

1. Connect your repository
2. Framework preset: Vite
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Netlify

1. Connect your repository
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variables in Site Settings

### Railway

1. Connect your repository
2. Railway auto-detects Vite
3. Add environment variables
4. Deploy

### Render

1. Create a new Static Site
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variables

### VPS (Linux)

1. Install Docker and Docker Compose on your VPS
2. Clone the repository
3. Create `.env` with your Supabase credentials
4. Run `docker-compose up -d --build`
5. Set up a reverse proxy (Nginx/Caddy) with SSL for production

Example with Caddy:
```
shoppilot.yourdomain.com {
  reverse_proxy localhost:5173
}
```

## Supabase Setup

The Supabase project is already provisioned. Database migrations are applied via the Supabase MCP tools. Edge functions are deployed via the Supabase MCP tools.

### To set AI secrets:
1. Go to your Supabase project dashboard
2. Navigate to Edge Functions > Secrets
3. Add `AI_API_KEY` with your OpenAI-compatible API key
4. Optionally add `AI_BASE_URL` and `AI_MODEL` for non-OpenAI providers

## Post-Deploy Checklist

- [ ] Environment variables set (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] Database migrations applied (via Supabase MCP)
- [ ] Edge functions deployed (ai-assistant, reminders)
- [ ] AI API key added as Supabase secret (optional, for AI assistant)
- [ ] Create your first shop owner account via signup
- [ ] Test login + dashboard loads
- [ ] Test creating a sale
- [ ] Test AI assistant (if AI key configured)
