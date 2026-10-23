
    searchMedia: async function (keyword, ctx) {
        var provider = requireProvider("media", ctx.request && ctx.request.provider);
        var query = text(keyword);
        if (!query) return [];
        // TODO(inscura): use the documented search endpoint; pass ctx.request.year (number or null) if supported.
        var data = await request(ctx, "/search", { q: query });
        return requireArray(data, "search").map(function (item) {
            if (!isObject(item)) fail("invalid search entry");
            return {
                id: stringId(item.id),
                provider: provider,
                title: text(item.title)
                // Optional: originalTitle, number (code), releaseDate, score (0..10),
                // thumbUrl (portrait poster), coverUrl (landscape). Omit unknown values.
            };
        }).filter(hasIdentity);
    },

    getMediaDetail: async function (provider, id, ctx) {
        requireProvider("media", provider);
        id = stringId(id) || fail("invalid ID");
        // TODO(inscura): use the documented detail endpoint and map every field declared in scrapeFields.media.
        var item = await request(ctx, "/items/" + encodeURIComponent(id));
        if (!isObject(item)) fail("invalid detail response");
        return {
            id: id,
            provider: provider,
            title: text(item.title)
            // Result names differ from manifest field IDs: code -> number, description -> summary,
            // rating -> score (0..10), portraitCover -> bigThumbUrl/thumbUrl,
            // backdrop -> bigCoverUrl/coverUrl, previewVideo -> previewVideoUrl.
            // Also: originalTitle, releaseDate, genres/tags/studios (string[]), maker/label/series (string),
            // cast/crew (Credit[]), photos, imdbId, sourceUrl. There is no duration/runtime property.
        };
    },
