import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { categorizeStreams, getMagnetUrl, getTopStreamsBySeeders } from './common';
import { Response } from './types';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const search =
    ctx.media.type === 'movie'
      ? `movie/${ctx.media.imdbId}.json`
      : `series/${ctx.media.imdbId}:${ctx.media.season.number}:${ctx.media.episode.number}.json`;

  // get torrentio results
  const response: Response = await ctx
    .fetcher(
      `https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex/stream/${search}`
    )
    .then((res) => (typeof res === 'string' ? JSON.parse(res) : res));

  ctx.progress(40);

  // 🧠 Filter streams to only include MP4s
  const mp4Streams = response.streams.filter((s: any) =>
    s.name?.toLowerCase().includes('.mp4')
  );

  // If no MP4 streams found, fallback to all (to avoid total failure)
  const filteredResponse = {
    ...response,
    streams: mp4Streams.length > 0 ? mp4Streams : response.streams,
  };

  const categories = categorizeStreams(filteredResponse.streams);
  const embeds: { embedId: string; url: string }[] = [];

  // loop through stream categories
  for (const [category, streams] of Object.entries(categories)) {
    const [topStream] = getTopStreamsBySeeders(streams, 1);
    if (!topStream) continue;

    try {
      const magnet = getMagnetUrl(topStream.infoHash, topStream.name);

      // ✅ use your webtorrent-dun endpoint directly, do NOT fetch it
      const webtorUrl = `https://webtorrent-dun.vercel.app/magnet/download?link=${encodeURIComponent(magnet)}`;

      embeds.push({
        embedId: `webtor-${category.replace('p', '')}`,
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
