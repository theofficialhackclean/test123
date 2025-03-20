import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://api.coitus.ca';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const apiUrl =
    ctx.media.type === 'movie'
      ? `${baseUrl}/movie/${ctx.media.tmdbId}`
      : `${baseUrl}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;

  const apiRes = await ctx.proxiedFetcher(apiUrl);

  if (!apiRes.videoSource) throw new NotFoundError('No watchable item found');
  ctx.progress(90);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions: [],
        playlist: apiRes.videoSource,
        type: 'hls',
        flags: [flags.CORS_ALLOWED],
      },
    ],
  };
}

export const coitusScraper = makeSourcerer({
  id: 'coitus',
  name: 'Autoembed+',
  rank: 91,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
