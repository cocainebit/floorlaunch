/**
 * Server-side JSON file store for comments and subscribers. Shared across
 * all visitors (unlike the previous per-browser localStorage). Runs in the
 * Node runtime of the API routes; data lives in ./data (gitignored). For a
 * serverless/multi-instance deploy, swap these four functions for a hosted
 * DB (the call sites do not change).
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export type Comment = {
  id: string;
  author: string;
  text: string;
  ts: number;
};

export async function getComments(): Promise<Comment[]> {
  return readJson<Comment[]>("comments.json", []);
}

export async function addComment(c: Comment): Promise<Comment> {
  const list = await getComments();
  list.unshift(c);
  await writeJson("comments.json", list.slice(0, 1000));
  return c;
}

export async function addSubscriber(
  email: string
): Promise<{ ok: boolean; already: boolean }> {
  const list = await readJson<string[]>("subscribers.json", []);
  const e = email.trim().toLowerCase();
  if (list.includes(e)) return { ok: true, already: true };
  list.push(e);
  await writeJson("subscribers.json", list);
  return { ok: true, already: false };
}

export async function getSubscriberCount(): Promise<number> {
  return (await readJson<string[]>("subscribers.json", [])).length;
}
