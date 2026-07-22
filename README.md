# Alexa AI — Backend (Step 1: Database + Server Foundation)

Ye backend LocalStorage ki jagah lega — real, permanent, multi-device database ke sath.

## Kya Bana Hai (Step 1)

- Express server (`src/index.js`)
- Prisma schema (`prisma/schema.prisma`) — Users, Chat Sessions, Messages, Todos, Notes ke tables
- Health check aur DB connection check endpoints

## Setup Steps (Terminal Commands — Ek Ek Kar Ke Chalayein)

### 1. Dependencies install karein
```bash
cd alexa-backend
npm install
```

### 2. PostgreSQL install karein (agar pehle se nahi hai)
Aap ne Nova ERP mein PostgreSQL 17 already install kiya hua hai, to wahi use kar sakte hain.

### 3. .env file banayein
```bash
cp .env.example .env
```
Phir `.env` file kholein aur `DATABASE_URL` mein apna PostgreSQL username/password daal dein.

### 4. Database create karein
PostgreSQL mein ek nayi database banayein naam `alexa_ai`:
```bash
psql -U postgres -c "CREATE DATABASE alexa_ai;"
```

### 5. Prisma se tables create karein
```bash
npx prisma migrate dev --name init
```
Ye command apki `.env` mein di gayi database mein automatically Users, ChatSessions, Messages, Todos, aur Notes tables bana degi.

### 6. Server chalayein
```bash
npm run dev
```

### 7. Test karein
Browser mein ya curl se ye do URLs check karein:
```
http://localhost:4000/api/health
http://localhost:4000/api/db-check
```
Agar dono `"status": "ok"` return karein, to Step 1 successfully complete hai.

## Next Step

Step 2 mein hum real authentication (signup/login, password hashing, JWT tokens) add karein ge.