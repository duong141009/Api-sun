import websocket
import sqlite3
import json
import time
import threading
from datetime import datetime
from flask import Flask, jsonify

# === Flask API ===
app = Flask(__name__)
db_lock = threading.Lock()

# === SQLite ===
conn = sqlite3.connect("sun.db", check_same_thread=False)
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS sessions (
    sid INTEGER PRIMARY KEY,
    d1 INTEGER,
    d2 INTEGER,
    d3 INTEGER,
    total INTEGER,
    result TEXT,
    timestamp INTEGER
)
""")
conn.commit()

# === WebSocket token ===
TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.p56b5g73I9wyoVu4db679bOvVeFJWVjGDg_ulBXyav8"

# === Gửi cmd 1005 để nhận phiên mới ===
def send_cmd(ws):
    cmd = [6, "MiniGame", "taixiuPlugin", {"cmd": 1005}]
    ws.send(json.dumps(cmd))

# === Xử lý tin nhắn Sunwin gửi về ===
def on_message(ws, message):
    try:
        data = json.loads(message)
        if isinstance(data, list) and 'htr' in data[1]:
            history = sorted(data[1]['htr'], key=lambda x: x['sid'])
            for item in history:
                sid = item['sid']
                d1, d2, d3 = item['d1'], item['d2'], item['d3']
                total = d1 + d2 + d3
                result = "Tài" if total > 10 else "Xỉu"
                timestamp = int(time.time() * 1000)

                with db_lock:
                    cursor.execute("SELECT sid FROM sessions WHERE sid = ?", (sid,))
                    if cursor.fetchone():
                        continue
                    cursor.execute("INSERT INTO sessions (sid, d1, d2, d3, total, result, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                   (sid, d1, d2, d3, total, result, timestamp))
                    conn.commit()
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Phiên {sid}: 🎲 {d1}-{d2}-{d3} = {total} ⇒ {result}")
    except Exception as e:
        print("Lỗi xử lý:", e)

# === Khi WebSocket kết nối ===
def on_open(ws):
    print("✅ Đã kết nối WS")
    auth = [
        1, "MiniGame", "SC_xigtupou", "conga999",
        {
            "info": "{\"ipAddress\":\"171.246.10.199\",\"userId\":\"7c54ec3f-ee1a-428c-a56e-1bc14fd27e57\",\"username\":\"SC_xigtupou\",\"timestamp\":1748266471861,\"refreshToken\":\"...\"}",
            "signature": "0EC9E9B2..."
        }
    ]
    ws.send(json.dumps(auth))
    threading.Thread(target=lambda: loop_send(ws), daemon=True).start()

def loop_send(ws):
    while True:
        send_cmd(ws)
        time.sleep(5)

# === Tự động reconnect ===
def on_close(ws, code, msg):
    print("🔁 WS đóng, reconnect sau 5s...")
    time.sleep(5)
    start_ws()

def on_error(ws, err):
    print("❌ Lỗi:", err)

def start_ws():
    url = f"wss://websocket.azhkthg1.net/websocket?token={TOKEN}"
    ws = websocket.WebSocketApp(url,
                                 on_open=on_open,
                                 on_message=on_message,
                                 on_close=on_close,
                                 on_error=on_error)
    ws.run_forever()

# === API Flask ===
@app.route("/")
def home():
    return "✅ Bot đang chạy!"

@app.route("/api/sunwin")
def get_data():
    with db_lock:
        cursor.execute("SELECT * FROM sessions ORDER BY sid DESC LIMIT 100")
        rows = cursor.fetchall()
    result = [{
        "sid": row[0],
        "d1": row[1],
        "d2": row[2],
        "d3": row[3],
        "total": row[4],
        "result": row[5],
        "timestamp": row[6]
    } for row in rows]
    return jsonify(result[::-1])  # Trả ngược để phiên cũ lên đầu

# === Chạy Flask và WS song song ===
if __name__ == "__main__":
    threading.Thread(target=start_ws, daemon=True).start()
    app.run(host="0.0.0.0", port=10000)