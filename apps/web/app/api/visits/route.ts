import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';

const COUNTER_FILE = process.env.VISIT_COUNTER_FILE || (
  process.platform === 'win32'
    ? `${process.cwd()}\\data\\visits.json`
    : '/srv/xinghui-blog/data/visits.json'
);
const PAGE_VIEW_HEADER = 'x-liu-page-view-id';
const PAGE_VIEW_RETENTION_MS = 24 * 60 * 60 * 1000;

type VisitCounter = {
  total: number;
  updatedAt: string | null;
  pageViews: Record<string, string>;
};

let updateQueue: Promise<void> = Promise.resolve();

async function readCounter(): Promise<VisitCounter> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ COUNTER_FILE, 'utf8');
    const data = JSON.parse(raw);
    const total = Number(data?.total);
    return {
      total: Number.isSafeInteger(total) && total >= 0 ? total : 0,
      updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
      pageViews: data?.pageViews && typeof data.pageViews === 'object' ? data.pageViews : {},
    };
  } catch {
    return { total: 0, updatedAt: null, pageViews: {} };
  }
}

function getPageViewKey(request: Request) {
  const pageViewId = (request.headers.get(PAGE_VIEW_HEADER) || '').trim();
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(pageViewId)) return null;
  return createHash('sha256').update(pageViewId).digest('hex');
}

async function registerVisit(request: Request) {
  let result = { total: 0, counted: false };
  const operation = updateQueue.then(async () => {
    const current = await readCounter();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const pageViewKey = getPageViewKey(request);

    for (const [key, timestamp] of Object.entries(current.pageViews)) {
      const recordedAt = Date.parse(timestamp);
      if (!Number.isFinite(recordedAt) || now - recordedAt > PAGE_VIEW_RETENTION_MS) {
        delete current.pageViews[key];
      }
    }

    const counted = !pageViewKey || !current.pageViews[pageViewKey];
    if (pageViewKey) current.pageViews[pageViewKey] = nowIso;
    const next: VisitCounter = {
      total: current.total + (counted ? 1 : 0),
      updatedAt: counted ? nowIso : current.updatedAt,
      pageViews: current.pageViews,
    };
    const directory = dirname(COUNTER_FILE);
    const temporaryFile = `${COUNTER_FILE}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      /* turbopackIgnore: true */ temporaryFile,
      `${JSON.stringify(next, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await rename(
      /* turbopackIgnore: true */ temporaryFile,
      /* turbopackIgnore: true */ COUNTER_FILE,
    );
    result = { total: next.total, counted };
  });

  updateQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

function responseHeaders() {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export async function GET() {
  const counter = await readCounter();
  return new Response(JSON.stringify(counter), { headers: responseHeaders() });
}

export async function POST(request: Request) {
  try {
    const { total, counted } = await registerVisit(request);
    return new Response(JSON.stringify({ total, counted }), {
      headers: responseHeaders(),
    });
  } catch (error) {
    console.error('Visit counter update failed:', error);
    return new Response(JSON.stringify({ error: '访问量暂时无法读取' }), {
      status: 500,
      headers: responseHeaders(),
    });
  }
}
