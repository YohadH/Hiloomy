import {
  CREATIVE_PROVIDERS,
  PROVIDER_CAPABILITIES,
  type CreativeProvider
} from "@/lib/domain/creative-types";

// What the wizard needs to know about each provider — whether the API key is
// configured in env, what env var is missing if not, and which capabilities
// (image / video) the provider supports.
//
// Server-side only (reads process.env). Pages call this and pass the result
// down to the client wizard.

export interface CreativeProviderStatus {
  provider: CreativeProvider;
  configured: boolean;
  envVar: string;
  supportsImage: boolean;
  supportsVideo: boolean;
}

const ENV_VAR_BY_PROVIDER: Record<CreativeProvider, string> = {
  replicate: "REPLICATE_API_TOKEN",
  higgsfield: "HIGGSFIELD_API_KEY",
  nanobanana: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY"
};

export function getProviderAvailability(): CreativeProviderStatus[] {
  return CREATIVE_PROVIDERS.map((provider) => {
    const envVar = ENV_VAR_BY_PROVIDER[provider];
    const value = process.env[envVar];
    return {
      provider,
      envVar,
      configured: Boolean(value && value.trim().length > 0),
      supportsImage: PROVIDER_CAPABILITIES[provider].image,
      supportsVideo: PROVIDER_CAPABILITIES[provider].video
    };
  });
}
