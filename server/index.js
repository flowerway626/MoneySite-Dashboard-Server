require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const { getRecords } = require('./googleSheets');
const { expenseCategories, paymentMethods } = require('./categories');

const app = express();
const port = Number(process.env.PORT || 3000);

// ==============================
// 基本設定
// ==============================

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);

app.use(express.json());

// ==============================
// 登入 Token
// ==============================

// 根據 Render 的密碼產生固定 Token
// 不會把真正的密碼放進 Cookie
function getSessionToken() {
  return crypto
    .createHash('sha256')
    .update(process.env.DASHBOARD_PASSWORD || '')
    .digest('hex');
}

// ==============================
// 取得 Cookie
// ==============================

function getCookie(req, name) {
  const cookies = req.headers.cookie;

  if (!cookies) {
    return null;
  }

  const cookie = cookies
    .split(';')
    .map(item => item.trim())
    .find(item => item.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.substring(name.length + 1));
}

// ==============================
// 登入驗證 Middleware
// ==============================

function requireAuth(req, res, next) {
  const token = getCookie(req, 'dashboard_auth');

  if (!token || token !== getSessionToken()) {
    return res.status(401).json({
      success: false,
      message: '未登入',
    });
  }

  next();
}

// ==============================
// 登入
// ==============================

app.post('/api/login', (req, res) => {
  const { password } = req.body;

  if (!process.env.DASHBOARD_PASSWORD) {
    return res.status(500).json({
      success: false,
      message: '尚未設定登入密碼',
    });
  }

  if (password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: '密碼錯誤',
    });
  }

  const token = getSessionToken();

  const isProduction = process.env.NODE_ENV === 'production';

  res.setHeader(
    'Set-Cookie',
    [
      `dashboard_auth=${token}`,
      'HttpOnly',
      isProduction ? 'Secure' : '',
      isProduction ? 'SameSite=None' : 'SameSite=Lax',
      'Path=/',
      'Max-Age=604800',
    ]
      .filter(Boolean)
      .join('; ')
  );

  return res.json({
    success: true,
  });
});

// ==============================
// 登入狀態確認
// ==============================

app.get('/api/auth/check', requireAuth, (req, res) => {
  res.json({
    success: true,
  });
});

// ==============================
// 登出
// ==============================

app.post('/api/logout', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.setHeader(
    'Set-Cookie',
    [
      'dashboard_auth=',
      'HttpOnly',
      isProduction ? 'Secure' : '',
      isProduction ? 'SameSite=None' : 'SameSite=Lax',
      'Path=/',
      'Max-Age=0',
    ]
      .filter(Boolean)
      .join('; ')
  );

  res.json({
    success: true,
  });
});

// ==============================
// Health Check
// ==============================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Accounting API is running',
  });
});

// ==============================
// Categories
// ==============================

app.get('/api/categories', requireAuth, (req, res) => {
  res.json({
    expenseCategories,
    paymentMethods,
  });
});

// ==============================
// Records
// ==============================

app.get('/api/records', requireAuth, async (req, res) => {
  try {
    const records = await getRecords();

    const { year, month, type } = req.query;

    let result = records;

    if (year) {
      result = result.filter(record => record.date.startsWith(`${year}-`));
    }

    if (year && month) {
      const monthText = String(month).padStart(2, '0');

      result = result.filter(record => record.date.startsWith(`${year}-${monthText}-`));
    }

    if (type) {
      result = result.filter(record => record.type === type);
    }

    res.json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message || '讀取 Google Sheets 失敗',
    });
  }
});

// ==============================
// 啟動 Server
// ==============================

app.listen(port, () => {
  console.log(`Accounting API: http://localhost:${port}`);
});
