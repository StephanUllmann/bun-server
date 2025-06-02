import { $ } from 'bun';
import path from 'path';
import fs from 'fs/promises';
import { Elysia, t } from 'elysia';
import { Webhooks } from '@octokit/webhooks';
import { rateLimit } from 'elysia-rate-limit';

const secret = process.env.WEBHOOK_SECRET!;

if (!secret) {
  console.error('WEBHOOK_SECRET is not set.');
  process.exit(1);
}

const webhooks = new Webhooks({ secret });

const allowedRepoOwners = new Set(process.env.ALLOWED_OWNERS?.split(' ') || []);
if (allowedRepoOwners.size === 0) {
  console.warn('No allowed repository owners configured.');
}

const baseDir = '/var/www';

const port = process.env.PORT ?? 3000;

const app = new Elysia()
  .use(rateLimit({ max: 5 }))
  .get('/', { msg: 'Running' })
  .post(
    '/webhook',
    async ({ body, headers, set }) => {
      const signature = headers['x-hub-signature-256'];
      const isLegit = await webhooks.verify(body, signature);
      if (!isLegit) {
        set.status = 401;
        return;
      }

      set.status = 202;

      return 'Accepted';
    },
    {
      parse: 'text',
      body: t.String(),
      headers: t.Object({
        'x-hub-signature-256': t.String(),
        'x-github-event': t.String(),
      }),
      error({ error }) {
        console.log({ error });
        return 'happens';
      },
      async afterHandle({ body, set, headers }) {
        if (set.status !== 202) return;
        if (headers['x-github-event'] !== 'push') return;
        try {
          const parsed = JSON.parse(body);
          const repo = parsed.repository.name;
          const owner = parsed.repository.owner.name;
          if (!allowedRepoOwners.has(owner)) return;

          if (!/^[a-zA-Z0-9_-]+$/.test(repo)) return;

          const repoDir = path.join(baseDir, repo);
          const stat = await fs.stat(repoDir).catch(() => null);
          if (!stat || !stat.isDirectory()) {
            console.warn(`Repository directory does not exist or is not a directory: ${repoDir}`);
            return;
          }

          $.cwd(repoDir);
          await $`git pull`;

          if (await Bun.file(path.join(repoDir, 'package.json')).exists()) {
            await $`npm run build`;
          }
        } catch (err: any) {
          console.log(`Failed with code ${err.exitCode}`);
          console.log(err.stdout.toString());
          console.log(err.stderr.toString());
        }
      },
    }
  )
  .listen(port);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
