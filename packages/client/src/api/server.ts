import {
  ServerConfig,
  ServerConfigSchema,
  ServerInfo,
  ServerInfoSchema,
} from '@agam-space/shared-types';
import { ClientRegistry } from '../registry/client.registry';

export async function fetchServerConfigApi(): Promise<ServerConfig> {
  return ClientRegistry.getApiClient().fetchAndParse('/v1/server/config', ServerConfigSchema);
}

export async function fetchServerInfoApi(): Promise<ServerInfo> {
  return ClientRegistry.getApiClient().fetchAndParse('/v1/server/info', ServerInfoSchema);
}
