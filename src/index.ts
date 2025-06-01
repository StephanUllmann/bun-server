import { $ } from 'bun';
import { Elysia, t } from 'elysia';
import { Webhooks } from '@octokit/webhooks';

const secret = process.env.WEBHOOK_SECRET!;
const webhooks = new Webhooks({ secret });

const port = process.env.PORT ?? 3000;

const app = new Elysia()
  .get('/', { msg: 'Running' })
  .post(
    '/webhook',
    async ({ body, headers, set }) => {
      const signature = headers['x-hub-signature-256'];
      const isLegit = await webhooks.verify(body, signature);
      console.log({ isLegit });
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
      }),
      error({ error }) {
        console.log({ error });
        return 'happens';
      },
      async afterHandle({ body, set }) {
        if (set.status !== 202) return;
        const parsed = JSON.parse(body);
        const repo = parsed.repository.name;
        try {
          $.cwd('/var/www');
          const foundDir = (await $`ls | grep -x "${repo}"`.text()).replaceAll('\n', '');
          if (foundDir !== repo) return;

          $.cwd(`/var/www/${repo}`);
          await $`git pull`;
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
