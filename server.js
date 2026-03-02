const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

// === Biến lưu trạng thái ===
let currentData = {
  "Phiên": null,
  "xúc xắc 1": null,
  "xúc xắc 2": null,
  "xúc xắc 3": null,
  "kết quả": "",
  "pattren": "",
  "số tài số xỉu trong 100 phiên": "",
  "phiên tiếp theo": null,
  "id": "Dwong1410"
};
let id_phien_chua_co_kq = null;
let patternHistory = []; // Lưu dãy T/X gần nhất
let fullHistory = []; // Lưu danh sách toàn bộ phiên tối đa 300

let messagesToSend = [];

async function fetchNewToken() {
  try {
    console.log('[🔄] Đang lấy Token mới từ Sunwin...');
    const response = await axios.post(
      'https://api1.azhkthg1.net/id',
      {
        "command": "loginToken",
        "deviceId": "rtl0ymhCq6WorRYMHWsi",
        "hash": "b975787e5b4131d480b915ac813b6561",
        "platformId": 4,
        "refreshToken": "2740c85aa5fb4ba8b918e2d28e175416.66d6095b24ee41f08006eab3a276e689",
        "timestamp": "1772377233050"
      },
      {
        headers: {
          'authorization': 'dacd5a5a6a694f0bb0056c373faddf22',
          'content-type': 'application/json; charset=UTF-8',
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          'origin': 'https://web.sunwin.lt',
          'referer': 'https://web.sunwin.lt/'
        }
      }
    );

    if (response.data && response.data.data && response.data.data.wsToken) {
      const authData = response.data.data;
      const wsToken = authData.wsToken;
      const signature = authData.signature;
      const username = authData.username || "SC_tool1m";
      const userId = authData.userId;
      const ipAddress = authData.ipAddress || (authData.info && authData.info.ipAddress);

      const infoObj = JSON.parse(Buffer.from(wsToken.split('.')[1], 'base64').toString('utf8'));
      const timestamp = infoObj.timestamp || Date.now();

      // Cập nhật lại mảng messagesToSend với ID mới
      messagesToSend = [
        [1, "MiniGame", username, "Dwong1410", {
          "info": JSON.stringify({
            "ipAddress": ipAddress,
            "wsToken": wsToken,
            "userId": userId,
            "username": username,
            "timestamp": timestamp
          }),
          "signature": signature
        }],
        [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
        [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
      ];

      console.log('[✅] Đã lấy token mới thành công!');
      return wsToken;
    } else {
      console.error('[❌] Đăng nhập thất bại, không lấy được Token:', response.data);
      return null;
    }
  } catch (error) {
    console.error('[❌] Lỗi khi gọi API báo danh:', error.message);
    return null;
  }
}

// === WebSocket ===
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;
let isManuallyClosed = false;

function duDoanTiepTheo(pattern) {
  if (pattern.length < 6) return "?";

  const last3 = pattern.slice(-3).join('');
  const last4 = pattern.slice(-4).join('');

  const count = pattern.join('').split(last3).length - 1;
  if (count >= 2) return last3[0];

  const count4 = pattern.join('').split(last4).length - 1;
  if (count4 >= 2) return last4[0];

  return "?";
}

async function connectWebSocket() {
  const currentToken = await fetchNewToken();
  if (!currentToken) {
    console.log('[⏳] Chờ 5 giây rồi thử lấy Token lại...');
    setTimeout(connectWebSocket, 5000);
    return;
  }

  ws = new WebSocket(
    `wss://websocket.azhkthg1.net/websocket?token=${currentToken}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "Origin": "https://web.sunwin.lt/"
      }
    }
  );

  ws.on('open', () => {
    console.log('[✅] Đã kết nối WebSocket');
    messagesToSend.forEach((msg, i) => {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      }, i * 600);
    });

    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 15000);
  });

  ws.on('pong', () => {
    console.log('[📶] Ping OK');
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (Array.isArray(data) && typeof data[1] === 'object') {
        const cmd = data[1].cmd;

        if (cmd === 1008 && data[1].sid) {
          id_phien_chua_co_kq = data[1].sid;
        }

        if (cmd === 1003 && data[1].gBB) {
          const { d1, d2, d3 } = data[1];
          const total = d1 + d2 + d3;
          const result = total > 10 ? "T" : "X";

          patternHistory.push(result);
          if (patternHistory.length > 300) patternHistory.shift();

          const last100 = patternHistory.slice(-100);
          const soTai = last100.filter(x => x === 'T').length;
          const soXiu = last100.filter(x => x === 'X').length;

          currentData = {
            "Phiên trước": id_phien_chua_co_kq,
            "xúc xắc 1": d1,
            "xúc xắc 2": d2,
            "xúc xắc 3": d3,
            "kết quả": result === 'T' ? "Tài" : "Xỉu",
            "pattren": patternHistory.join(''),
            "số tài số xỉu trong 100 phiên": `Tài: ${soTai}, Xỉu: ${soXiu}`,
            "phiên hiện tại": Number(id_phien_chua_co_kq) + 1,
            "id": "Dwong1410"
          };

          fullHistory.unshift(currentData);
          if (fullHistory.length > 300) fullHistory.pop();

          console.log(`\n==============================================`);
          console.log(`🎲 TÀI XỈU - PHIÊN: ${id_phien_chua_co_kq}`);
          console.log(`🎲 KẾT QUẢ: ${d1} - ${d2} - ${d3}  =>  Tổng: ${total} (${result === 'T' ? 'TÀI' : 'XỈU'})`);
          console.log(`📊 THỐNG KÊ 100 PHIÊN GẦN NHẤT: Tài: ${soTai} | Xỉu: ${soXiu}`);
          console.log(`==============================================\n`);
          id_phien_chua_co_kq = null;
        }
      }
    } catch (e) {
      console.error('[❌] Lỗi xử lý:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[🔌] Mất kết nối WebSocket. Đang bắt đầu lấy Token khởi động lại...');
    clearInterval(pingInterval);
    if (!isManuallyClosed) {
      // Thay vì reconnect chay, nó sẽ gọi lại hàm connectWebSocket (bên trong sẽ sinh token mới)
      reconnectTimeout = setTimeout(connectWebSocket, 3000);
    }
  });

  ws.on('error', (err) => {
    console.error('[⚠️] WebSocket lỗi:', err.message);
    // Có thể mất kết nối ngay sau lỗi này, close() event sẽ được kích hoạt để reconnect
  });
}

// === API ===
app.get('/taixiu', (req, res) => {
  res.json(currentData);
});

app.get('/history', (req, res) => {
  let limit = parseInt(req.query.limit) || fullHistory.length;
  if (limit > 300) limit = 300;
  if (limit < 1) limit = 1;
  res.json(fullHistory.slice(0, limit));
});

app.get('/', (req, res) => {
  res.send(`<h2>🎯 SunWin Tài Xỉu</h2><p><a href="/taixiu">Xem JSON kết quả</a></p>`);
});

// === Khởi động server ===
app.listen(PORT, () => {
  console.log(`[🌐] Server đang chạy tại http://localhost:${PORT}`);
  connectWebSocket();

  // Tự ping để chống ngủ (Render)
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_EXTERNAL_URL) {
    setInterval(() => {
      axios.get(RENDER_EXTERNAL_URL)
        .then(() => console.log('[📡] Tự ping duy trì server thành công'))
        .catch(err => console.error('[⚠️] Lỗi tự ping:', err.message));
    }, 5 * 60 * 1000); // 5 phút/lần
  } else {
    console.log('[ℹ️] Lưu ý: Hãy cấu hình RENDER_EXTERNAL_URL trong Dashboard Render để server không bị ngủ.');
  }
});
