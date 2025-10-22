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

  let response: Response | null = null;

  try {
    const res = await ctx.fetcher(
      `https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex/stream/${search}`
    );

    response = typeof res === 'string' ? JSON.parse(res) : res;
  } catch (err) {
    console.error('[WebtorScraper] Failed to fetch torrent data:', err);
    return { embeds: [] };
  }

  if (!response?.streams?.length) {
    console.warn('[WebtorScraper] No streams found for', search);
    return { embeds: [] };
  }

  ctx.progress(50);

  const categories = categorizeStreams(response.streams);
  const embeds: { embedId: string; url: string }[] = [];

  for (const [category, streams] of Object.entries(categories)) {
    const [topStream] = getTopStreamsBySeeders(streams, 1);
    if (!topStream) continue;

    try {
      const magnet = getMagnetUrl(topStream.infoHash, topStream.name);
      const webtorUrl = `https://webtorrent-dun.vercel.app/magnet/download?link=${encodeURIComponent(magnet)}`;

      // Normalize category name to match embed IDs (e.g. 1080p -> webtor-1080)
      const quality = category.replace(/p/i, '').trim();

      embeds.push({
        embedId: `webtor-${quality}`,
        url: webtorUrl,
      });
    } catch (error) {
      console.error(`[WebtorScraper] Failed to create Webtor URL for ${category}:`, error);
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
