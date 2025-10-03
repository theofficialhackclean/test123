import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';

const providers = [
  { id: 'webtor-1080', rank: 80 },
  { id: 'webtor-4k', rank: 79 },
  { id: 'webtor-720', rank: 78 },
  { id: 'webtor-480', rank: 77 },
];

function embed(provider: { id: string; rank: number }) {
  return makeEmbed({
    id: provider.id,
    name: `Webtor ${provider.id.split('-')[1].toUpperCase()}`,
    rank: provider.rank,
    async scrape(ctx) {
      // always use 'mp4' to satisfy FileBasedStream type
      return {
        stream: [
          {
            id: 'primary',
            type: 'file',
            qualities: {
              unknown: {
                type: 'mp4', // must be "mp4" for TS types
                url: ctx.url,
              },
            },
            flags: [flags.CORS_ALLOWED],
            captions: [],
          },
        ],
      };
    },
  });
}

export const [
  webtor1080Scraper,
  webtor4kScraper,
  webtor720Scraper,
  webtor480Scraper,
] = providers.map(embed);
