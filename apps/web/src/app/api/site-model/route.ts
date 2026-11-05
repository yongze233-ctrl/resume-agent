import { publicSiteModel, publicSiteModels } from '@/lib/ai/siteModelServer';

export const dynamic = 'force-dynamic';

export function GET() {
  const model = publicSiteModel();
  const headers = { 'Cache-Control': 'no-store, private' };
  return model ? Response.json({ ...model, models: publicSiteModels() }, { headers }) : new Response(null, { status: 204, headers });
}
