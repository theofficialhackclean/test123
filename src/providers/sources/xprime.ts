import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const embeds = [];

  embeds.push({
    embedId: 'xprime-fox',
    url: JSON.stringify({
      type: ctx.media.type,
      title: ctx.media.title,
      ...(ctx.media.type === 'show' && {
        season: ctx.media.season.number,
        episode: ctx.media.episode.number,
      }),
    }),
  });

  embeds.push({
    embedId: 'xprime-apollo',
    url: JSON.stringify({
      type: ctx.media.type,
      tmdbId: ctx.media.tmdbId,
      ...(ctx.media.type === 'show' && {
        season: ctx.media.season.number,
        episode: ctx.media.episode.number,
      }),
    }),
  });

  return { embeds };
}

export const xprimeScraper = makeSourcerer({
  id: 'xprimetv',
  name: 'xprime.tv',
  rank: 240,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
