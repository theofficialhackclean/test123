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

  ctx.progress(50);

  const categories = categorizeStreams(response.streams);
  const embeds: { embedId: string; url: string }[] = [];

  // loop through stream categories
  for (const [category, streams] of Object.entries(categories)) {
    // Filter streams to only include MP4 files
    const mp4Streams = streams.filter((stream: any) => 
      stream.name?.toLowerCase().includes('.mp4') || 
      stream.title?.toLowerCase().includes('.mp4')
    );

    if (mp4Streams.length === 0) continue;

    const [topStream] = getTopStreamsBySeeders(mp4Streams, 1);
    if (!topStream) continue;

    try {
      const magnet = getMagnetUrl(topStream.infoHash, topStream.name);

      // use your webtorrent-dun endpoint directly
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