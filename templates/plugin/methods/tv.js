
    searchTv: async function (keyword, ctx) {
        var provider = requireProvider("tv", ctx.request && ctx.request.provider);
        var query = text(keyword);
        if (!query) return [];
        // TODO(inscura): use the documented show search endpoint; pass ctx.request.year (number or null) if supported.
        var data = await request(ctx, "/search/tv", { q: query });
        return requireArray(data, "show search").map(function (show) {
            if (!isObject(show)) fail("invalid show search entry");
            return {
                id: stringId(show.id),
                provider: provider,
                title: text(show.title)
                // Optional: originalTitle, year, firstAired, overview, posterUrl, network (one string),
                // status, rating (0 < r <= 10), externalIds [{ provider: "imdb"|"tvdb"|"tmdb"|"wikidata", id }].
            };
        }).filter(hasIdentity);
    },

    getTvDetail: async function (provider, id, ctx) {
        requireProvider("tv", provider);
        id = stringId(id) || fail("invalid ID");
        var scope = tvScope(ctx);
        // TODO(inscura): use the documented show detail endpoint and map every field declared in scrapeFields.tv.
        var show = await request(ctx, "/tv/" + encodeURIComponent(id));
        if (!isObject(show)) fail("invalid show response");
        var result = {
            id: id,
            provider: provider,
            title: text(show.title),
            // Optional: description, tagline, year, firstAired/lastAired, averageRuntime (minutes),
            // rating, tvGenre/network/tvStudio/tvTag (string[]), tvStatus, cast/crew, poster/backdrop, sourceUrl.
            seasons: [],
            episodes: [],
            episodeCatalogs: []
        };
        if (scope !== null && scope.length === 0) return result;
        // TODO(inscura): load official seasons/episodes with as few requests as the API allows, then for each season:
        //   if (!seasonRequested(scope, n)) skip it;
        //   push the complete catalog { seasonNumber, episodes: [{ episodeNumber, title }] } into episodeCatalogs;
        //   push season details only if seasonHasLocalEpisodes(scope, n);
        //   push episode details only if episodeRequested(scope, n, e).
        return result;
    },
