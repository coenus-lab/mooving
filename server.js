import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gym-data.json');
const MAIL_LOG = path.join(DATA_DIR, 'mail.log');

const defaultData = {
  memberships: [],
  bookings: [],
  classes: [
    { id: 'c1', day: 'Monday', time: '06:30', name: 'HIIT', coach: 'Maya', spots: 18 },
    { id: 'c2', day: 'Tuesday', time: '19:00', name: 'Yoga', coach: 'Leo', spots: 16 },
    { id: 'c3', day: 'Wednesday', time: '18:00', name: 'Boxing Fit', coach: 'Sara', spots: 14 },
    { id: 'c4', day: 'Thursday', time: '19:00', name: 'Cross Training', coach: 'Nina', spots: 20 },
    { id: 'c5', day: 'Saturday', time: '09:00', name: 'Team Bootcamp', coach: 'Maya', spots: 22 }
  ]
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  if (!fs.existsSync(MAIL_LOG)) fs.writeFileSync(MAIL_LOG, '');
}

function readData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendNotification(subject, text, to) {
  const line = `[${new Date().toISOString()}] TO:${to} | ${subject}\n${text}\n---\n`;
  fs.appendFileSync(MAIL_LOG, line);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function serveStatic(req, res) {
  const requested = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(requested).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType =
    ext === '.html' ? 'text/html' :
    ext === '.css' ? 'text/css' :
    ext === '.js' ? 'application/javascript' :
    ext === '.json' ? 'application/json' :
    'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && req.url === '/api/classes') {
      const data = readData();
      const bookingsCount = data.bookings.reduce((acc, booking) => {
        acc[booking.classId] = (acc[booking.classId] || 0) + 1;
        return acc;
      }, {});

      const classes = data.classes.map((item) => ({
        ...item,
        booked: bookingsCount[item.id] || 0,
        remaining: item.spots - (bookingsCount[item.id] || 0)
      }));
      return sendJson(res, 200, classes);
    }

    if (req.method === 'POST' && req.url === '/api/memberships') {
      const payload = await parseBody(req);
      const { name, email, plan, goal } = payload;
      if (!name || !email || !plan) return sendJson(res, 400, { error: 'name, email and plan are required' });

      const data = readData();
      const membership = {
        id: `m_${Date.now()}`,
        name,
        email,
        plan,
        goal: goal || 'General fitness',
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      data.memberships.push(membership);
      writeData(data);

      sendNotification(
        `New PulseFit membership: ${membership.plan}`,
        `Name: ${membership.name}\nEmail: ${membership.email}\nPlan: ${membership.plan}\nGoal: ${membership.goal}`,
        process.env.GYM_ADMIN_EMAIL || 'admin@pulsefit.local'
      );

      return sendJson(res, 201, { success: true, membership });
    }

    if (req.method === 'POST' && req.url === '/api/bookings') {
      const payload = await parseBody(req);
      const { classId, memberName, memberEmail } = payload;
      if (!classId || !memberName || !memberEmail) {
        return sendJson(res, 400, { error: 'classId, memberName and memberEmail are required' });
      }

      const data = readData();
      const classItem = data.classes.find((item) => item.id === classId);
      if (!classItem) return sendJson(res, 404, { error: 'class not found' });

      const existing = data.bookings.filter((booking) => booking.classId === classId).length;
      if (existing >= classItem.spots) return sendJson(res, 409, { error: 'class is full' });

      const booking = {
        id: `b_${Date.now()}`,
        classId,
        memberName,
        memberEmail,
        createdAt: new Date().toISOString()
      };

      data.bookings.push(booking);
      writeData(data);

      sendNotification(
        `Class booking confirmed: ${classItem.name}`,
        `Member: ${memberName}\nEmail: ${memberEmail}\nClass: ${classItem.day} ${classItem.time} ${classItem.name}`,
        memberEmail
      );

      return sendJson(res, 201, { success: true, booking });
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  ensureDataFile();
  console.log(`PulseFit app running on http://localhost:${PORT}`);
});
