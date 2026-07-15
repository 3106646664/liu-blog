import { siteConfig } from '../../../siteConfig';
import { readFile } from 'node:fs/promises';

export const runtime = 'nodejs';

const DEEPSEEK_KEY_FILE = process.env.DEEPSEEK_KEY_FILE || '/srv/xinghui-blog-admin/secrets/deepseek-api-key';

async function getDeepSeekApiKey() {
  const environmentKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (environmentKey) return environmentKey;

  try {
    return (await readFile(/* turbopackIgnore: true */ DEEPSEEK_KEY_FILE, 'utf8')).trim();
  } catch {
    return '';
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return jsonResponse({ error: '请输入要发送的内容' }, 400);
    }

    if (message.length > 2000) {
      return jsonResponse({ error: '消息过长，请控制在 2000 字以内' }, 400);
    }

    const apiKey = await getDeepSeekApiKey();
    if (!apiKey) {
      return jsonResponse({
        error: 'DeepSeek API Key 未配置',
        details: '请在管理后台的 AI 小晴助手设置中填写并保存 API Key',
      }, 503);
    }

    const config = siteConfig.geminiConfig;
    const apiBaseUrl = (config.apiBaseUrl || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelId || 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: config.systemPrompt },
            { role: 'user', content: message },
          ],
          thinking: { type: 'disabled' },
          max_tokens: config.maxOutputTokens,
          temperature: config.temperature,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('DeepSeek chat request failed:', response.status, data?.error?.message || data);
      return jsonResponse({
        error: `DeepSeek 请求失败 (${response.status})`,
        details: data?.error?.message || '上游接口暂时不可用',
      }, response.status);
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return jsonResponse({ error: 'DeepSeek 返回了空回复，请稍后重试' }, 502);
    }

    return jsonResponse({ reply });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    console.error('Chat route error:', error);
    return jsonResponse({
      error: isTimeout ? 'DeepSeek 响应超时，请稍后重试' : 'AI 助手暂时无法响应',
    }, isTimeout ? 504 : 500);
  }
}

export async function GET() {
  const apiKey = await getDeepSeekApiKey();
  return jsonResponse({
    status: 'Ready',
    provider: 'DeepSeek',
    apiBaseUrl: siteConfig.geminiConfig.apiBaseUrl,
    model: siteConfig.geminiConfig.modelId,
    configured: Boolean(apiKey),
  });
}
