# SRE Dashboard - Live Monitoring System

A real-time SRE (Site Reliability Engineering) dashboard with news ticker-style animations for monitoring server and service status. Features horizontal scrolling alerts, color-coded status indicators, and automatic data refresh.

## Features

- **News Ticker Animation**: Breaking news style horizontal scrolling ticker displaying critical alerts
- **Color-Coded Status**: Visual indicators for online (green), warning (orange), critical (red), and offline (gray) states
- **Real-Time Updates**: Auto-refreshes every 5 seconds to display latest server status
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Server Monitoring**: Track CPU usage, memory usage, uptime, and custom messages
- **Statistical Overview**: Live stats showing total servers by status category

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Styling**: Custom CSS with animations and gradients

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn package manager

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd dashboard-sre
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up MySQL database

Run the schema file to create the database and tables:

```bash
mysql -u root -p < database/schema.sql
```

This will:
- Create `sre_dashboard` database
- Create `server_status` table
- Insert sample data for testing

### 4. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and update with your MySQL credentials:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sre_dashboard
```

## Usage

### Start the server

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

### Access the dashboard

Open your browser and navigate to:

```
http://localhost:3000
```

## API Endpoints

### GET /api/servers
Get all servers with their current status

**Response:**
```json
[
  {
    "id": 1,
    "server_name": "prod-web-01",
    "service_name": "Web Server",
    "status": "online",
    "location": "US-East",
    "uptime_hours": 720.5,
    "cpu_usage": 45.2,
    "memory_usage": 62.8,
    "message": "All systems operational",
    "last_check": "2024-01-15T10:30:00.000Z"
  }
]
```

### GET /api/servers/:id
Get specific server by ID

### GET /api/servers/status/:status
Get servers filtered by status (online, warning, critical, offline)

### GET /api/stats
Get summary statistics

**Response:**
```json
{
  "total": 12,
  "online": 8,
  "warning": 2,
  "critical": 1,
  "offline": 1,
  "avg_cpu": 45.3,
  "avg_memory": 58.7
}
```

### PUT /api/servers/:id
Update server status (for testing)

**Request Body:**
```json
{
  "status": "warning",
  "cpu_usage": 85.5,
  "memory_usage": 90.2,
  "message": "High resource usage detected"
}
```

### GET /health
Health check endpoint

## Project Structure

```
dashboard-sre/
├── src/
│   ├── server.js          # Express server and API routes
│   └── db.js              # MySQL connection pool
├── public/
│   ├── index.html         # Main HTML file
│   ├── styles.css         # Styling and animations
│   └── app.js             # Frontend JavaScript
├── database/
│   └── schema.sql         # Database schema and sample data
├── .env.example           # Environment variables template
├── .gitignore             # Git ignore rules
├── package.json           # Project dependencies
└── README.md              # This file
```

## Customization

### Adjust Refresh Interval

Edit `public/app.js`:

```javascript
const REFRESH_INTERVAL = 5000; // Change to desired milliseconds
```

### Modify Ticker Animation Speed

Edit `public/app.js` in the `updateTicker` function:

```javascript
const animationDuration = Math.max(30, itemCount * 8); // Adjust multiplier
```

### Change Color Scheme

Edit `public/styles.css` to customize colors for different status states.

## Status Color Codes

- **Green** (#00ff00): Online - System operating normally
- **Orange** (#ffa500): Warning - Performance degradation or high resource usage
- **Red** (#ff4444): Critical - Service disruption or failure
- **Gray** (#888): Offline - Service unavailable

## Features Explained

### News Ticker Animation

The ticker displays important alerts in a continuous horizontal scroll, similar to breaking news on TV channels. Critical and warning status servers are highlighted with flashing animations to draw attention.

### Auto-Refresh

The dashboard automatically polls the API every 5 seconds to fetch updated server data. The refresh pauses when the browser tab is hidden to save resources.

### Color-Coded Cards

Each server is displayed as a card with:
- Left border color indicating status
- Animated effects (shake for critical, pulse for warnings)
- Detailed metrics (CPU, memory, uptime, location)
- Custom status messages

## Troubleshooting

### Database Connection Error

Ensure MySQL is running and credentials in `.env` are correct:

```bash
mysql -u root -p
USE sre_dashboard;
SELECT * FROM server_status;
```

### Port Already in Use

Change the PORT in `.env` file:

```env
PORT=3001
```

### CORS Issues

If accessing from a different domain, update CORS settings in `src/server.js`:

```javascript
app.use(cors({
    origin: 'https://yourdomain.com'
}));
```

## License

ISC

## Contributing

Feel free to submit issues and enhancement requests!
