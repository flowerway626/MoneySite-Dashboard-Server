const { google } = require('googleapis');
const path = require('path');

function getAuth() {
  const credentialsPath = path.resolve(
    process.env.GOOGLE_CREDENTIALS || './credentials/service-account.json'
  );

  return new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '');
}

function parseAmount(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') return value;

  const cleaned = String(value)
    .replace(/[$,NTD元]/gi, '')
    .replace(/\s/g, '');

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  // yyyy/mm/dd, yyyy-mm-dd
  let match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  // Google Sheets serial date
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 100000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return null;
}

function getField(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      return row[name];
    }
  }
  return '';
}

function normalizeRecord(row, index) {
  const incomeCategory = getField(row, ['收入類別']);
  const expenseCategory = getField(row, ['支出類別']);

  const incomeAmount = parseAmount(getField(row, ['收入金額']));
  const expenseAmount = parseAmount(getField(row, ['支出金額']));

  const rawType = String(getField(row, ['收支']) || '').trim();

  // 若收支欄有值，以收支欄為準；若沒有，依金額欄自動判斷。
  let type = rawType;
  if (!type) {
    type = incomeAmount > 0 ? '收入' : '支出';
  }

  const amount = type === '收入' ? incomeAmount : expenseAmount;

  return {
    id: index,
    date: parseDate(getField(row, ['日期'])),
    type,
    category: type === '收入' ? incomeCategory : expenseCategory,
    incomeCategory,
    incomeDetail: getField(row, ['收入明細']),
    incomeAccount: getField(row, ['存入帳戶']),
    expenseCategory,
    expenseDetail: getField(row, ['支出明細']),
    expenseAccount: getField(row, ['支出帳戶']),
    payment: getField(row, ['經手支付']),
    note: getField(row, ['備註']),
    amount,
    incomeAmount,
    expenseAmount
  };
}

async function getRecords() {
  const auth = getAuth();
  const sheets = google.sheets({
    version: 'v4',
    auth
  });

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || '收支紀錄';

  if (!spreadsheetId) {
    throw new Error('尚未設定 GOOGLE_SHEET_ID');
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:Z`,
    valueRenderOption: 'UNFORMATTED_VALUE'
  });

  const values = response.data.values || [];

  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);

  return values
    .slice(1)
    .filter(row => row.some(value => String(value || '').trim() !== ''))
    .map((row, index) => {
      const object = {};

      headers.forEach((header, columnIndex) => {
        object[header] = row[columnIndex] ?? '';
      });

      return normalizeRecord(object, index + 2);
    })
    .filter(record => record.date && record.amount !== 0);
}

module.exports = {
  getRecords
};
