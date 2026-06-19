const fs = require('fs');
let src = fs.readFileSync('server.js', 'utf8');
const lines = src.split('\n');

// 1. Fix sendTelegramMessage to accept reply_markup
const fnStart = lines.findIndex(l => l.includes('async function sendTelegramMessage(chatId, text)'));
const fnEnd = lines.findIndex((l, i) => i > fnStart && l.trim() === '}');
lines.splice(fnStart, fnEnd - fnStart + 1,
  'async function sendTelegramMessage(chatId, text, reply_markup) {',
  '  try {',
  '    const payload = { chat_id: chatId, text, parse_mode: \'HTML\' };',
  '    if (reply_markup) payload.reply_markup = reply_markup;',
  '    await fetch(`${TELEGRAM_API}/sendMessage`, {',
  '      method: \'POST\',',
  '      headers: { \'Content-Type\': \'application/json\' },',
  '      body: JSON.stringify(payload)',
  '    });',
  '  } catch (err) {',
  '    console.error(\'Telegram send error:\', err);',
  '  }',
  '}',
  '',
  'const CONTACT_KEYBOARD = {',
  '  keyboard: [[{ text: \'\u{1F4F1} Telefon raqamni ulash\', request_contact: true }]],',
  '  resize_keyboard: true,',
  '  one_time_keyboard: true,',
  '};',
  'const REMOVE_KEYBOARD = { remove_keyboard: true };',
);

// Re-read line indices after splice
const ifStart = lines.findIndex(l => l.trim() === "if (text === '/start') {");
// Find closing } of the else block (3 branches)
let depth = 0, ifEnd = -1;
for (let i = ifStart; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth === 0 && i > ifStart) { ifEnd = i; break; }
}

const SUCCESS_MSG = "✅ Telefon raqamingiz <b>${phone}</b> muvaffaqiyatli bog’landi!\n\n🔐 Endi <b>Help Mee</b> ilovasiga kirganingizda tasdiqlash kodi shu yerga yuboriladi.";

lines.splice(ifStart, ifEnd - ifStart + 1,
  '    if (contact) {',
  '      const raw = contact.phone_number.replace(/^\\+/, \'\');',
  '      const phone = \'+\' + (raw.startsWith(\'998\') ? raw : \'998\' + raw);',
  '      await pool.query(',
  '        \'INSERT INTO telegram_users (phone, chat_id) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET chat_id = $2\',',
  '        [phone, chatId.toString()]',
  '      );',
  '      await sendTelegramMessage(chatId,',
  '        `' + SUCCESS_MSG + '`,',
  '        REMOVE_KEYBOARD',
  '      );',
  '    } else if (text === \'/start\') {',
  '      await sendTelegramMessage(chatId,',
  '        \'👋 Salom! <b>Help Mee</b> ilovasiga xush kelibsiz!\\n\\nIlovaga kirishda tasdiqlash kodini Telegram orqali olish uchun telefon raqamingizni ulang 👇\',',
  '        CONTACT_KEYBOARD',
  '      );',
  '    } else if (text.match(/^\\+?998[0-9]{9}$/)) {',
  '      const phone = text.startsWith(\'+\') ? text : \'+\' + text;',
  '      await pool.query(',
  '        \'INSERT INTO telegram_users (phone, chat_id) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET chat_id = $2\',',
  '        [phone, chatId.toString()]',
  '      );',
  '      await sendTelegramMessage(chatId,',
  '        `' + SUCCESS_MSG + '`,',
  '        REMOVE_KEYBOARD',
  '      );',
  '    } else {',
  '      await sendTelegramMessage(chatId,',
  '        \'👇 Telefon raqamingizni ulash uchun pastdagi tugmani bosing.\',',
  '        CONTACT_KEYBOARD',
  '      );',
  '    }',
);

// Also fix the OTP message (search for the old broken tag)
const otpLine = lines.findIndex(l => l.includes('Help Me<\\b>') || l.includes('Help Me</b>') && l.includes('Tasdiqlash kodi'));
if (otpLine !== -1) {
  lines[otpLine] = "          `🔐 <b>Help Mee</b> — Tasdiqlash kodi:\\n\\n<code>${code}</code>\\n\\n⏱ Kod 10 daqiqa davomida amal qiladi.`";
}

fs.writeFileSync('server.js', lines.join('\n'), 'utf8');
console.log('Done. OTP line:', otpLine);
