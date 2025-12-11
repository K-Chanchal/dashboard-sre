# AWS Console Copy-Paste Guide
## Exact Values to Use in AWS Console

This guide shows EXACTLY what to enter in each AWS Console field.

---

## Part 1: Lambda Function Setup

### 1.1 Create Function Page

| Field | Value to Enter |
|-------|----------------|
| **Function option** | Author from scratch |
| **Function name** | `sre-dashboard-api` |
| **Runtime** | Node.js 18.x (or latest Node.js) |
| **Architecture** | x86_64 |
| **Permissions** | (Leave default - Create new role) |

Click: **Create function**

---

### 1.2 Environment Variables (Configuration → Environment variables → Edit)

Click **Add environment variable** for each:

| Key | Value (Replace with your actual values) |
|-----|------------------------------------------|
| `DB_HOST` | `your-database-endpoint.rds.amazonaws.com` |
| `DB_USER` | `your-database-username` |
| `DB_PASSWORD` | `your-database-password` |
| `DB_NAME` | `SREData` |

**Example:**
```
DB_HOST     = dev-reporting.ci6mjliljpfn.us-west-2.rds.amazonaws.com
DB_USER     = admin
DB_PASSWORD = YourSecurePassword123!
DB_NAME     = SREData
```

Click: **Save**

---

### 1.3 General Configuration (Configuration → General configuration → Edit)

| Field | Value to Enter |
|-------|----------------|
| **Memory** | `512` MB |
| **Timeout** | `30` seconds |

Click: **Save**

---

### 1.4 Add API Gateway Trigger (Function overview → Add trigger)

| Field | Value to Select/Enter |
|-------|------------------------|
| **Select a source** | API Gateway |
| **Intent** | Create a new API |
| **API type** | HTTP API |
| **Security** | Open |

Click: **Add**

**IMPORTANT**: After trigger is created, you'll see:
```
API endpoint: https://abc123xyz.execute-api.us-east-1.amazonaws.com/default/sre-dashboard-api
```

**📝 COPY AND SAVE THIS URL!** You'll need it later.

---

### 1.5 Test Lambda Function (Test tab → Test)

Create test event with this JSON:

```json
{
  "httpMethod": "GET",
  "path": "/health",
  "headers": {},
  "queryStringParameters": null,
  "body": null
}
```

**Event name**: `health-check`

Click: **Save** then **Test**

**Expected result**: Status 200 with body:
```json
{
  "status": "ok",
  "timestamp": "2024-12-10T..."
}
```

---

## Part 2: API Gateway CORS Setup

### 2.1 Navigate to API Gateway

1. From Lambda console, click on the API Gateway trigger
2. Or go to: https://console.aws.amazon.com/apigateway/
3. Select your API (e.g., `sre-dashboard-api-...`)

### 2.2 Configure CORS (CORS → Configure)

| Field | Value to Enter |
|-------|----------------|
| **Access-Control-Allow-Origin** | `*` |
| **Access-Control-Allow-Headers** | `*` |
| **Access-Control-Allow-Methods** | Select all: GET, POST, PUT, DELETE, OPTIONS |
| **Access-Control-Expose-Headers** | (leave empty) |
| **Access-Control-Max-Age** | (leave default) |
| **Access-Control-Allow-Credentials** | (leave unchecked) |

Click: **Save**

---

## Part 3: Amplify App Setup

### 3.1 Create App Page

Go to: https://console.aws.amazon.com/amplify/

Click: **Create new app**

#### If Using Git:

| Field | Value to Select/Enter |
|-------|------------------------|
| **Choose your Git provider** | GitHub / GitLab / Bitbucket |
| **Repository** | Select `dashboard-sre` |
| **Branch** | `main` |

Click: **Next**

#### If NOT Using Git:

Select: **Deploy without Git provider**

| Field | Value to Enter |
|-------|----------------|
| **App name** | `sre-dashboard` |
| **Environment name** | `production` |

---

### 3.2 Build Settings

Amplify should auto-detect `amplify.yml`. If not, paste this:

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
  cache:
    paths: []
```

| Field | Value to Enter |
|-------|----------------|
| **Build and test settings** | (Use auto-detected amplify.yml) |
| **Base directory** | (leave empty) |

Click: **Next**

---

### 3.3 Review and Deploy

Review all settings and click: **Save and deploy**

Wait 2-5 minutes for deployment to complete.

**After deployment completes**, you'll see:
```
https://main.d1a2b3c4d5e6f7.amplifyapp.com
```

**📝 COPY AND SAVE THIS URL!** This is your live dashboard.

---

## Part 4: Connect Frontend to Backend

### 4.1 Update config.js

Open: `public/config.js`

**Find this line:**
```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'YOUR_LAMBDA_API_GATEWAY_URL/api';
```

**Replace with** (use YOUR API Gateway URL from Part 1.4):
```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://abc123xyz.execute-api.us-east-1.amazonaws.com/api';
```

**IMPORTANT**:
- Remove `/default/sre-dashboard-api` from the URL
- Keep only the base URL up to `.amazonaws.com`
- Add `/api` at the end

**Example transformation:**
```
❌ Wrong:
https://abc123.execute-api.us-east-1.amazonaws.com/default/sre-dashboard-api

✅ Correct:
https://abc123.execute-api.us-east-1.amazonaws.com/api
```

---

### 4.2 Update index.html

Open: `public/index.html`

**Find the `<head>` section and add this line BEFORE the app.js script:**

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SRE Monitoring Dashboard</title>
    <link rel="stylesheet" href="styles.css">

    <!-- Add this line: -->
    <script src="config.js"></script>

    <!-- Before this line: -->
    <script src="app.js" defer></script>
</head>
```

---

### 4.3 Update app.js (First Line)

Open: `public/app.js`

**Find line 2:**
```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

**Replace with:**
```javascript
const API_BASE_URL = window.API_CONFIG?.BASE_URL || 'http://localhost:3000/api';
```

---

### 4.4 Redeploy Frontend

#### If Using Git:
```bash
git add public/config.js public/index.html public/app.js
git commit -m "Update API Gateway URL"
git push
```
Amplify will automatically redeploy.

#### If NOT Using Git:
1. Create new ZIP of the `public` folder
2. Go to Amplify Console → Your App
3. Under "Recent deployments", click **Actions** → **Redeploy this version**
4. Or create a new manual deployment

---

## Part 5: Verification

### 5.1 Test API Directly

Open in browser:
```
https://YOUR_API_GATEWAY_URL/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-10T22:50:00.000Z"
}
```

---

### 5.2 Test Frontend

1. Open your Amplify URL in browser:
   ```
   https://YOUR_APP.amplifyapp.com
   ```

2. Open browser DevTools (Press F12)

3. Go to **Console** tab

4. Look for any errors (should be none)

5. Dashboard should load with data

---

### 5.3 Check CloudWatch Logs

1. Go to Lambda console → Your function
2. Click **Monitor** tab
3. Click **View CloudWatch logs**
4. Open the latest log stream
5. Check for errors

---

## 📝 Your Deployment Information

Fill this out as you go:

```
┌─────────────────────────────────────────────────────────────┐
│               DEPLOYMENT INFORMATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Lambda Function Name:                                        │
│ sre-dashboard-api                                           │
│                                                              │
│ Lambda Region:                                               │
│ _________________                                            │
│                                                              │
│ API Gateway URL:                                             │
│ https://_________________________.amazonaws.com              │
│                                                              │
│ Amplify App Name:                                            │
│ sre-dashboard                                               │
│                                                              │
│ Amplify URL:                                                 │
│ https://_________________________.amplifyapp.com             │
│                                                              │
│ Database Host:                                               │
│ _________________________                                    │
│                                                              │
│ Database Name:                                               │
│ SREData                                                      │
│                                                              │
│ Deployment Date:                                             │
│ _________________________                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Completion Checklist

- [ ] Lambda function created
- [ ] Lambda code uploaded (ZIP file)
- [ ] Environment variables added (DB credentials)
- [ ] Memory set to 512MB, timeout to 30s
- [ ] API Gateway trigger added
- [ ] API Gateway URL saved
- [ ] CORS configured in API Gateway
- [ ] Tested Lambda with health check
- [ ] Amplify app created
- [ ] Amplify deployed successfully
- [ ] Amplify URL saved
- [ ] Updated `public/config.js` with API URL
- [ ] Updated `public/index.html` to include config.js
- [ ] Updated `public/app.js` to use config
- [ ] Redeployed frontend with changes
- [ ] Tested API endpoint in browser (/health)
- [ ] Tested Amplify URL in browser
- [ ] No errors in browser console
- [ ] Dashboard loads data successfully
- [ ] CloudWatch Logs show no errors

---

## 🎉 You're Done!

**Your SRE Dashboard is now live on AWS!**

**Frontend**: Your Amplify URL
**Backend**: Your API Gateway URL

---

## 🆘 Quick Troubleshooting

### Dashboard shows "Failed to load data"

1. Check browser console (F12) for specific error
2. Verify API URL in `public/config.js` is correct
3. Test API directly: `https://YOUR_API_URL/health`
4. Check CORS configuration in API Gateway

### API returns errors

1. Go to Lambda → Monitor → View CloudWatch logs
2. Look for error messages
3. Check environment variables are correct
4. Verify database is accessible from Lambda

### Database connection errors

1. Check Lambda environment variables
2. Verify VPC configuration (if using RDS in VPC)
3. Check security groups (Lambda → RDS on port 3306)
4. Verify database credentials

---

**Need more help?** Check `DEPLOYMENT-GUIDE.md` for detailed troubleshooting.
