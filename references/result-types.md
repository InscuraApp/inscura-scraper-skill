# Plugin Results: Exact Fields and Null Rules

Use this reference together with [plugin-contract.md](plugin-contract.md). All results are JSON-serializable plain objects with camelCase properties. The fields below describe the JavaScript results consumed by the host, not application editing forms.

## General Rules

- Search methods return arrays; detail methods return one object. Every result must provide nonempty string `id` and `provider` values. Search results also need an identifiable `title` for media/TV or `name` for actors. The host defaults many omitted fields, but an empty identity is still invalid.
- In the tables and interfaces below, `?` permits omission; it **does not automatically permit null**. Only properties explicitly marked `| null` accept null. Ordinary strings, numbers, booleans, and arrays must not be null. For example, media `title: null`, actor `photos: null`, and TV `network: null` fail deserialization.
- Prefer omission for unknown values. Do not substitute `0`, `""`, or `[]` for unknown data. Result data must not contain `NaN`, `Infinity`, `BigInt`, `undefined`, circular references, functions, or runtime objects.
- Empty arrays and omitted values do not universally mean "preserve the existing value." In particular, an explicitly empty season catalog refreshes its snapshot. The host controls overwrite and fill-empty behavior; a plugin must not promise that all empty values are non-destructive.
- `matchScore` is a finite `0..1` measure of relevance to the input. It is not a user rating or an upstream search weight with an unknown range. Ratings generally use `0..10`; explicitly convert from a known percentage or five-star scale. Do not invent match scores, ratings, dates, or translations.
- Return valid HTTPS URLs for images, source pages, and trailers; use HTTP only when the upstream source actually requires it. Omit missing images. Do not return filesystem paths or data URIs, or download/write media inside the plugin.

## TV

The following TypeScript describes output types only. The delivered plugin script remains JavaScript.

```ts
interface ExternalId { provider: string; id: string }

interface TvSearchResult {
  id: string; provider: string; title: string;
  originalTitle?: string | null;
  year?: number | null;
  firstAired?: string | null;
  status?: string | null;
  network?: string | null;
  overview?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  rating?: number | null;
  voteCount?: number | null;
  popularity?: number | null;
  originalLanguage?: string | null;
  originCountries?: string[];
  adult?: boolean | null;
  genreIds?: number[];
  externalIds?: ExternalId[];
  matchScore?: number;
}

interface TvDetail {
  id: string; provider: string;
  title?: string | null;
  originalTitle?: string | null;
  tagline?: string | null;
  description?: string | null;
  year?: number | null;
  firstAired?: string | null;
  lastAired?: string | null;
  contentRating?: string | null;
  averageRuntime?: number | null;
  rating?: number | null;
  aliases?: string[];
  externalIds?: ExternalId[];
  tvGenre?: string[];
  network?: string[];
  tvStudio?: string[];
  tvTag?: string[];
  tvStatus?: string | null;
  cast?: Credit[]; crew?: Credit[];
  poster?: string | null; backdrop?: string | null;
  banner?: string | null; logo?: string | null; clearart?: string | null;
  trailer?: string | null;
  photos?: Photo[];
  seasons?: TvSeason[];
  episodes?: TvEpisode[];
  episodeCatalogs?: Array<{
    seasonNumber: number;
    episodes: Array<{ episodeNumber: number; title?: string | null }>;
  }> | null;
  artworks?: Artwork[];
  customFields?: CustomField[];
  sourceUrl?: string | null;
}

interface TvSeason {
  seasonNumber: number;
  title?: string | null; description?: string | null;
  year?: number | null; firstAired?: string | null;
  rating?: number | null; voteCount?: number | null;
  episodeCount?: number | null;
  externalIds?: ExternalId[];
  cast?: Credit[]; crew?: Credit[];
  poster?: string | null; backdrop?: string | null; banner?: string | null;
}

interface TvEpisode {
  seasonNumber: number; episodeNumber: number;
  title?: string | null; originalTitle?: string | null;
  description?: string | null; releaseDate?: string | null;
  rating?: number | null; voteCount?: number | null;
  runtime?: number | null;
  productionCode?: string | null; episodeType?: string | null;
  stillUrl?: string | null; poster?: string | null; banner?: string | null;
  externalIds?: ExternalId[];
  cast?: Credit[]; guestStars?: Credit[]; crew?: Credit[];
  directors?: Credit[]; writers?: Credit[];
}

interface Artwork {
  provider: string;
  scope: "series" | "season" | "episode";
  type: "poster" | "backdrop" | "banner" | "logo" | "clearart" | "photo";
  urlOrPath: string; // Plugins return HTTP(S) URLs only.
  thumbUrl?: string | null; language?: string | null;
  width?: number | null; height?: number | null;
  scoreOrLikes?: number | null; voteCount?: number | null;
  seasonNumber?: number | null; episodeNumber?: number | null;
  isSelected?: boolean;
}
```

- `averageRuntime` and episode `runtime` are **positive integer minutes**. Do not supply seconds or file-probed milliseconds. TV years are integers in `1000..9999`; season and episode numbers are nonnegative integers. Vote and episode counts are also nonnegative integers. Elements of `genreIds` and artwork `width`/`height` must be integers as well.
- TV dates accept valid `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. Do not fill unknown months or days with 01. Ratings must satisfy `0 < rating <= 10`; omit unknown ratings.
- Search `network` is one string; detail `network` is a string array. Search `overview`, `posterUrl`, and `status` correspond to detail `description`, `poster`, and `tvStatus`.
- Show and episode `externalIds.provider` values are limited to lowercase `imdb`, `tvdb`, `tmdb`, and `wikidata`. Seasons accept only `tvdb`, `tmdb`, and `wikidata`. Use at most one ID per provider; unsupported providers are filtered out. Store a TVmaze ID in the top-level `id`, not in `externalIds`, and never relabel it as a TVDB ID. Preserve the IMDb `tt` prefix.
- Season and episode `artworks` require the corresponding season/episode numbers. At these scopes, only `poster`, `backdrop`, `banner`, and `photo` are supported. `logo` and `clearart` are show-level only. The host normalizes `clearlogo` to `logo` and `still` to `photo`; generate the standard types directly.
- Every `episodeCatalogs` entry must contain `seasonNumber` and `episodes`, and every episode entry must contain `episodeNumber`. Include only successfully obtained complete season snapshots. See [TV scope and episode catalogs](plugin-contract.md#tv-scope-and-episode-catalogs).

## Media

For movie or standalone media search results, provide `id`, `provider`, and `title`. The remaining properties may be omitted but must not be explicitly null:

| Properties | Type |
| --- | --- |
| `number`, `originalTitle`, `thumbUrl`, `coverUrl`, `releaseDate` | string |
| `score`, `matchScore` | number |

Media details require `id` and `provider`; `title` is recommended. All properties below may be omitted but must not be null:

| Properties | Type or purpose |
| --- | --- |
| `number`, `title`, `originalTitle`, `summary` | string; identifier/code, title, original title, and description |
| `thumbUrl`, `bigThumbUrl` | string; portrait poster, with the big version preferred |
| `coverUrl`, `bigCoverUrl` | string; landscape backdrop, with the big version preferred |
| `previewVideoUrl` | string; preview video URL |
| `photos` | `Photo[]` |
| `cast`, `crew` | `Credit[]` |
| `maker`, `label`, `series` | string; note that label and series are not arrays |
| `studios`, `genres`, `tags`, `collections` | string[]; names, not numeric taxonomy IDs |
| `collectionDetails` | `Array<{ id?: string; name?: string; overview?: string }>` |
| `score`, `imdbRating` | number; rating in 0..10, omitted when unknown |
| `imdbVotes` | integer; nonnegative vote count |
| `releaseDate`, `sourceUrl` | string |
| `imdbId`, `tmdbId`, `wikidataId` | string; preserve the source ID format |
| `releaseSource`, `releaseGroup` | string |
| `releaseFlags` | string[] |
| `customFields` | `CustomField[]` |

Media dates use `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. Current host sanitization filters out years before 1900. Do not claim those earlier dates have been persisted.

**Do not output obsolete aliases** such as `code`, `description`, `rating`, `portraitCoverUrl`, `backdropUrl`, `screenshotUrl`, `trailerUrl`, or `labels`. They are not the media result properties above and may be silently ignored. The manifest standard fields `code`, `description`, `rating`, `portraitCover`, `backdrop`, and `previewVideo` map respectively to `number`, `summary`, `score`, `bigThumbUrl` or `thumbUrl`, `bigCoverUrl` or `coverUrl`, and `previewVideoUrl`. Although `screenshot` appears in the standard field allowlist, the current detail type has no separate screenshot transport property; do not invent one.

Media details have no `duration` or `runtime` property. If upstream runtime must be retained, declare and return a custom `duration_minutes` text field and clearly label its unit as minutes. Do not overwrite the actual duration probed from the media file.

## Actor

Actor/person search results use `{ id: string, provider: string, name: string, avatar?: string, matchScore?: number }`. Optional properties must not be null. `id` is the original upstream ID, not a concatenated interface identifier.

Actor details require `id`, `provider`, and `name`. Other properties may be omitted but must not be null:

| Properties | Type or format |
| --- | --- |
| `description`, `sourceUrl` | string |
| `aliases`, `skills`, `tags` | string[] |
| `birthday`, `debutDate` | string; valid `YYYY-MM-DD`; current sanitization requires a year of at least 1900 |
| `height` | string; decimal text in centimeters, such as `"175"`, not a number |
| `measurements` | string, such as `"90-58-88"`; there are no separate bust/waist/hip fields |
| `nationality`, `gender` | string; a name or a clearly identified source value |
| `avatar` | string; portrait URL, not avatarUrl |
| `photos` | string[]; URL strings, not Photo objects |
| `socialLinks` | `Array<{ platform: string; handle?: string | null; url?: string | null }>`; platform is required in JSON |
| `customFields` | `CustomField[]` |

`bloodType`, `hobby`, `avatarUrl`, `bust`, `waist`, and `hip` are not current actor detail properties. Use declared custom fields if those values are needed.

## Shared Nested Types

```ts
type Photo = string | {
  url: string;
  type?: "poster" | "fanart" | "landscape" | "banner" | "clearart" |
    "clearlogo" | "discart" | "keyart" | "default";
};

interface Credit {
  name: string;
  aliases?: string[];
  scraperPluginId?: string;
  providerId?: string;
  providerActorId?: string;
  roles?: Array<string | CreditRole>;
  sortOrder?: number | null;
  originalName?: string;
  profileUrl?: string;
  episodeCount?: number | null;
  popularity?: number | null;
  gender?: number | null;
}
interface CreditRole {
  slug?: string; name?: string; character?: string;
  job?: string; department?: string; creditId?: string;
  episodeCount?: number | null; order?: number | null;
}
interface CustomField {
  metaKey: string;
  fieldName: string;
  fieldType: "text" | "long_text" | "url" | "single_select" | "multi_select";
  value: string | string[];
  autoCreate?: boolean | null;
}
```

Photos follow array order and have no `sortOrder` field. In a Photo object, `url` is required and must not be null. A string photo is equivalent to `type: "default"`. Unknown types fall back to default, but generated plugins should not rely on that fallback.

Credit `name` is a person's name. Supply `scraperPluginId`, `providerId`, and `providerActorId` only when a real identity is available and the target plugin supports that actor provider. Do not use a show's ID as a person's ID or treat a TV provider as an unimplemented actor provider. A cast role can use `{ slug: "actor", name: "Actor", character: "Character name" }`; a crew role can use `{ slug: "director", name: "Director", job: "Director" }`. Give structured roles a stable slug; without it, the host may fall back to a plain-text category. String roles represent job/role categories, not character names. TV persistence currently uses role categories; do not claim `character` has been persisted. `sortOrder`, `episodeCount`, `gender`, and `order` are integer fields. Do not combine names, roles, and actor IDs into one string.

Always provide CustomField `metaKey`, `fieldName`, `fieldType`, and `value`. Keep `metaKey` stable and unique and match it to the corresponding custom declaration's `key` in the manifest. Return strings for `text`, `long_text`, `url`, and `single_select`, and string arrays for `multi_select`. Example declaration: `{ id: "original_language", key: "original_language", provider: "example", kind: "custom", fieldType: "text", label: { "en": "Original language" }, translatable: false }`.

The host supplies custom field provenance and namespaces. Plugins normally omit `sourceType`, `sourcePluginId`, `sourceProviderId`, `sourceFieldKey`, `labelI18n`, and `labelOverrides`. Do not reuse built-in field keys to bypass standard field restrictions.
