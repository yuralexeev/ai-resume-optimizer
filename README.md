# Hired.

AI-powered tool that adapts a resume to a specific job posting and scores it against ATS filters. Built incrementally by release — this repo currently implements **Release 1**: auth, resume creation/upload, vacancy input, and a dashboard.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (local dev)
- JWT sessions in httpOnly cookies, bcrypt password hashing
- Resume adaptation calls a real LLM via OpenRouter's free tier (`src/services/aiService.ts` + `src/lib/openRouterClient.ts`), falling back silently to deterministic mock logic if the call fails. ATS scoring stays a fixed, auditable formula by design — never an LLM call.

## Getting started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Set `JWT_SECRET` and `DATABASE_URL` in `.env` (see `.env` for local defaults — replace `JWT_SECRET` before deploying anywhere real). Set `OPENROUTER_API_KEY` (from openrouter.ai/keys) to enable real AI adaptation — leave it empty to keep using the mock.
