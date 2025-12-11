# Quick Start Guide - AWS Console Deployment

## 🚀 Deploy in 3 Steps

### Step 1: Deploy Backend (Lambda) - 10 minutes

1. **Prepare package**
   ```bash
   cd lambda-backend
   npm install
   # Windows PowerShell:
   Compress-Archive -Path * -DestinationPath lambda-deployment.zip -Force
   ```

2. **Create Lambda in AWS Console**
   - Go to: https://console.aws.amazon.com/lambda/
   - Click "Create function"
   - Name: `sre-dashboard-api`
   - Runtime: Node.js 18.x
   - Upload `lambda-deployment.zip`

3. **Configure Lambda**
   - Add environment variables:
     - `DB_HOST` = your-database-host
     - `DB_USER` = your-db-username
     - `DB_PASSWORD` = your-db-password
     - `DB_NAME` = SREData
   - Set timeout to 30 seconds
   - Add API Gateway HTTP API trigger
   - **Save the API Gateway URL!**

### Step 2: Deploy Frontend (Amplify) - 5 minutes

1. **Go to Amplify Console**
   - Visit: https://console.aws.amazon.com/amplify/

2. **Deploy**
   - Click "Create new app"
   - Choose deployment method:
     - **With Git**: Connect your repository
     - **Without Git**: Upload ZIP of `/public` folder
   - **Save the Amplify URL!**

### Step 3: Connect Frontend to Backend - 2 minutes

1. **Update API URL**
   - Edit `public/config.js`
   - Replace `YOUR_LAMBDA_API_GATEWAY_URL` with your API Gateway URL from Step 1
   - Example: `https://abc123.execute-api.us-east-1.amazonaws.com`

2. **Redeploy frontend**
   - If using Git: commit and push
   - If manual: re-upload ZIP to Amplify

## ✅ Done!

Open your Amplify URL and your dashboard should be live!

## 📝 Important URLs to Save

| Service | URL | Location |
|---------|-----|----------|
| Lambda API | `https://______.execute-api.______.amazonaws.com` | Lambda → Triggers |
| Amplify App | `https://______.amplifyapp.com` | Amplify → App URL |

## 🔍 Troubleshooting

**Problem**: Frontend shows "Failed to load dashboard data"

**Quick Fix**:
1. Check `public/config.js` has correct API URL
2. Test API directly: open `https://YOUR_API_URL/health` in browser
3. Check CORS in API Gateway console (allow origin `*`)

**Problem**: Lambda timeout

**Quick Fix**:
1. Go to Lambda → Configuration → General
2. Increase timeout to 30-60 seconds
3. Check database security group allows Lambda access

## 📚 Full Documentation

See `DEPLOYMENT-GUIDE.md` for detailed step-by-step instructions.
See `lambda-backend/README-LAMBDA.md` for Lambda-specific details.

## 💰 Cost Estimate

- Lambda: Free tier covers 1M requests/month
- API Gateway: Free tier covers 1M requests/month
- Amplify: Free tier covers 15GB storage
- **Total**: $0-5/month with normal usage

## 🔐 Security Notes

After deployment, consider:
1. Enable API Gateway authentication
2. Use AWS Secrets Manager for database credentials
3. Restrict CORS to your Amplify domain only
4. Set up CloudWatch alarms

---

**Need help?** Check CloudWatch Logs in Lambda console for detailed error messages.
