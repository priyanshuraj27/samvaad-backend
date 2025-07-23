# Samvaad Backend

Backend API for the Samvaad debate platform built with Node.js, Express, and MongoDB.

## Features

- User authentication and authorization
- Debate session management
- AI-powered adjudication
- Gamification system
- File upload support

## Deployment on Render

### Prerequisites

1. MongoDB Atlas database
2. Required API keys (Gemini, Sarvam, Bhashini)

### Steps

1. **Push your code to GitHub** (if not already done)

2. **Create a new Web Service on Render:**
   - Connect your GitHub repository
   - Use the following settings:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Node Version:** 18 or higher

3. **Set Environment Variables on Render:**
   ```
   NODE_ENV=production
   PORT=10000
   MONGODB_URI=your_mongodb_connection_string
   CORS_ORIGIN=your_frontend_url
   ACCESS_TOKEN_SECRET=your_access_token_secret
   ACCESS_TOKEN_EXPIRY=1d
   REFRESH_TOKEN_SECRET=your_refresh_token_secret
   REFRESH_TOKEN_EXPIRY=7d
   GEMINI_API_KEY=your_gemini_api_key
   SARVAM_API_KEY=your_sarvam_api_key
   BHASHINI_API_KEY=your_bhashini_api_key
   ```

4. **Deploy:** Render will automatically build and deploy your application

### API Endpoints

- `GET /` - Health check
- `GET /health` - Detailed health status
- `POST /api/v1/users/*` - User management
- `POST /api/v1/debates/*` - Debate sessions
- `POST /api/v1/adjudications/*` - Adjudication system
- `POST /api/v1/gamification/*` - Gamification features

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your values
4. Start development server: `npm run dev`

## Tech Stack

- Node.js & Express.js
- MongoDB with Mongoose
- JWT Authentication
- Multer for file uploads
- AI integrations (Gemini, OpenAI)
