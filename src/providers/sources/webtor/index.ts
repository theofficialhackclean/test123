import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { categorizeStreams, getTopStreamsBySeeders, getMagnetUrl } from './common';
import { Response } from './types';

// Helper: Get the torrent name from localhost using the magnet link
async function getTorrentNameFromMagnet(magnet: string, ctx: ShowScrapeContext | MovieScrapeContext): Promise<string> {
  const nameResponse = await ctx.fetcher(`http://localhost/torrent/${encodeURIComponent(magnet)}/name`);
  const data = typeof nameResponse === 'string' ? JSON.parse(nameResponse) : nameResponse;
  return data.name;
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const search =
    ctx.media.type === 'movie'
      ? `movie/${ctx.media.imdbId}.json`
      : `series/${ctx.media.imdbId}:${ctx.media.season.number}:${ctx.media.episode.number}.json`;

  // Fetch streams from torrentio
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
      // Step 1: Get the magnet link
      const magnetLink = getMagnetUrl(topStream.infoHash, topStream.name);

      // Step 2: Get the torrent name from localhost using the magnet
      const torrentName = await getTorrentNameFromMagnet(magnetLink, ctx);

      // Step 3: Build Webtor URL using the torrent name
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
