require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { getRecords } = require('./googleSheets');
const { expenseCategories, paymentMethods } = require('./categories');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Accounting API is running',
  });
});

app.get('/api/categories', (req, res) => {
  res.json({
    expenseCategories,
    paymentMethods,
  });
});

app.get('/api/records', async (req, res) => {
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

app.listen(port, () => {
  console.log(`Accounting API: http://localhost:${port}`);
});
