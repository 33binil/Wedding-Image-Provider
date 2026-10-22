/**
 * An in-process fake of the subset of the Google Drive API used by
 * `drive.service.ts`.
 *
 * IMPORTANT: This fake exists so the application's own logic (idempotency,
 * ownership enforcement, retry semantics, persistence) can be tested
 * deterministically. It does NOT verify Google's servers. Passing these tests
 * is NOT evidence that a real Google OAuth flow works — that requires the
 * live verification script.
 */
import { drive_v3 } from 'googleapis';

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  description?: string;
  appProperties?: Record<string, string>;
  webViewLink?: string;
  trashed: boolean;
}

export interface FakeDriveOptions {
  /** Simulates a Drive API error for the next matching operation. */
  failNext?: { operation: 'create' | 'get' | 'list'; error: any };
  /** Simulates an invalid_grant / revoked-token failure. */
  revokeOnUse?: boolean;
  /** Fails every operation with this error. */
  alwaysFail?: any;
}

export class FakeDrive {
  public files: FakeFile[] = [];
  public createCallCount = 0;
  public listCallCount = 0;
  public getCallCount = 0;
  private counter = 0;
  private options: FakeDriveOptions;

  constructor(options: FakeDriveOptions = {}) {
    this.options = options;
  }

  private nextId(): string {
    this.counter += 1;
    return `fake-drive-file-${this.counter}`;
  }

  private maybeFail(operation: 'create' | 'get' | 'list') {
    if (this.options.alwaysFail) {
      throw this.options.alwaysFail;
    }
    const fail = this.options.failNext;
    if (fail && fail.operation === operation) {
      // One-shot failure.
      this.options.failNext = undefined;
      throw fail.error;
    }
  }

  /**
   * Fails every subsequent operation with the given error. Used to simulate a
   * revoked / expired grant, which must break the whole flow rather than a
   * single call.
   */
  public failAllWith(error: any): void {
    this.options.alwaysFail = error;
  }

  private matchesQuery(file: FakeFile, q: string): boolean {
    if (!q) return true;

    // name = 'X'
    const nameMatch = q.match(/name\s*=\s*'([^']*)'/);
    if (nameMatch && file.name !== nameMatch[1]) return false;

    // 'parentId' in parents
    const parentMatch = q.match(/'([^']*)'\s+in\s+parents/);
    if (parentMatch && !(file.parents || []).includes(parentMatch[1])) return false;

    // trashed = false
    if (/trashed\s*=\s*false/.test(q) && file.trashed) return false;

    // appProperties has { key='K' and value='V' }
    const appPropMatch = q.match(
      /appProperties\s+has\s*\{\s*key='([^']*)'\s+and\s+value='([^']*)'\s*\}/
    );
    if (appPropMatch) {
      const [, key, value] = appPropMatch;
      if (file.appProperties?.[key] !== value) return false;
    }

    return true;
  }

  public get client(): drive_v3.Drive {
    const self = this;

    return {
      files: {
        async create(params: any) {
          self.createCallCount += 1;
          self.maybeFail('create');

          const body = params.requestBody || {};
          const id = self.nextId();
          const file: FakeFile = {
            id,
            name: body.name || 'Untitled',
            mimeType: body.mimeType || 'application/vnd.google-apps.folder',
            parents: body.parents,
            description: body.description,
            appProperties: body.appProperties,
            trashed: false,
          };
          self.files.push(file);

          return {
            data: {
              id: file.id,
              name: file.name,
              webViewLink: `https://drive.google.com/drive/folders/${file.id}`,
              appProperties: file.appProperties,
            },
          };
        },

        async get(params: any) {
          self.getCallCount += 1;
          self.maybeFail('get');

          const file = self.files.find((f) => f.id === params.fileId);
          if (!file) {
            const error: any = new Error('File not found: ' + params.fileId);
            error.code = 404;
            throw error;
          }

          return {
            data: {
              id: file.id,
              name: file.name,
              webViewLink: `https://drive.google.com/drive/folders/${file.id}`,
              trashed: file.trashed,
              appProperties: file.appProperties,
            },
          };
        },

        async list(params: any) {
          self.listCallCount += 1;
          self.maybeFail('list');

          const matches = self.files.filter((f) => self.matchesQuery(f, params.q || ''));
          return {
            data: {
              files: matches.map((f) => ({
                id: f.id,
                name: f.name,
                webViewLink: `https://drive.google.com/drive/folders/${f.id}`,
                appProperties: f.appProperties,
              })),
            },
          };
        },
      },
    } as unknown as drive_v3.Drive;
  }

  /** Number of folders that look like event folders (i.e. carry an eventId tag). */
  public countEventFolders(): number {
    return this.files.filter((f) => f.appProperties?.eventId).length;
  }

  public countRootFolders(): number {
    return this.files.filter((f) => f.appProperties?.weddingAiPhotoFinder === 'root' && !f.appProperties?.eventId)
      .length;
  }
}

/**
 * Builds a DriveError-compatible rejection used to simulate a revoked grant.
 */
export function invalidGrantError(): any {
  const error: any = new Error('Invalid grant: refresh token has been revoked');
  error.code = 400;
  error.response = {
    status: 400,
    data: { error: 'invalid_grant' },
  };
  return error;
}
