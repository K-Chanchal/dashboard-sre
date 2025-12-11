# Complete AWS Deployment Guide
## SRE Dashboard - Amplify + Lambda Deployment

This guide walks you through deploying the SRE Dashboard with:
- **Frontend**: AWS Amplify (hosting static files)
- **Backend**: AWS Lambda (serverless API)
- **Database**: Amazon RDS MySQL (or existing MySQL database)

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Part 1: Deploy Backend to Lambda](#part-1-deploy-backend-to-lambda)
4. [Part 2: Deploy Frontend to Amplify](#part-2-deploy-frontend-to-amplify)
5. [Part 3: Connect Frontend to Backend](#part-3-connect-frontend-to-backend)
6. [Testing and Verification](#testing-and-verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required
- AWS Account with console access
- MySQL database (Amazon RDS or existing MySQL server)
- Database should be accessible from Lambda (same VPC or public with proper security groups)

### Optional but Recommended
- Git repository (for Amplify continuous deployment)
- AWS CLI installed (for command-line operations)

---

## Architecture Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   User's    │────────▶│ AWS Amplify  │────────▶│ API Gateway │
│   Browser   │         │  (Frontend)  │         │   + Lambda  │
└─────────────┘         └──────────────┘         └──────┬──────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │  MySQL/RDS  │
                                                  │  Database   │
                                                  └─────────────┘
```

---

## Part 1: Deploy Backend to Lambda

### Step 1.1: Prepare Lambda Deployment Package

1. **Navigate to lambda-backend directory**
   ```bash
   cd lambda-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Verify files exist**
   - `index.js` (Lambda handler)
   - `package.json`
   - `node_modules/` (folder with all dependencies)

4. **Create ZIP deployment package**

   **Windows (PowerShell):**
   ```powershell
   Compress-Archive -Path * -DestinationPath lambda-deployment.zip -Force
   ```

   **Windows (Command Prompt with 7-Zip):**
   ```cmd
   7z a -tzip lambda-deployment.zip *
   ```

   **Linux/Mac:**
   ```bash
   zip -r lambda-deployment.zip .
   ```

   **IMPORTANT**: The ZIP must contain files at the root level (not in a subfolder)
   - ✅ Correct: `lambda-deployment.zip/index.js`
   - ❌ Wrong: `lambda-deployment.zip/lambda-backend/index.js`

### Step 1.2: Create Lambda Function

1. **Login to AWS Console**
   - Go to https://console.aws.amazon.com/lambda/

2. **Create Function**
   - Click **"Create function"**
   - Select **"Author from scratch"**
   - **Function name**: `sre-dashboard-api`
   - **Runtime**: Select `Node.js 18.x` (or latest available)
   - **Architecture**: `x86_64`
   - Click **"Create function"**

3. **Upload Code**
   - Scroll to **"Code source"** section
   - Click **"Upload from"** → **".zip file"**
   - Upload `lambda-deployment.zip`
   - Click **"Save"**
   - Wait for upload to complete (may take 1-2 minutes)

4. **Verify Handler** (should be automatic)
   - Go to **"Code"** tab → **"Runtime settings"**
   - Handler should be: `index.handler`
   - If not, click **"Edit"** and set it

### Step 1.3: Configure Environment Variables

1. **Add Database Credentials**
   - Go to **"Configuration"** tab
   - Click **"Environment variables"** in left menu
   - Click **"Edit"**
   - Add each variable:

   | Key | Value |
   |-----|-------|
   | `DB_HOST` | Your RDS endpoint (e.g., `mydb.abc123.us-east-1.rds.amazonaws.com`) |
   | `DB_USER` | Your database username |
   | `DB_PASSWORD` | Your database password |
   | `DB_NAME` | `SREData` (or your database name) |

   - Click **"Save"**

### Step 1.4: Configure Function Settings

1. **Adjust Memory and Timeout**
   - Go to **"Configuration"** tab → **"General configuration"**
   - Click **"Edit"**
   - **Memory**: `512 MB` (minimum recommended)
   - **Timeout**: `30 seconds`
   - Click **"Save"**

2. **Configure VPC (if using RDS in VPC)**
   - Go to **"Configuration"** tab → **"VPC"**
   - Click **"Edit"**
   - **VPC**: Select the same VPC as your RDS
   - **Subnets**: Select at least 2 subnets in different availability zones
   - **Security groups**: Select security group that allows:
     - Outbound to RDS on port 3306
     - Outbound to internet (for external APIs if needed)
   - Click **"Save"**

   **Note**: This may take 1-2 minutes to apply

### Step 1.5: Create API Gateway Trigger

1. **Add HTTP API Trigger**
   - Go to Lambda function overview page
   - Click **"Add trigger"**
   - **Select a source**: Choose **"API Gateway"**
   - **Intent**: Select **"Create a new API"**
   - **API type**: **HTTP API** (simpler and cheaper than REST API)
   - **Security**: **Open** (you can add auth later)
   - Click **"Add"**

2. **Get Your API Endpoint URL**
   - After creation, you'll see the API endpoint
   - It will look like: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/default/sre-dashboard-api`
   - **SAVE THIS URL** - you'll need it in Part 3
   - Example format: `https://{api-id}.execute-api.{region}.amazonaws.com`

3. **Configure CORS (Important for frontend)**
   - Click on the API Gateway link in the trigger section
   - This opens API Gateway console
   - Select your API
   - Click **"CORS"** in left menu
   - Click **"Configure"**
   - **Access-Control-Allow-Origin**: `*` (or your Amplify domain)
   - **Access-Control-Allow-Methods**: Select all (GET, POST, PUT, DELETE, OPTIONS)
   - **Access-Control-Allow-Headers**: `*`
   - Click **"Save"**

### Step 1.6: Test Lambda Function

1. **Test Health Endpoint**
   - Go back to Lambda function
   - Click **"Test"** tab
   - Click **"Create new event"**
   - **Event name**: `health-check`
   - **Template**: API Gateway AWS Proxy
   - Replace JSON with:
   ```json
   {
     "httpMethod": "GET",
     "path": "/health",
     "headers": {},
     "queryStringParameters": null,
     "body": null
   }
   ```
   - Click **"Save"**
   - Click **"Test"**
   - You should see response with status 200 and `{"status":"ok",...}`

2. **Test in Browser**
   - Open your API Gateway URL + `/health`
   - Example: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/health`
   - You should see: `{"status":"ok","timestamp":"..."}`

3. **Test API Endpoints**
   - `/health` - Health check
   - `/api/servers` - Get all servers
   - `/api/stats` - Get statistics
   - `/api/monitoring/servers` - Get monitoring data
   - `/api/monitoring/usage` - Get usage data

**✅ Backend deployment complete! Note down your API Gateway URL.**

---

## Part 2: Deploy Frontend to Amplify

### Step 2.1: Prepare Your Repository (Option A - Recommended)

**If using Git:**

1. **Ensure your code is in a Git repository**
   ```bash
   git status
   ```

2. **Push to GitHub/GitLab/Bitbucket**
   ```bash
   git add .
   git commit -m "Prepare for Amplify deployment"
   git push origin main
   ```

### Step 2.1 Alternative: Manual Deployment (Option B)

**If NOT using Git, skip to Step 2.2 and choose manual deployment**

### Step 2.2: Create Amplify App

1. **Login to AWS Amplify Console**
   - Go to https://console.aws.amazon.com/amplify/

2. **Create New App**
   - Click **"Create new app"**
   - Choose deployment method:

   **Option A: Deploy with Git (Recommended)**
   - Select **"Host web app"**
   - Choose your Git provider (GitHub, GitLab, Bitbucket)
   - Authorize AWS Amplify to access your repository
   - Select your repository and branch
   - Click **"Next"**

   **Option B: Deploy without Git**
   - Select **"Deploy without Git provider"**
   - **App name**: `sre-dashboard`
   - **Environment name**: `production`
   - Click **"Next"**

3. **Configure Build Settings**
   - **App name**: `sre-dashboard`
   - **Environment name**: `production`
   - Amplify will auto-detect `amplify.yml`
   - Build settings should show:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - echo "No build required for static frontend"
       build:
         commands:
           - echo "Deploying static files..."
     artifacts:
       baseDirectory: /public
       files:
         - '**/*'
   ```
   - Click **"Next"**

4. **Review and Deploy**
   - Review all settings
   - Click **"Save and deploy"**
   - Amplify will start building and deploying
   - This takes 2-5 minutes

### Step 2.3: Manual Deployment (if not using Git)

If you chose "Deploy without Git":

1. **Prepare deployment folder**
   - Create a ZIP of the `public` folder:
   ```bash
   cd public
   zip -r ../amplify-frontend.zip .
   ```

2. **Upload via Amplify Console**
   - In Amplify app, go to **"Manual deploys"**
   - Drag and drop `amplify-frontend.zip`
   - Or click **"Choose files"** and select ZIP
   - Click **"Save and deploy"**

### Step 2.4: Get Amplify App URL

1. **Find Your App URL**
   - After deployment completes, you'll see your app URL
   - Format: `https://main.d1a2b3c4d5e6f7.amplifyapp.com`
   - **SAVE THIS URL**

2. **Test Frontend**
   - Click the URL to open your app
   - You should see the SRE Dashboard interface
   - It won't show data yet (we'll connect it in Part 3)

**✅ Frontend deployment complete!**

---

## Part 3: Connect Frontend to Backend

### Step 3.1: Update API Configuration

You need to update the frontend to use your Lambda API URL.

**Method 1: Update via Amplify Console (Recommended)**

1. **Go to Amplify Console**
   - Select your app
   - Go to **"Environment variables"**
   - Click **"Add variable"**
   - **Key**: `API_GATEWAY_URL`
   - **Value**: Your Lambda API Gateway URL (from Part 1, Step 1.5)
   - Click **"Save"**

2. **Update config.js in your repository**
   - Edit `public/config.js`
   - Replace `YOUR_LAMBDA_API_GATEWAY_URL` with your actual API Gateway URL

   ```javascript
   const API_BASE_URL = window.location.hostname === 'localhost'
       ? 'http://localhost:3000/api'
       : 'https://abc123xyz.execute-api.us-east-1.amazonaws.com/api';
   ```

3. **Push changes**
   ```bash
   git add public/config.js
   git commit -m "Update API Gateway URL"
   git push
   ```
   Amplify will automatically redeploy

**Method 2: Update app.js directly (if not using Git)**

1. **Edit public/app.js**
   - Find line 2: `const API_BASE_URL = 'http://localhost:3000/api';`
   - Replace with:
   ```javascript
   const API_BASE_URL = 'https://YOUR_API_GATEWAY_URL/api';
   ```
   - Replace `YOUR_API_GATEWAY_URL` with your actual URL

2. **Redeploy to Amplify**
   - Create new ZIP of public folder
   - Upload via Amplify Console → Manual deploy

### Step 3.2: Update index.html to include config

1. **Edit public/index.html**
   - Add this line in the `<head>` section BEFORE app.js:
   ```html
   <script src="config.js"></script>
   ```

2. **Update app.js to use config**
   - Change line 2 in app.js from:
   ```javascript
   const API_BASE_URL = 'http://localhost:3000/api';
   ```
   - To:
   ```javascript
   const API_BASE_URL = window.API_CONFIG?.BASE_URL || 'http://localhost:3000/api';
   ```

3. **Commit and push** (or redeploy manually)

### Step 3.3: Verify CORS Configuration

1. **Test API from browser console**
   - Open your Amplify app URL
   - Open browser DevTools (F12)
   - Go to Console tab
   - Run:
   ```javascript
   fetch('https://YOUR_API_GATEWAY_URL/health')
     .then(r => r.json())
     .then(d => console.log(d))
   ```
   - You should see `{status: "ok", ...}`

2. **If you see CORS errors**
   - Go back to API Gateway console
   - Reconfigure CORS (Part 1, Step 1.5, substep 3)
   - Make sure origin includes your Amplify domain

**✅ Connection complete!**

---

## Testing and Verification

### 1. Test Backend API

```bash
# Test health endpoint
curl https://YOUR_API_GATEWAY_URL/health

# Test servers endpoint
curl https://YOUR_API_GATEWAY_URL/api/servers

# Test stats endpoint
curl https://YOUR_API_GATEWAY_URL/api/stats
```

### 2. Test Frontend

1. Open Amplify URL in browser
2. Check browser console for errors (F12)
3. Verify data loads correctly
4. Check different sections:
   - Server monitoring
   - S3 bucket usage
   - Cloudflare R2 usage
   - Cloudflare zone usage

### 3. Monitor Lambda Logs

1. Go to Lambda console
2. Click **"Monitor"** tab
3. Click **"View CloudWatch Logs"**
4. Check for any errors during API calls

### 4. Check Amplify Logs

1. Go to Amplify console
2. Select your app
3. Click on deployment
4. View build logs for any issues

---

## Troubleshooting

### Frontend shows "Failed to load dashboard data"

**Cause**: Frontend can't reach Lambda API

**Solutions**:
1. Verify API Gateway URL in config.js is correct
2. Check CORS configuration in API Gateway
3. Test API directly in browser: `https://YOUR_API_URL/health`
4. Check browser console for specific errors

### Lambda timeout errors

**Cause**: Database queries taking too long

**Solutions**:
1. Increase Lambda timeout (Configuration → General → Timeout → 30-60 seconds)
2. Check database connection from Lambda
3. Verify VPC configuration if using RDS
4. Check security groups allow Lambda → RDS traffic

### Database connection failed

**Cause**: Lambda can't reach database

**Solutions**:
1. Verify environment variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
2. Check VPC configuration - Lambda must be in same VPC as RDS
3. Check security groups:
   - RDS security group must allow inbound from Lambda security group on port 3306
4. Check if database is running
5. Test connection from Lambda:
   - Use Test function with simple query
   - Check CloudWatch Logs for connection errors

### CORS errors in browser

**Cause**: API Gateway CORS not configured correctly

**Solutions**:
1. Go to API Gateway console
2. Select your API → CORS
3. Allow origin: `*` or specific Amplify domain
4. Allow methods: GET, POST, PUT, DELETE, OPTIONS
5. Allow headers: `*`
6. Deploy API changes

### Amplify build fails

**Cause**: Build configuration issue

**Solutions**:
1. Check amplify.yml is in root directory
2. Verify baseDirectory points to `/public`
3. Check build logs in Amplify console
4. Ensure all files are in public folder

### High Lambda costs

**Cause**: Too many invocations or long execution times

**Solutions**:
1. Implement caching in frontend (reduce API calls)
2. Optimize database queries
3. Reduce Lambda memory if possible
4. Consider using API Gateway caching
5. Monitor CloudWatch metrics

### Database credentials visible in environment variables

**Concern**: Environment variables are visible in Lambda console

**Solution** (More secure):
1. Use AWS Secrets Manager:
   - Store DB credentials in Secrets Manager
   - Update Lambda code to fetch from Secrets Manager
   - Grant Lambda IAM role access to the secret
2. Use AWS RDS IAM authentication instead of password

---

## Cost Estimates (AWS Free Tier)

### Lambda
- **Free tier**: 1 million requests/month
- **Typical cost**: $0.00 - $5/month for small traffic

### API Gateway (HTTP API)
- **Free tier**: 1 million requests/month
- **Typical cost**: $0.00 - $5/month

### Amplify Hosting
- **Free tier**: 15 GB storage, 5 GB served/month
- **Typical cost**: $0.00 - $1/month

### RDS MySQL (if using)
- **Free tier**: db.t2.micro, 20 GB storage (12 months only)
- **After free tier**: $15-30/month for db.t3.micro

**Total estimated cost**: $0-10/month with free tier, $20-50/month after

---

## Security Best Practices

### 1. Database Security
- ✅ Use AWS Secrets Manager for credentials
- ✅ Enable SSL/TLS for database connections
- ✅ Restrict database security group to Lambda only
- ✅ Use IAM database authentication

### 2. API Security
- ✅ Implement API Gateway authentication (API keys, Cognito, IAM)
- ✅ Enable AWS WAF for DDoS protection
- ✅ Set up usage plans and rate limiting
- ✅ Use HTTPS only

### 3. Lambda Security
- ✅ Use least privilege IAM roles
- ✅ Enable AWS X-Ray for tracing
- ✅ Encrypt environment variables
- ✅ Keep dependencies updated

### 4. Monitoring
- ✅ Set up CloudWatch alarms for errors
- ✅ Monitor Lambda execution duration
- ✅ Track API Gateway 4xx/5xx errors
- ✅ Set budget alerts

---

## Next Steps

1. **Set up custom domain**
   - Use Route 53 for DNS
   - Add custom domain in Amplify

2. **Implement authentication**
   - Use Amazon Cognito
   - Add login page
   - Secure API endpoints

3. **Enable monitoring**
   - Set up CloudWatch dashboards
   - Configure SNS alerts
   - Enable AWS X-Ray tracing

4. **Optimize performance**
   - Enable API Gateway caching
   - Implement CloudFront CDN
   - Add database read replicas

5. **Automate deployments**
   - Set up CI/CD pipeline
   - Use AWS CodePipeline
   - Implement blue-green deployments

---

## Support and Resources

- **AWS Lambda Documentation**: https://docs.aws.amazon.com/lambda/
- **AWS Amplify Documentation**: https://docs.amplify.aws/
- **API Gateway Documentation**: https://docs.aws.amazon.com/apigateway/
- **Troubleshooting Guide**: Check CloudWatch Logs first
- **Cost Calculator**: https://calculator.aws/

---

## Summary Checklist

### Backend (Lambda)
- [ ] Created lambda-deployment.zip with all files
- [ ] Created Lambda function `sre-dashboard-api`
- [ ] Uploaded deployment package
- [ ] Configured environment variables (DB credentials)
- [ ] Set memory to 512MB and timeout to 30s
- [ ] Configured VPC (if using RDS)
- [ ] Added API Gateway HTTP API trigger
- [ ] Configured CORS in API Gateway
- [ ] Tested health endpoint
- [ ] Noted API Gateway URL

### Frontend (Amplify)
- [ ] Pushed code to Git (or prepared ZIP)
- [ ] Created Amplify app
- [ ] Configured build settings (amplify.yml)
- [ ] Deployed successfully
- [ ] Noted Amplify app URL

### Connection
- [ ] Updated config.js with API Gateway URL
- [ ] Added config.js to index.html
- [ ] Verified CORS configuration
- [ ] Tested API calls from frontend
- [ ] Confirmed data loads correctly

### Verification
- [ ] All API endpoints working
- [ ] Frontend displays data correctly
- [ ] No errors in browser console
- [ ] No errors in CloudWatch Logs
- [ ] Dashboard refreshes automatically

**🎉 Congratulations! Your SRE Dashboard is now live on AWS!**
