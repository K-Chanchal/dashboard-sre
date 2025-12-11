# 🚀 AWS Deployment - SRE Dashboard

## ✅ Project Setup Complete!

Your SRE Dashboard is now ready for AWS deployment with Lambda (backend) and Amplify (frontend).

---

## 📁 What Has Been Created

### Backend Files (Lambda)
```
lambda-backend/
├── index.js              ← Lambda function handler (Express API)
├── package.json          ← Dependencies
├── .env.template         ← Environment variables template
└── README-LAMBDA.md      ← Lambda deployment guide
```

### Frontend Files (Amplify)
```
public/
├── index.html           ← Main dashboard page
├── app.js               ← Dashboard logic
├── styles.css           ← Styling
└── config.js            ← API configuration (UPDATE THIS!)
```

### Configuration & Documentation
```
├── amplify.yml                  ← Amplify build configuration
├── QUICK-START.md              ← 🚀 START HERE - Quick deployment
├── DEPLOYMENT-GUIDE.md         ← Complete step-by-step guide
├── PROJECT-STRUCTURE.md        ← Project structure overview
└── README-AWS-DEPLOYMENT.md    ← This file
```

---

## 🎯 Deployment Steps - Choose Your Path

### Option 1: Quick Start (Recommended for beginners)
**Estimated time: 15-20 minutes**

📖 **Follow**: `QUICK-START.md`

This gives you the essential steps to get deployed quickly.

### Option 2: Complete Guide (Recommended for production)
**Estimated time: 30-45 minutes**

📖 **Follow**: `DEPLOYMENT-GUIDE.md`

This includes detailed explanations, security best practices, and troubleshooting.

---

## 🏃 Super Quick Overview

### 1. Deploy Backend (Lambda)
```bash
cd lambda-backend
npm install
# Create ZIP file (see QUICK-START.md for your OS)

# Then in AWS Console:
# 1. Create Lambda function
# 2. Upload ZIP
# 3. Add database environment variables
# 4. Add API Gateway trigger
# 5. SAVE THE API GATEWAY URL ← IMPORTANT!
```

### 2. Deploy Frontend (Amplify)
```bash
# In AWS Amplify Console:
# 1. Create new app
# 2. Connect Git repo OR upload public/ folder
# 3. Deploy
# 4. SAVE THE AMPLIFY URL ← IMPORTANT!
```

### 3. Connect Them
```javascript
// Edit public/config.js
// Replace YOUR_LAMBDA_API_GATEWAY_URL with your actual URL from step 1

// Then redeploy frontend (Git push or manual upload)
```

### 4. Done! 🎉
Open your Amplify URL and see your live dashboard!

---

## 📋 Pre-Deployment Checklist

Before you start, make sure you have:

- [ ] AWS Account with console access
- [ ] MySQL database running (RDS or external)
- [ ] Database credentials (host, username, password, database name)
- [ ] Database is accessible (check security groups/firewall)
- [ ] Git repository (optional, for Amplify continuous deployment)

---

## 🔑 Important Information You'll Need

### Database Credentials (for Lambda environment variables)
```
DB_HOST     = ________________________
DB_USER     = ________________________
DB_PASSWORD = ________________________
DB_NAME     = ________________________
```

### URLs to Save After Deployment
```
Lambda API Gateway URL = ________________________
Amplify App URL       = ________________________
```

---

## 📚 Documentation Quick Reference

| Document | Purpose | When to Use |
|----------|---------|-------------|
| `QUICK-START.md` | Quick deployment guide | 🚀 First deployment, need it fast |
| `DEPLOYMENT-GUIDE.md` | Complete guide with details | 📖 Detailed walkthrough, troubleshooting |
| `PROJECT-STRUCTURE.md` | Project structure overview | 📂 Understanding what files do what |
| `lambda-backend/README-LAMBDA.md` | Lambda-specific details | 🔍 Deep dive into Lambda setup |
| `README-AWS-DEPLOYMENT.md` | This file | 📌 Starting point and overview |

---

## 💡 Key Concepts

### Architecture
```
User Browser
    ↓
AWS Amplify (Frontend - Static hosting)
    ↓
API Gateway (HTTP API)
    ↓
AWS Lambda (Backend API - Express app)
    ↓
MySQL Database (RDS or external)
```

### What's Different from Local Development?

| Local | AWS |
|-------|-----|
| `src/server.js` runs Express | Lambda runs Express via serverless-http |
| Database on localhost | Database on RDS or accessible endpoint |
| Frontend at localhost:3000 | Frontend on Amplify CDN |
| Backend at localhost:3000/api | Backend at API Gateway URL |

---

## 🛠️ What You Need to Update

### ⚠️ MUST UPDATE

1. **Lambda Environment Variables** (in AWS Console)
   - DB_HOST
   - DB_USER
   - DB_PASSWORD
   - DB_NAME

2. **Frontend API URL** (`public/config.js`)
   - Replace `YOUR_LAMBDA_API_GATEWAY_URL` with actual URL

### ✅ Already Configured (No Changes Needed)

- `lambda-backend/index.js` - Lambda handler
- `public/index.html` - Dashboard UI
- `public/app.js` - Dashboard logic
- `public/styles.css` - Styling
- `amplify.yml` - Build configuration

---

## 🎬 Getting Started NOW

### Step 1: Read the Quick Start
```bash
# Open and read:
QUICK-START.md
```

### Step 2: Prepare Lambda Package
```bash
cd lambda-backend
npm install
# Follow OS-specific ZIP creation in QUICK-START.md
```

### Step 3: Follow AWS Console Steps
1. Deploy Lambda (10 minutes)
2. Deploy Amplify (5 minutes)
3. Connect them (2 minutes)

---

## ⚡ Common Issues & Quick Fixes

### "Failed to load dashboard data"
**Fix**: Check API URL in `public/config.js` and CORS in API Gateway

### "Database connection failed"
**Fix**: Verify Lambda environment variables and VPC/security groups

### "Lambda timeout"
**Fix**: Increase timeout to 30 seconds in Lambda configuration

### "CORS error in browser"
**Fix**: Configure CORS in API Gateway to allow your Amplify domain

📖 **Full troubleshooting guide**: See `DEPLOYMENT-GUIDE.md` → Troubleshooting section

---

## 💰 Cost Estimate

With AWS Free Tier:
- Lambda: Free (1M requests/month)
- API Gateway: Free (1M requests/month)
- Amplify: Free (15GB storage)
- **Total: $0-5/month**

Without Free Tier:
- **Total: $20-50/month** (depending on usage and RDS instance)

---

## 🔒 Security Reminders

1. ✅ Store database credentials in Lambda environment variables
2. ✅ Use VPC for Lambda if RDS is in VPC
3. ✅ Restrict security groups (Lambda → RDS only)
4. ✅ Enable HTTPS only (automatic with API Gateway & Amplify)
5. 📖 See DEPLOYMENT-GUIDE.md for advanced security

---

## 🆘 Need Help?

### During Deployment
1. Check the specific guide you're following (QUICK-START or DEPLOYMENT-GUIDE)
2. Look at CloudWatch Logs (Lambda console → Monitor → View logs)
3. Check browser console (F12) for frontend errors

### After Deployment
1. Monitor CloudWatch Logs for Lambda errors
2. Check Amplify deployment logs
3. Set up CloudWatch alarms for monitoring

---

## ✅ Deployment Completion Checklist

After following the guides, verify:

- [ ] Lambda function created and code uploaded
- [ ] Environment variables set in Lambda
- [ ] API Gateway trigger added to Lambda
- [ ] API Gateway URL saved and tested (`/health` endpoint)
- [ ] Amplify app created and deployed
- [ ] Amplify URL saved and accessible
- [ ] `public/config.js` updated with API Gateway URL
- [ ] Frontend redeployed with updated config
- [ ] Dashboard loads data successfully
- [ ] No errors in browser console (F12)
- [ ] No errors in CloudWatch Logs

---

## 🎉 Success!

Once all checkboxes are checked, your SRE Dashboard is live on AWS!

**Share your deployment:**
- Frontend URL: `https://your-app.amplifyapp.com`
- API URL: `https://your-api.execute-api.region.amazonaws.com`

---

## 📈 What's Next?

After successful deployment:

1. **Set up monitoring** - CloudWatch alarms, dashboards
2. **Implement authentication** - Amazon Cognito, API keys
3. **Custom domain** - Route 53 + Amplify custom domain
4. **Optimize costs** - Review usage, set budgets
5. **Security hardening** - WAF, Secrets Manager, IAM policies
6. **CI/CD pipeline** - Automate deployments with CodePipeline

📖 See DEPLOYMENT-GUIDE.md → Next Steps section

---

## 📞 Support Resources

- **AWS Lambda Docs**: https://docs.aws.amazon.com/lambda/
- **AWS Amplify Docs**: https://docs.amplify.aws/
- **API Gateway Docs**: https://docs.aws.amazon.com/apigateway/
- **Your CloudWatch Logs**: First place to check for errors!

---

**Ready to deploy? Open `QUICK-START.md` and let's go! 🚀**
