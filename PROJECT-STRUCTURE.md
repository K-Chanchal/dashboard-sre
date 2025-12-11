# Project Structure for AWS Deployment

## Directory Overview

```
dashboard-sre/
│
├── lambda-backend/              # Lambda (Backend API) deployment files
│   ├── index.js                 # Lambda function handler with Express routes
│   ├── package.json             # Lambda dependencies (express, mysql2, cors, serverless-http)
│   ├── .env.template            # Environment variables template
│   └── README-LAMBDA.md         # Lambda deployment instructions
│
├── public/                      # Amplify (Frontend) files
│   ├── index.html               # Main HTML page
│   ├── styles.css               # Styling and animations
│   ├── app.js                   # Frontend JavaScript (dashboard logic)
│   └── config.js                # API configuration (to be updated with Lambda URL)
│
├── src/                         # Original local development files
│   ├── server.js                # Local Express server (not used in AWS)
│   └── db.js                    # Local DB config (not used in AWS)
│
├── database/                    # Database schema files
│   └── schema.sql               # MySQL database schema
│
├── amplify.yml                  # Amplify build configuration
├── DEPLOYMENT-GUIDE.md          # Complete deployment guide (READ THIS!)
├── QUICK-START.md               # Quick reference for deployment
├── PROJECT-STRUCTURE.md         # This file
├── README.md                    # Original project README
├── package.json                 # Local development dependencies
└── .env                         # Local environment variables

```

## Deployment Files Explained

### For Lambda Backend

| File | Purpose | Action Required |
|------|---------|-----------------|
| `lambda-backend/index.js` | Lambda function handler | ✅ Ready - Just deploy |
| `lambda-backend/package.json` | Dependencies list | ✅ Run `npm install` before zipping |
| `lambda-backend/.env.template` | Environment vars template | ⚠️ Set in Lambda console |
| `lambda-backend/README-LAMBDA.md` | Lambda deployment guide | 📖 Read for details |

### For Amplify Frontend

| File | Purpose | Action Required |
|------|---------|-----------------|
| `public/index.html` | Main page | ✅ Ready - No changes needed |
| `public/styles.css` | Styling | ✅ Ready - No changes needed |
| `public/app.js` | Dashboard logic | ✅ Ready - No changes needed |
| `public/config.js` | API URL configuration | ⚠️ **UPDATE** with Lambda URL |
| `amplify.yml` | Build configuration | ✅ Ready - Amplify auto-detects |

### Documentation Files

| File | Purpose | When to Read |
|------|---------|--------------|
| `QUICK-START.md` | Quick deployment steps | 🚀 START HERE |
| `DEPLOYMENT-GUIDE.md` | Complete step-by-step guide | 📖 Read for full details |
| `lambda-backend/README-LAMBDA.md` | Lambda-specific details | 🔍 Reference during Lambda setup |
| `PROJECT-STRUCTURE.md` | This file - project overview | 📂 Understanding structure |

## Deployment Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT WORKFLOW                       │
└─────────────────────────────────────────────────────────────────┘

1️⃣  BACKEND (Lambda)
   ┌──────────────────────────────────────────────────────────┐
   │ cd lambda-backend                                        │
   │ npm install                                              │
   │ zip -r lambda-deployment.zip .                           │
   │                                                          │
   │ AWS Console → Lambda → Create Function                   │
   │ Upload lambda-deployment.zip                             │
   │ Add environment variables (DB credentials)               │
   │ Add API Gateway trigger                                  │
   │ ✅ Save API Gateway URL                                  │
   └──────────────────────────────────────────────────────────┘

2️⃣  FRONTEND (Amplify)
   ┌──────────────────────────────────────────────────────────┐
   │ AWS Console → Amplify → Create App                       │
   │ Connect Git repo OR upload public/ folder as ZIP         │
   │ Deploy                                                   │
   │ ✅ Save Amplify URL                                      │
   └──────────────────────────────────────────────────────────┘

3️⃣  CONNECTION
   ┌──────────────────────────────────────────────────────────┐
   │ Update public/config.js:                                 │
   │ - Replace YOUR_LAMBDA_API_GATEWAY_URL                    │
   │ - Use API Gateway URL from step 1                        │
   │                                                          │
   │ Redeploy frontend:                                       │
   │ - Git: commit and push                                   │
   │ - Manual: re-upload to Amplify                           │
   └──────────────────────────────────────────────────────────┘

4️⃣  VERIFICATION
   ┌──────────────────────────────────────────────────────────┐
   │ Test API: https://YOUR_API_URL/health                    │
   │ Open Amplify URL in browser                              │
   │ Check browser console (F12) for errors                   │
   │ Verify data loads correctly                              │
   └──────────────────────────────────────────────────────────┘
```

## What Gets Deployed Where

### Lambda (Backend)
- **Files deployed**: Everything in `lambda-backend/` folder
- **Not deployed**: `src/`, original `package.json`, `.env`
- **Runtime**: Node.js 18.x on AWS Lambda
- **Trigger**: API Gateway HTTP API
- **Connects to**: MySQL Database (RDS or external)

### Amplify (Frontend)
- **Files deployed**: Everything in `public/` folder
- **Not deployed**: `src/`, `lambda-backend/`, `node_modules/`
- **Hosting**: AWS Amplify static hosting
- **CDN**: Automatically uses CloudFront
- **Connects to**: Lambda API via API Gateway

## Environment Variables

### Lambda Environment Variables (Set in AWS Console)
```
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_USER=your-db-username
DB_PASSWORD=your-db-password
DB_NAME=SREData
```

### Frontend Configuration (Update in code)
```javascript
// public/config.js
const API_BASE_URL = 'https://your-api-gateway-url/api';
```

## Key URLs You'll Need

After deployment, save these URLs:

1. **Lambda Function ARN**
   - Format: `arn:aws:lambda:us-east-1:123456789:function:sre-dashboard-api`
   - Location: Lambda console → Function overview

2. **API Gateway URL**
   - Format: `https://abc123xyz.execute-api.us-east-1.amazonaws.com`
   - Location: Lambda console → Triggers section
   - **Use this in**: `public/config.js`

3. **Amplify App URL**
   - Format: `https://main.d1a2b3c4d5e6f7.amplifyapp.com`
   - Location: Amplify console → App overview
   - **This is your live dashboard**

## Security Notes

### Sensitive Files (NEVER commit to public repo)
- `.env` - Contains database credentials
- `lambda-backend/.env.template` - Template only, no real credentials

### Public Files (Safe to commit)
- All files in `public/`
- `amplify.yml`
- All `*.md` documentation files
- `lambda-backend/index.js` (doesn't contain credentials)

### Credentials Storage
- ✅ **Best practice**: Store in AWS Secrets Manager
- ✅ **Good**: Store in Lambda environment variables (encrypted)
- ❌ **Never**: Hard-code in source code
- ❌ **Never**: Commit to Git repository

## Files NOT Used in AWS Deployment

These files are for local development only:
- `src/server.js` - Replaced by `lambda-backend/index.js`
- `src/db.js` - DB connection now in Lambda handler
- Root `package.json` - Local dev dependencies
- `.env` - Local environment variables

## Next Steps After Deployment

1. ✅ Test all API endpoints
2. ✅ Verify frontend loads data
3. ✅ Check CloudWatch Logs for errors
4. 📊 Set up monitoring and alarms
5. 🔒 Implement API authentication
6. 🌐 Configure custom domain (optional)
7. 💰 Set up cost monitoring

## Support

- **Deployment issues**: Check `DEPLOYMENT-GUIDE.md`
- **Lambda issues**: Check `lambda-backend/README-LAMBDA.md`
- **Quick reference**: Check `QUICK-START.md`
- **AWS Logs**: Check CloudWatch in AWS Console

---

**Ready to deploy?** Start with `QUICK-START.md` for a rapid deployment guide!
