const tokenInput = document.getElementById("token");
const startButton = document.getElementById("start");
const clearButton = document.getElementById("clear");
const status = document.getElementById("status");

function setStatus(message, state = "working") {
  status.textContent = message;
  status.className = state === "success" ? "success" : state === "error" ? "error" : "";
}

window.qqLoginHelper.onProgress(({ message, state }) => setStatus(message, state));

startButton.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("请先粘贴博客后台生成的一次性配对码。", "error");
    tokenInput.focus();
    return;
  }
  startButton.disabled = true;
  setStatus("正在打开 QQ 音乐官方登录页面…");
  try {
    const result = await window.qqLoginHelper.start(token);
    if (result && result.ok) {
      setStatus("登录和同步均已完成，可以关闭助手并返回博客后台。", "success");
      tokenInput.value = "";
    }
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error), "error");
  } finally {
    startButton.disabled = false;
  }
});

clearButton.addEventListener("click", async () => {
  clearButton.disabled = true;
  try {
    await window.qqLoginHelper.clear();
    setStatus("本机 QQ 音乐登录记录已清除。", "success");
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error), "error");
  } finally {
    clearButton.disabled = false;
  }
});
