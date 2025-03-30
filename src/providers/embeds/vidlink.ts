import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';

const vidlinkProviders = [
  {
    id: 'vidlink-1',
    name: 'VidLink Server 1',
    rank: 304,
  },
  {
    id: 'vidlink-2',
    name: 'VidLink Server 2',
    rank: 305,
    disabled: false,
  },
  {
    id: 'vidlink-4k',
    name: 'VidLink 4K Server',
    rank: 306,
  },
];

function createVidLinkEmbed(provider: { id: string; name: string; rank: number; disabled?: boolean }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    disabled: provider.disabled,
    rank: provider.rank,
    async scrape(ctx) {
      const url = ctx.url;
      
      let finalUrl = url;
      if (provider.id === 'vidlink-4k') {
        finalUrl = url.replace('/play/', '/play/4k/');
      }
      
      if (!finalUrl || !finalUrl.includes('vidlink.pro')) {
        throw new Error('Invalid VidLink URL');
      }

      return {
        stream: [
          {
            id: 'primary',
            type: 'file',
            qualities: {
              unknown: { // Changed from 'default' to 'unknown'
                url: finalUrl, 
                type: 'mp4' as const,
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
  vidlinkServer1Scraper,
  vidlinkServer2Scraper,
  vidlink4kScraper,
] = vidlinkProviders.map(createVidLinkEmbed);
