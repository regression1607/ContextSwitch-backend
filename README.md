# ContextSwitch Backend

Backend API for the ContextSwitch Chrome Extension.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from example:
```bash
cp .env.example .env
```

3. Fill in your environment variables:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `OPENAI_API_KEY` - OpenAI API key for compression

4. Run development server:
```bash
npm run dev
```

## API Endpoints

### Auth
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login

### Compress
- `POST /api/compress` - Compress conversation context (requires auth)

### Health
- `GET /api/health` - Health check
