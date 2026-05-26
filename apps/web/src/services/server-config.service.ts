import { useServerConfigStore } from '@/store/server-config.store';
import { fetchServerConfigApi } from '@agam-space/client';

export const ServerConfigService = {
  async getConfig(cache: boolean = true) {
    try {
      let config = useServerConfigStore.getState().config;
      if (cache && config && Object.keys(config).length > 0) {
        return config;
      }

      config = await fetchServerConfigApi();
      useServerConfigStore.getState().setConfig(config);

      return config;
    } catch (err) {
      console.error('Failed to fetch config', err);
      throw new Error(
        'Failed to fetch server configuration' + (err instanceof Error ? `: ${err.message}` : ''),
        { cause: err }
      );
    }
  },
};
