import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { categorizeStreams, getTopStreamsBySeeders, getMagnetUrl } from './common';
import { Response } from './types';

// Helper: load torrent via magnet and wait for the name to be available
async function getTorrentName(magnet: string, ctx: ShowScrapeContext | MovieScrapeContext): Promise<string> {
  // Step 1: load the torrent on localhost
  await ctx.fetcher(`http://localhost/?magnet=${encodeURIComponent(magnet)}`);

  // Step 2: poll until the name is available
  let torrentName = '';
  for (let i = 0; i < 10; i++) { // try up to 10 times
    const response = await ctx.fetcher('http://localhost/torrent/name');
    torrentName = typeof response === 'string' ? response.trim() : await response.text?.();
    if (torrentName) break; // stop polling once name is available
    await new Promise((resolve) => setTimeout(resolve, 500)); // wait 0.5s before retry
  }

  if (!torrentName) {
    console.error('Failed to get torrent name after loading magnet');
  }

  return torrentName;
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
      // Step 1: get magnet link
      const magnet = getMagnetUrl(topStream.infoHash, topStream.name);

      // Step 2: load torrent and get its name
      const torrentName = await getTorrentName(magnet, ctx);

      if (!torrentName) continue; // skip if name could not be fetched

      // Step 3: build Webtor URL
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
