import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { categorizeStreams, getTopStreamsBySeeders, getMagnetUrl } from './common';
import { Response } from './types';

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
      // Build magnet link
      const magnet = getMagnetUrl(topStream.infoHash, topStream.name);

      // Build localhost endpoint
      let localUrl = `http://localhost/magnet/download?link=${encodeURIComponent(magnet)}`;
      if (ctx.media.type === 'show') {
        localUrl += `&season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
      }

      embeds.push({
        embedId: `local-${category.replace('p', '')}`,
        url: localUrl,
      });
    } catch (error) {
      console.error(`Failed to create local magnet URL for ${category}:`, error);
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
