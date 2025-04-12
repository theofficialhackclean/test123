/* eslint-disable no-console */
import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const apiUrl = 'https://tom.autoembed.cc';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const mediaType = ctx.media.type === 'show' ? 'tv' : 'movie';
  let id = ctx.media.tmdbId;

  if (ctx.media.type === 'show') {
    id = `${id}/${ctx.media.season.number}/${ctx.media.episode.number}`;
  }

  const data = await ctx.proxiedFetcher(`/api/getVideoSource`, {
    baseUrl: apiUrl,
    query: {
      type: mediaType,
      id,
    },
    headers: {
      Referer: apiUrl,
    },
  });

  console.log(data);

  if (!data) throw new NotFoundError('Failed to fetch video source');
  if (!data.videoSource) throw new NotFoundError('No video source found');
  ctx.progress(50);

  const embeds: SourcererEmbed[] = [
    {
      embedId: `autoembed-english`,
      url: data.videoSource,
    },
  ];

  ctx.progress(90);

  return {
    embeds,
  };
}

export const autoembedScraper = makeSourcerer({
  id: 'autoembed',
  name: 'Autoembed',
  rank: 90,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
