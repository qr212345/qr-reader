// --- 追加グローバル変数 ---
let lastScanTime = 0;
let lastScannedCode = "";
const SCAN_COOLDOWN_MS = 2000;

let actionHistory = []; // 操作履歴 [{type: "addPlayer", seatId, playerId}, ...]

// プレイヤーデータ（名前・レート・前回順位・変動など）
let playerMap = {}; // { playerId: { name, rating, prevRank, rankChange } }

// ----- QRコード読み取り成功時の拡張 -----
function onScanSuccess(decodedText, decodedResult) {
  const now = Date.now();

  // 連続スキャン防止
  if (decodedText === lastScannedCode && now - lastScanTime < SCAN_COOLDOWN_MS) {
    // 無視
    return;
  }
  lastScannedCode = decodedText;
  lastScanTime = now;

  if (!decodedText) return;

  if (decodedText.startsWith("table")) {
    currentSeat = decodedText;
    currentSeatText.textContent = currentSeat;
    if (!seatMap[currentSeat]) seatMap[currentSeat] = { players: [], ranking: null };
    displayMessage(`座席 ${currentSeat} が選択されました。`);
  } else if (decodedText.startsWith("player")) {
    if (!currentSeat) {
      displayMessage("先に座席を読み取ってください。");
      return;
    }
    const players = seatMap[currentSeat].players;
    if (players.length >= MAX_PLAYERS_PER_SEAT) {
      displayMessage("この座席にはすでに6人登録されています。");
      return;
    }
    if (players.includes(decodedText)) {
      displayMessage("この生徒はすでに登録されています。");
      return;
    }
    players.push(decodedText);
    actionHistory.push({ type: "addPlayer", seatId: currentSeat, playerId: decodedText }); // 履歴記録
    displayMessage(`座席${currentSeat}に${decodedText}を登録しました。`);
    updateSeatTable();
  } else {
    displayMessage("QRコードの形式が不正です。");
  }

  saveToLocal(); // 読み込み後に自動保存
}

// --- 操作履歴のundo ---
function undoLast() {
  if (actionHistory.length === 0) {
    displayMessage("取り消せる操作がありません。");
    return;
  }
  const lastAction = actionHistory.pop();
  if (lastAction.type === "addPlayer") {
    const { seatId, playerId } = lastAction;
    if (seatMap[seatId]) {
      const idx = seatMap[seatId].players.indexOf(playerId);
      if (idx !== -1) {
        seatMap[seatId].players.splice(idx, 1);
        displayMessage(`座席${seatId}から${playerId}の登録を取り消しました。`);
        updateSeatTable();
        saveToLocal();
        return;
      }
    }
  }
  displayMessage("最後の操作を取り消せませんでした。");
}

// --- 座席一覧表示の拡張（取消・削除ボタン追加） ---
function updateSeatTable() {
  seatTableBody.innerHTML = "";
  const seatEntries = Object.entries(seatMap);
  seatEntries.sort((a, b) => {
    const rankA = a[1].ranking || 9999;
    const rankB = b[1].ranking || 9999;
    if (rankA !== rankB) return rankA - rankB;
    return a[0].localeCompare(b[0]);
  });

  for (const [seatId, data] of seatEntries) {
    const tr = document.createElement("tr");
    const playersStr = data.players.join(", ");
    const ranking = data.ranking || "";

    const tdDelete = document.createElement("td");
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "座席削除";
    btnDelete.addEventListener("click", () => {
      if (confirm(`座席${seatId}を削除してよいですか？`)) {
        delete seatMap[seatId];
        updateSeatTable();
        updateRankingList();
        updateRateTable();
        saveToLocal();
      }
    });
    tdDelete.appendChild(btnDelete);

    tr.innerHTML = `<td>${seatId}</td><td>${playersStr}</td><td>${ranking}</td>`;
    tr.appendChild(tdDelete);
    seatTableBody.appendChild(tr);
  }
}

// --- 順位確定とレート計算の統合例 ---
function confirmRanking() {
  if (!isRankingMode) {
    alert("順位登録モードがオンになっていません。");
    return;
  }

  // 順位割り当て
  const lis = rankingListEdit.querySelectorAll("li");
  lis.forEach((li, index) => {
    const seatId = li.dataset.seatId;
    if (seatMap[seatId]) seatMap[seatId].ranking = index + 1;
  });

  // 簡易レート計算例（30〜99の範囲でクリップ）
  // 1位 +5、2位 +2、3位 0、それ以降 −3
  for (const seatId in seatMap) {
    seatMap[seatId].players.forEach(playerId => {
      if (!playerMap[playerId]) {
        playerMap[playerId] = { name: playerId, rating: 50, prevRank: null, rankChange: 0 };
      }
      const rank = seatMap[seatId].ranking;
      playerMap[playerId].prevRank = playerMap[playerId].prevRank || rank;
      playerMap[playerId].rankChange = playerMap[playerId].prevRank - rank;

      let delta = 0;
      if (rank === 1) delta = +5;
      else if (rank === 2) delta = +2;
      else if (rank === 3) delta = 0;
      else delta = -3;

      playerMap[playerId].rating = Math.min(99, Math.max(30, playerMap[playerId].rating + delta));
      playerMap[playerId].prevRank = rank;
    });
  }

  isRankingMode = false;
  rankingSelectUI.style.display = "none";
  document.getElementById("toggleRankingBtn").textContent = "📋 順位登録モード切替";

  updateSeatTable();
  updateRankingList();
  updateRateTableWithDiff();

  saveToLocal();

  alert("順位とレートを更新しました。");
}

// --- レート表更新（詳細版） ---
function updateRateTableWithDiff() {
  rateTable.innerHTML = `
    <tr>
      <th>プレイヤーID</th>
      <th>レート</th>
      <th>前回順位</th>
      <th>順位変動</th>
      <th>称号</th>
    </tr>
  `;

  const players = Object.entries(playerMap).sort((a, b) => b[1].rating - a[1].rating);

  players.forEach(([playerId, pdata]) => {
    const title = getTitle(pdata.rating);
    const diff = pdata.rankChange;
    const diffSymbol = diff > 0 ? `↑${diff}` : (diff < 0 ? `↓${-diff}` : "-");

    const tr = document.createElement("tr");
    if (diff > 0) tr.classList.add("rank-up");
    else if (diff < 0) tr.classList.add("rank-down");

    tr.innerHTML = `
      <td>${playerId}</td>
      <td>${pdata.rating}</td>
      <td>${pdata.prevRank || ""}</td>
      <td>${diffSymbol}</td>
      <td>${title}</td>
    `;
    rateTable.appendChild(tr);
  });
}



// --- 称号判定例 ---
function getTitle(rating) {
  if (rating >= 90) return "伝説";
  if (rating >= 80) return "神";
  if (rating >= 70) return "覇者";
  if (rating >= 60) return "猛者";
  if (rating >= 50) return "常連";
  if (rating >= 40) return "一般";
  if (rating >= 30) return "初心者";
  return "修行中";
}

// --- ポップアップ演出 ---
function showPopup(message, color = "lightblue") {
  const popup = document.createElement("div");
  popup.textContent = message;
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.backgroundColor = color;
  popup.style.padding = "20px";
  popup.style.borderRadius = "10px";
  popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
  popup.style.zIndex = 1000;
  document.body.appendChild(popup);

  setTimeout(() => {
    popup.style.transition = "opacity 0.5s";
    popup.style.opacity = 0;
    setTimeout(() => document.body.removeChild(popup), 500);
  }, 1500);
}

// --- localStorage保存拡張 ---
function saveToLocal() {
  const saveData = { seatMap, playerMap };
  localStorage.setItem("babanukiAppData", JSON.stringify(saveData));
}

function loadFromLocal() {
  const data = localStorage.getItem("babanukiAppData");
  if (!data) return;
  try {
    const parsed = JSON.parse(data);
    seatMap = parsed.seatMap || {};
    playerMap = parsed.playerMap || {};
    updateSeatTable();
    updateRankingList();
    updateRateTableWithDiff();
  } catch(e) {
    console.error("ローカルデータ読み込み失敗", e);
  }
}

// --- Google Drive保存／読み込みの土台例（API連携やOAuth認証等は別途） ---
async function saveSeatMapToDrive() {
  alert("Google Drive保存機能は未実装です。");
  // 実装例：fetchやGoogle Drive APIで保存処理を非同期に行う
}
async function loadSeatMapFromDrive() {
  alert("Google Drive復元機能は未実装です。");
  // 同様に非同期で復元する
}

// --- ページロード時初期化 ---
window.addEventListener("load", () => {
  initQrReader();
  loadFromLocal();
});
