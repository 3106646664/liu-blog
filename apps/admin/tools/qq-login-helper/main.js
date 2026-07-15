const { app, BrowserWindow, ipcMain, net, session, shell } = require("electron");
const path = require("path");

const LOGIN_PARTITION = "persist:xinghui-blog-qqmusic-login";
const LOGIN_URL = "https://y.qq.com/n/ryqq/profile";
const PLAYER_URL = "https://y.qq.com/n/ryqq/player";
const PAIR_ENDPOINT = process.env.XINGHUI_BLOG_MUSIC_PAIR_ENDPOINT
  || "https://admin.example.com/music-pair/complete";
const COOKIE_PRIORITY = [
  "uin", "qqmusic_uin", "wxuin", "login_type", "qm_keyst", "qqmusic_key", "music_key",
  "p_skey", "skey", "psrf_qqopenid", "psrf_qqunionid", "psrf_qqaccess_token",
  "psrf_qqrefresh_token", "wxopenid", "wxunionid", "wxrefresh_token", "wxskey",
  "p_uin", "ptcz", "RK",
];

let mainWindow;
let loginWindow;

function parseCookieHeader(cookieText) {
  const output = {};
  String(cookieText || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return;
    output[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  });
  return output;
}

function hasAccount(cookieText) {
  const cookies = parseCookieHeader(cookieText);
  const rawUin = Number(cookies.login_type) === 2
    ? (cookies.wxuin || cookies.uin || cookies.p_uin || "")
    : (cookies.uin || cookies.qqmusic_uin || cookies.wxuin || cookies.p_uin || "");
  const uin = String(rawUin).replace(/\D/g, "");
  const key = cookies.qm_keyst || cookies.qqmusic_key || cookies.music_key || cookies.p_skey
    || cookies.skey || cookies.psrf_qqaccess_token || cookies.wxskey || "";
  return Boolean(uin && key);
}

function hasPlaybackTicket(cookieText) {
  const cookies = parseCookieHeader(cookieText);
  const rawUin = Number(cookies.login_type) === 2
    ? (cookies.wxuin || cookies.uin || cookies.p_uin || "")
    : (cookies.uin || cookies.qqmusic_uin || cookies.wxuin || cookies.p_uin || "");
  const uin = String(rawUin).replace(/\D/g, "");
  const key = cookies.qm_keyst || cookies.qqmusic_key || cookies.music_key || cookies.wxskey || "";
  return Boolean(uin && key);
}

function isQQDomain(domain) {
  const normalized = String(domain || "").replace(/^\./, "").toLowerCase();
  return normalized === "qq.com" || normalized.endsWith(".qq.com") || normalized.endsWith("qqmusic.qq.com");
}

async function readQQCookieHeader(cookieSession) {
  const all = await cookieSession.cookies.get({});
  const values = new Map();
  all.forEach((cookie) => {
    if (cookie && cookie.name && isQQDomain(cookie.domain) && cookie.value) {
      values.set(cookie.name, cookie.value);
    }
  });
  const ordered = [];
  COOKIE_PRIORITY.forEach((name) => {
    if (values.has(name)) {
      ordered.push([name, values.get(name)]);
      values.delete(name);
    }
  });
  values.forEach((value, name) => ordered.push([name, value]));
  return ordered.map(([name, value]) => `${name}=${value}`).join("; ");
}

function sendProgress(message, state = "working") {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("login-progress", { message, state });
  }
}

async function uploadCookie(token, cookie) {
  sendProgress("播放票据已就绪，正在安全同步到服务器…");
  const response = await net.fetch(PAIR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ token, cookie }),
  });
  let payload = {};
  try { payload = await response.json(); } catch (_) {}
  if (!response.ok || !payload.success) {
    throw new Error(payload.detail || payload.message || `服务器返回 ${response.status}`);
  }
  return payload;
}

async function openOfficialLogin(token) {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    throw new Error("配对码格式不正确，请从博客后台重新复制");
  }
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return { ok: false, pending: true };
  }

  const cookieSession = session.fromPartition(LOGIN_PARTITION);
  const initialCookie = await readQQCookieHeader(cookieSession);
  if (hasPlaybackTicket(initialCookie)) {
    const result = await uploadCookie(token, initialCookie);
    sendProgress("QQ 音乐会话同步完成，可以返回后台。", "success");
    return { ok: true, reused: true, account: result.account };
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer;
    let timeoutTimer;
    let warmupStarted = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      loginWindow = null;
      if (error) reject(error);
      else resolve(result);
    };

    loginWindow = new BrowserWindow({
      width: 920,
      height: 760,
      minWidth: 760,
      minHeight: 600,
      parent: mainWindow,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: "QQ 音乐官方登录",
      backgroundColor: "#111827",
      webPreferences: {
        partition: LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const checkCookies = async () => {
      try {
        const cookie = await readQQCookieHeader(cookieSession);
        if (hasPlaybackTicket(cookie)) {
          const result = await uploadCookie(token, cookie);
          sendProgress("QQ 音乐会话同步完成，可以返回后台。", "success");
          finish(null, { ok: true, account: result.account });
        } else if (hasAccount(cookie) && !warmupStarted) {
          warmupStarted = true;
          sendProgress("账号已识别，正在打开官方播放器生成会员播放票据…");
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.loadURL(PLAYER_URL).catch((error) => finish(error));
            }
          }, 900);
        }
      } catch (error) {
        sendProgress(`正在等待 QQ 音乐完成授权：${error.message}`);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch((error) => finish(error));
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: "deny" };
    });
    loginWindow.webContents.on("did-finish-load", () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `, true).catch(() => {});
    });
    loginWindow.once("ready-to-show", () => loginWindow.show());
    loginWindow.on("closed", () => {
      loginWindow = null;
      if (!settled) finish(new Error("QQ 音乐登录窗口已关闭，配对尚未完成"));
    });

    sendProgress("已打开 QQ 音乐官方页面，请使用手机 QQ 扫码并确认登录。");
    pollTimer = setInterval(checkCookies, 1200);
    timeoutTimer = setTimeout(() => finish(new Error("登录等待超时，请在后台重新生成配对码")), 9 * 60 * 1000);
    loginWindow.loadURL(LOGIN_URL).catch((error) => finish(error));
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 620,
    height: 520,
    minWidth: 560,
    minHeight: 480,
    autoHideMenuBar: true,
    title: "Xinghui Blog QQ 音乐登录助手",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("qq-login-start", async (_event, token) => openOfficialLogin(String(token || "").trim()));
ipcMain.handle("qq-login-clear", async () => {
  await session.fromPartition(LOGIN_PARTITION).clearStorageData();
  sendProgress("本机 QQ 音乐登录记录已清除。", "idle");
  return { ok: true };
});

app.whenReady().then(createMainWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
