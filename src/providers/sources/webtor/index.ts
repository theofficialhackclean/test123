import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { categorizeStreams, getTopStreamsBySeeders } from './common';
import { Response } from './types';

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

  Object.entries(categories).forEach(([category, streams]) => {
    const [topStream] = getTopStreamsBySeeders(streams, 1);
    if (!topStream) return;

    try {
      // Build direct local torrent URL with file name
      const torrentUrl = `http://localhost/torrent/${encodeURIComponent(topStream.name)}`;

      embeds.push({
        embedId: `local-${category.replace('p', '')}`,
        url: torrentUrl,
      });
    } catch (error) {
      console.error(`Failed to create local torrent URL for ${category}:`, error);
    }
  });

  ctx.progress(90);

  return { embeds };
}

export const localTorrentScraper = makeSourcerer({
  id: 'local-torrent',
  name: 'Local Torrent',
  rank: 2,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});

