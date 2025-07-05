const API_URL = "https://script.google.com/macros/s/AKfycbw7PdY5xl1DkwdQwavkeX-2Vnj_isw-2Qzwvv73fat1dc0QNUNEN_Cqd59_VLyfnAvi/exec";

let currentSeat = null;
let seatMap = {};
let lastAction = null;
let lastScanTime = 0;

async function loadSeatMapFromDrive() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("読み込み失敗");
    seatMap = await res.json();
    displayMessage("☁ Google Driveからデータを復元しました");
    updateTable();
  } catch (err) {
    console.error(err);
    displayMessage("❌ Driveからの復元に失敗しました");
  }
}

async function saveSeatMapToDrive() {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seatMap)
    });
    if (!res.ok) throw new Error("保存失敗");
    displayMessage("✅ Google Driveに保存しました");
  } catch (err) {
    console.error(err);
    displayMessage("❌ Google Driveへの保存に失敗しました");
  }
}

async function clearSavedData() {
  if (confirm("保存データをすべて削除しますか？")) {
    localStorage.removeItem("seatMap");
    seatMap = {};
    await saveSeatMapToDrive();
    displayMessage("保存されたデータを削除しました。");
    updateTable();
  }
}

function completeCurrentSeat() {
  if (currentSeat) {
    displayMessage(`座席「${currentSeat}」の登録を完了しました。`);
    currentSeat = null;
    const btn = document.getElementById("completeSeatBtn");
    if (btn) btn.style.display = "none";
  }
}

function undoLast() {
  if (lastAction) {
    const { seat, person } = lastAction;
    const people = seatMap[seat] || [];
    const idx = people.indexOf(person);
    if (idx !== -1) {
      people.splice(idx, 1);
      displayMessage(`「${person}」の登録を取り消しました。`);
      lastAction = null;
      updateTable();
    }
  }
}

function downloadCSV() {
  let csv = "座席ID,生徒ID\n";
  for (const [seat, people] of Object.entries(seatMap)) {
    (people || []).forEach(person => {
      csv += `${seat},${person}\n`;
    });
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seat_assignment.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function updateTable() {
  const tbody = document.querySelector('#seatTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const [seat, people] of Object.entries(seatMap)) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><span class="seat" onclick="removeSeat('${seat}')">${seat} ❌</span></td>
      <td>${(people || []).map(p =>
        <span class="student" onclick="removeStudent('${seat}', '${p}')">${p} ❌</span>
      ).join(' ')}</td>
    `;
    tbody.appendChild(row);
  }
  localStorage.setItem("seatMap", JSON.stringify(seatMap));
}

function removeStudent(seat, person) {
  const people = seatMap[seat] || [];
  const index = people.indexOf(person);
  if (index !== -1) {
    people.splice(index, 1);
    displayMessage(`座席「${seat}」から「${person}」を削除しました。`);
    updateTable();
  }
}

function removeSeat(seat) {
  if (confirm(`座席「${seat}」を削除しますか？（生徒もすべて削除されます）`)) {
    delete seatMap[seat];
    displayMessage(`座席「${seat}」を削除しました。`);
    updateTable();
  }
}

function onScanSuccess(decodedText) {
  const now = Date.now();

  if (decodedText.startsWith("player") && now - lastScanTime < 3000) return;
  lastScanTime = now;

  if (!/^table/.test(decodedText) && !/^player/.test(decodedText)) {
    displayMessage("QRコードは 'table〜' または 'player〜' で始めてください。");
    return;
  }

  if (decodedText.startsWith("table")) {
    currentSeat = decodedText;
    if (!seatMap[currentSeat]) seatMap[currentSeat] = [];
    displayMessage(`座席「${currentSeat}」を読み取りました。最大6人まで登録可能。`);
    const btn = document.getElementById("completeSeatBtn");
    if (btn) btn.style.display = "block";
  } else if (decodedText.startsWith("player")) {
    if (!currentSeat) {
      displayMessage("最初に座席QR（table〜）を読み取ってください。");
      return;
    }

    const people = seatMap[currentSeat] || [];
    seatMap[currentSeat] = people;

    if (people.length >= 6) {
      displayMessage(`座席「${currentSeat}」は6人までです。`);
      completeCurrentSeat();
    } else if (people.includes(decodedText)) {
      displayMessage(`「${decodedText}」は既に座席「${currentSeat}」に登録されています。`);
    } else {
      people.push(decodedText);
      lastAction = { seat: currentSeat, person: decodedText };
      let msg = `「${decodedText}」を座席「${currentSeat}」に登録（${people.length}/6）`;
      if (people.length >= 6) {
        msg += " 上限に達しました。";
        completeCurrentSeat();
      }
      displayMessage(msg);
      localStorage.setItem("seatMap", JSON.stringify(seatMap));
      updateTable();
    }
  }
}

function displayMessage(msg) {
  const el = document.getElementById("result");
  if (el) el.innerText = msg;
}

document.addEventListener("DOMContentLoaded", () => {
  const savedMap = localStorage.getItem("seatMap");
  if (savedMap) {
    seatMap = JSON.parse(savedMap);
    displayMessage("📦 ローカル保存データを復元しました");
    updateTable();
  } else {
    loadSeatMapFromDrive();
  }

  const html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    {
      fps: 15,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.33
    },
    onScanSuccess
  ).catch(err => {
    console.error("カメラ起動エラー:", err);
    displayMessage("📷 カメラ起動に失敗しました。設定でカメラ許可を確認してください。");
  });
});
