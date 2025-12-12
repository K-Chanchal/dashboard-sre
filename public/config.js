// API Configuration
// IMPORTANT: Replace this URL with your Lambda API Gateway endpoint after deployment
// Example: https://abc123xyz.execute-api.us-east-1.amazonaws.com
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : 'https://qnw5w902f4.execute-api.us-west-2.amazonaws.com/default/api';

// Export for use in app.js
window.API_CONFIG = {
    BASE_URL: API_BASE_URL
};
