# Alexa AI — Smart Personal Assistant

Alexa AI is a full-stack AI assistant web application with real user accounts, persistent data, and a wide set of productivity, creative, and developer tools — built as a Progressive Web App so it can be installed like a native mobile app.

**Live app:** https://alexa-ai-1.netlify.app
**Backend API:** https://alexa-ai-backend-bkah.onrender.com

---

## Overview

Unlike many AI-chatbot demos that store everything in the browser's local storage, Alexa AI is backed by a real PostgreSQL database, real authentication, and a proper Node.js/Express API — so a user's chats, notes, tasks, and account persist across devices and sessions, not just on one browser.

## Features

### Core AI Assistant
- Real-time chat with multiple selectable AI models (via Groq)
- Persistent chat history, synced to the user's account
- Voice input and text-to-speech
- Image analysis / OCR
- AI-powered translation and summarization
- AI web search

### Productivity Tools
- Email writer
- Resume builder
- To-do list (saved to the database, with AI task suggestions)
- Notes (saved to the database)
- Code helper / debugger

### Creative & Business Tools
- Image generation
- QR code, logo, and thumbnail generators
- Business plan, proposal, and invoice generators
- Social media content generator

### Account & Security
- Email/password signup and login (bcrypt-hashed passwords)
- JWT-based session authentication
- Forgot-password / reset-password flow via email (Resend API)
- Self-service account deletion (cascades and removes all of a user's data)
- Role-based access control for the admin dashboard
- Rate limiting on authentication and chat endpoints
- CORS restricted to approved frontend origins

### Admin Dashboard
- Real, database-backed view of registered users and activity
- Protected by server-side role verification (not just hidden UI)

### Progressive Web App
- Installable on desktop and mobile home screens
- Offline app-shell caching via a service worker
- Custom app icons across all standard sizes

### Legal & Compliance
- Privacy Policy and Terms of Service pages

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript, PWA (manifest + service worker) |
| Backend | Node.js, Express |
| Database | PostgreSQL, accessed via Prisma ORM |
| Authentication | JWT, bcrypt |
| AI | Groq API (Llama 3.3 70B and other models) |
| Transactional email | Resend API |
| Frontend hosting | Netlify |
| Backend hosting | Render |

## Architecture

```
alexa-ai/
├── index.html, login.html, admin.html,
│   forgot-password.html, reset-password.html,
│   privacy.html, terms.html    # Frontend pages
├── app.js                      # Frontend application logic
├── style.css
├── manifest.json, sw.js, icons/ # PWA
│
└── alexa-backend/
    ├── src/
    │   ├── index.js             # Express app entry point
    │   ├── routes/               # auth, chat, generate, admin, notes, todos
    │   ├── middleware/            # auth guard, rate limiting
    │   └── lib/                  # Prisma client, mailer, AI tools, memory
    └── prisma/
        ├── schema.prisma         # Database schema
        └── migrations/
```

The frontend and backend are deployed and hosted separately — the frontend is a static site on Netlify, and the backend is an independent API service on Render, communicating over HTTPS.

---

## Getting Started (Local Development)

### Prerequisites
- Node.js (v18+)
- A PostgreSQL database (local or hosted)
- A [Groq API key](https://console.groq.com)
- A [Resend API key](https://resend.com) (for password reset emails)

### 1. Clone the repository
```bash
git clone https://github.com/ytsheraz9-ui/alexa-ai-backend.git
cd alexa-ai-backend
```

### 2. Install backend dependencies
```bash
npm install
```

### 3. Configure environment variables
```bash
cp .env.example .env
```
Fill in `.env` with your database URL, API keys, and secrets — see `.env.example` for the full list.

### 4. Set up the database
```bash
npx prisma migrate dev
```

### 5. Run the backend
```bash
npm run dev
```
The API will be available at `http://localhost:4000`.

### 6. Run the frontend
Open the frontend folder with any static file server (e.g. VS Code's Live Server extension) and point `API_BASE_URL` in the HTML files to your local backend if testing locally.

---

## Environment Variables

See `.env.example` for the full list, including database connection, JWT secret, Groq API key, Resend API key, and frontend URL used for building email links.

---

## Security Notes

- Passwords are never stored in plain text — hashed with bcrypt.
- Password reset tokens are hashed before storage and expire after 15 minutes.
- All authenticated routes verify a JWT on every request.
- Users can only read, edit, or delete their own data — enforced on the server, not just hidden in the UI.
- Deleting an account cascades and permanently removes all associated chats, notes, and tasks.

---

## Roadmap

This project currently runs on free-tier infrastructure and covers the core product experience end to end. Planned next steps toward a production-grade, company-level product include:

- Paid, scalable hosting and database infrastructure
- Two-factor authentication and independent security audits
- Subscription/payment plans
- Automated testing and CI/CD pipelines
- Native mobile app store presence
- Dedicated AI content moderation layer

---

## Credits

Developed by **Sheraz Akbar**.

## License

This project was built for the Punjab Youth Innovation & Incubation Competition 2026.