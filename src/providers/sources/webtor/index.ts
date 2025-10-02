import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { categorizeStreams, getTopStreamsBySeeders, getMagnetUrl } from './common';
import { Response } from './types';

// Helper: send magnet link to localhost/torrent/name and get plain text name
async function getTorrentName(magnet: string, ctx: ShowScrapeContext | MovieScrapeContext): Promise<string> {
  const response = await ctx.fetcher('http://localhost/torrent/name', {
    method: 'POST', // or 'GET' if your API supports query param
    body: JSON.stringify({ magnet }),
    headers: { 'Content-Type': 'application/json' },
  });

  // Treat response as plain text
  const name = typeof response === 'string' ? response : await response.text?.();
  return name?.trim() || '';
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const search =
    ctx.media.type === 'movie'
      ? `movie/${ctx.media.imdbId}.json`
      : `series/${ctx.media.imdbId}:${ctx.media.season.number}:${ctx.media.episode.number}.json`;

  const response: Response = await ctx
    .fetcher(
      `https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex/stream/${search}`
    )
    .then((res) => (typeof res === 'string' ? JSON.parse(res) : res));

  ctx.progress(50);

  const categories = categorizeStreams(response.streams);
  const embeds: { embedId: string; url: string }[] = [];

  for (const [category, streams] of Object.entries(categories)) {
    const [topStream] = getTopStreamsBySeeders(streams, 1);
    if (!topStream) continue;

    try {
      // Step 1: Get magnet link
      const magnetLink = getMagnetUrl(topStream.infoHash, topStream.name);

      // Step 2: Get torrent name from localhost/torrent/name (plain text)
      const torrentName = await getTorrentName(magnetLink, ctx);

      // Step 3: Build final Webtor URL using the name
      const webtorUrl = `http://localhost/torrent/${encodeURIComponent(torrentName)}`;

      embeds.push({
        embedId: `webtor-${category.replace('p', '')}`,
        url: webtorUrl,
      });
    } catch (error) {
      console.error(`Failed to create Webtor URL for ${category}:`, error);
    }
  }

  ctx.progress(90);

  return { embeds };
}

export const webtorScraper = makeSourcerer({
  id: 'webtor',
  name: 'Webtor',
  rank: 2,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
