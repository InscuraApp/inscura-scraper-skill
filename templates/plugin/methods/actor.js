
    searchActors: async function (name, ctx) {
        var provider = requireProvider("actor", ctx.request && ctx.request.provider);
        var query = text(name);
        if (!query) return [];
        // TODO(inscura): use the documented people search endpoint.
        var data = await request(ctx, "/people/search", { q: query });
        return requireArray(data, "people search").map(function (person) {
            if (!isObject(person)) fail("invalid people search entry");
            return {
                id: stringId(person.id),
                provider: provider,
                name: text(person.name),
                avatar: image(person.image, ctx)
            };
        }).filter(hasIdentity);
    },

    getActorDetail: async function (provider, id, ctx) {
        requireProvider("actor", provider);
        id = stringId(id) || fail("invalid ID");
        // TODO(inscura): use the documented person endpoint and map every field declared in scrapeFields.actor.
        var person = await request(ctx, "/people/" + encodeURIComponent(id));
        if (!isObject(person) || !text(person.name)) fail("invalid person response");
        return {
            id: id,
            provider: provider,
            name: text(person.name),
            avatar: image(person.image, ctx)
            // Optional: description, birthday/debutDate (YYYY-MM-DD, year >= 1900), height ("175", cm text),
            // gender, nationality, aliases/tags/skills (string[]), photos (URL strings), sourceUrl.
        };
    },
