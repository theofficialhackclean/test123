import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { getValidQualityFromString } from '@/utils/quality';

const providers = [
  { id: 'webtor-1080', rank: 80 },
  { id: 'webtor-4k', rank: 79 },
  { id: 'webtor-720', rank: 78 },
  { id: 'webtor-480', rank: 77 },
];

function embed(provider: { id: string; name: string; rank: number; disabled?: boolean }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    disabled: provider.disabled,
    rank: provider.rank,
    async scrape(ctx) {
      const [url, quality] = ctx.url.split('|');
      return {
        stream: [
          {
            id: 'primary',
            type: 'file',
            qualities: {
              [getValidQualityFromString(quality || '')]: { url, type: 'mp4' },
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
