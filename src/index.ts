import { $ } from 'bun';
import { Elysia, t } from 'elysia';
import { Webhooks } from '@octokit/webhooks';

const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET!,
});

const port = process.env.PORT ?? 3000;

const app = new Elysia()
  .get('/', { msg: 'Running' })
  .post(
    '/webhook',
    async ({ request, headers, set }) => {
      console.log('RUNNING');
      const signature = headers['x-hub-signature-256'];
      console.log(signature);
      const payload = await request.text();
      const isLegit = await webhooks.verify(payload, signature);
      console.log({ isLegit });
      set.status = 202;
      new Response('Accepted');
      return { msg: 'running POST /webhook' };
    },
    {
      headers: t.Object({
        'x-hub-signature-256': t.String(),
      }),
      error({ error }) {
        console.log(error);
        return 'happens';
      },
    }
  )
  .listen(port);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
