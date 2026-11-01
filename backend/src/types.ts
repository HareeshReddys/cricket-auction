export type User = { id: string; email: string; role: "admin" | "organizer" };
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  FRONTEND_ORIGIN: string;
  ADMIN_EMAIL: string;
  ADMIN_SETUP_TOKEN?: string;
  ASSET_SIGNING_KEY: string;
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_WEBHOOK_SECRET?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REFRESH_TOKEN?: string;
  GOOGLE_DRIVE_FOLDER_ID?: string;
  GOOGLE_SHEET_SHARE_EMAIL?: string;
}
export type Context = {
  env: Env;
  user: User | null;
  sessionHash?: string;
  waitUntil: (p: Promise<unknown>) => void;
};
