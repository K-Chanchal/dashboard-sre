# Lambda Backend Deployment Guide

This directory contains the Lambda function code for the SRE Dashboard backend API.

## Files Overview

- `index.js` - Main Lambda function handler with Express API routes
- `package.json` - Node.js dependencies for Lambda
- `.env.template` - Environment variables template

## Prerequisites

1. AWS Account with access to:
   - AWS Lambda
   - Amazon RDS (MySQL database)
   - API Gateway (automatically created with Lambda)
   - IAM roles for Lambda execution

2. Your MySQL database should be accessible from Lambda (use RDS in the same VPC or configure security groups)

## Step-by-Step Deployment via AWS Console

### Step 1: Prepare the Deployment Package

1. Open terminal in the `lambda-backend` directory
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a deployment ZIP file:
   ```bash
   # Windows (PowerShell)
   Compress-Archive -Path * -DestinationPath lambda-deployment.zip -Force

   # Or using 7-Zip
   7z a -tzip lambda-deployment.zip *

   # Linux/Mac
   zip -r lambda-deployment.zip .
   ```

**Important**: The ZIP file should contain:
- `index.js`
- `package.json`
- `node_modules/` (entire folder with all dependencies)

### Step 2: Create Lambda Function in AWS Console

1. **Login to AWS Console**
   - Go to https://console.aws.amazon.com/lambda/

2. **Create Function**
   - Click "Create function"
   - Choose "Author from scratch"
   - Function name: `sre-dashboard-api`
   - Runtime: `Node.js 18.x` (or latest Node.js version)
   - Architecture: `x86_64`
   - Click "Create function"

3. **Upload Code**
   - In the "Code" tab, click "Upload from"
   - Select ".zip file"
   - Upload the `lambda-deployment.zip` file you created
   - Click "Save"

4. **Configure Handler** (should be set automatically)
   - Handler: `index.handler`

5. **Configure Environment Variables**
   - Go to "Configuration" tab → "Environment variables"
   - Click "Edit" → "Add environment variable"
   - Add these variables:
     ```
     DB_HOST=your-rds-endpoint.rds.amazonaws.com
     DB_USER=your-db-username
     DB_PASSWORD=your-db-password
     DB_NAME=SREData
     ```
   - Click "Save"

6. **Configure Function Settings**
   - Go to "Configuration" tab → "General configuration"
   - Click "Edit"
   - Set:
     - Memory: `512 MB` (minimum, adjust based on load)
     - Timeout: `30 seconds` (for database queries)
   - Click "Save"

7. **Configure VPC (if your RDS is in a VPC)**
   - Go to "Configuration" tab → "VPC"
   - Click "Edit"
   - Select your VPC
   - Select subnets (at least 2 in different AZs)
   - Select security group that allows access to RDS
   - Click "Save"

### Step 3: Create API Gateway Trigger

1. **Add Trigger**
   - In Lambda function page, click "Add trigger"
   - Select "API Gateway"
   - Choose "Create a new API"
   - API type: "HTTP API" (simpler and cheaper)
   - Security: "Open" (or configure later with authentication)
   - Click "Add"

2. **Note the API Endpoint**
   - After creation, you'll see the API endpoint URL
   - Example: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/default/sre-dashboard-api`
   - **Save this URL** - you'll need it for the frontend configuration

3. **Configure CORS (if needed)**
   - Go to API Gateway console
   - Select your API
   - Go to "CORS" settings
   - Add allowed origins (or use `*` for testing)
   - Save changes

### Step 4: Test the Lambda Function

1. **Test via Console**
   - Go back to Lambda function
   - Click "Test" tab
   - Create a test event with this JSON:
   ```json
   {
     "httpMethod": "GET",
     "path": "/health",
     "headers": {},
     "queryStringParameters": null,
     "body": null
   }
   ```
   - Click "Test"
   - You should see a 200 response with `{"status":"ok",...}`

2. **Test via Browser**
   - Open the API Gateway endpoint URL in browser
   - Append `/health` to test: `https://your-api-url/health`
   - You should see the health check response

3. **Test API Endpoints**
   - `/health` - Health check
   - `/api/servers` - Get all servers
   - `/api/stats` - Get statistics
   - `/api/monitoring/servers` - Get monitoring data
   - `/api/monitoring/usage` - Get usage data

## Security Considerations

1. **Database Security**
   - Ensure RDS security group allows inbound traffic from Lambda security group
   - Use AWS Secrets Manager to store database credentials (optional, more secure)

2. **API Security**
   - Consider adding API Gateway authentication (API Keys, IAM, Cognito)
   - Set up usage plans and throttling
   - Configure CORS properly for production

3. **Lambda Execution Role**
   - The automatically created role should have:
     - `AWSLambdaBasicExecutionRole` (for CloudWatch Logs)
     - `AWSLambdaVPCAccessExecutionRole` (if using VPC)

## Monitoring and Logs

1. **CloudWatch Logs**
   - Go to CloudWatch console
   - Navigate to Logs → Log groups
   - Find `/aws/lambda/sre-dashboard-api`
   - View execution logs and errors

2. **CloudWatch Metrics**
   - Monitor invocations, duration, errors
   - Set up alarms for error rates

## Cost Optimization

1. **Lambda Pricing** (Free Tier: 1M requests/month)
   - Charges based on requests and execution time
   - Keep memory allocation optimal

2. **API Gateway** (HTTP API: Free Tier: 1M requests/month)
   - HTTP APIs are cheaper than REST APIs

3. **Connection Pooling**
   - The code uses MySQL connection pooling
   - Connections are reused across Lambda invocations

## Troubleshooting

### Database Connection Timeouts
- Check VPC configuration
- Verify security groups
- Increase Lambda timeout

### CORS Errors
- Configure CORS in API Gateway
- Check allowed origins

### High Latency on First Request (Cold Start)
- Normal for serverless - first request initializes the function
- Consider using Lambda provisioned concurrency for production

### Memory/Timeout Errors
- Increase memory allocation
- Increase timeout value
- Optimize database queries

## Next Steps

After deploying Lambda:
1. Test all API endpoints
2. Note down the API Gateway URL
3. Update frontend configuration to use this URL
4. Deploy frontend to Amplify (see DEPLOYMENT-GUIDE.md)
