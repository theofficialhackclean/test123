import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { categorizeStreams, getMagnetUrl, getTopStreamsBySeeders } from './common';
import { Response, Stream } from './types';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const search =
    ctx.media.type === 'movie'
      ? `movie/${ctx.media.imdbId}.json`
      : `series/${ctx.media.imdbId}:${ctx.media.season.number}:${ctx.media.episode.number}.json`;

  const rawResponse = await ctx.fetcher(
    `https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex/stream/${search}`
  );

  const response: Response = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;

  ctx.progress(40);

  // Filter only MP4 streams
  const mp4Streams: Stream[] = response.streams.filter((s: Stream) => {
    const container = s.container?.toLowerCase();
    const type = s.type?.toLowerCase();
    const name = s.name?.toLowerCase();

    return container === 'mp4' || type === 'video/mp4' || name?.endsWith('.mp4');
  });

  response.streams = mp4Streams;

  if (mp4Streams.length === 0) {
    ctx.progress(100);
    return { embeds: [] };
  }

  const categories = categorizeStreams(mp4Streams);
  const embeds: { embedId: string; url: string }[] = [];

  for (const [category, streams] of Object.entries(categories)) {
    const [topStream] = getTopStreamsBySeeders(streams, 1);
    if (!topStream?.infoHash || !topStream?.name) continue;

    try {
      const magnet = getMagnetUrl(topStream.infoHash, topStream.name);
      const webtorUrl = `https://webtorrent-dun.vercel.app/magnet/download?link=${encodeURIComponent(magnet)}`;

      embeds.push({
        embedId: `webtor-${category.replace(/p$/, '')}`,
        url: webtorUrl,
      });
    } catch (error) {
      console.error(`Failed to create Webtor URL for ${category}:`, error);
    }
  }

  ctx.progress(100);
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
