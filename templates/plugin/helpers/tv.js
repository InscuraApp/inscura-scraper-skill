
// ctx.request.tvScope: null = no scope (full show); [] = metadata only; otherwise the
// local seasons/episodes Inscura owns. An empty episodeNumbers list means "catalog only".
function tvScope(ctx) {
    var scope = ctx.request && ctx.request.tvScope;
    if (scope === undefined || scope === null) return null;
    if (!isObject(scope)) fail("invalid TV scope");
    var seen = {};
    return requireArray(scope.seasons, "TV scope").map(function (season) {
        if (!isObject(season) || typeof season.seasonNumber !== "number" || season.seasonNumber < 0 || seen[season.seasonNumber]) {
            fail("invalid or duplicate season in TV scope");
        }
        seen[season.seasonNumber] = true;
        return { seasonNumber: season.seasonNumber, episodeNumbers: requireArray(season.episodeNumbers, "TV scope episodes") };
    });
}

function scopedSeason(scope, seasonNumber) {
    if (scope === null) return null;
    for (var i = 0; i < scope.length; i += 1) if (scope[i].seasonNumber === seasonNumber) return scope[i];
    return undefined;
}

function seasonRequested(scope, seasonNumber) {
    return scope === null || scopedSeason(scope, seasonNumber) !== undefined;
}

function seasonHasLocalEpisodes(scope, seasonNumber) {
    var season = scopedSeason(scope, seasonNumber);
    return season === null || (season !== undefined && season.episodeNumbers.length > 0);
}

function episodeRequested(scope, seasonNumber, episodeNumber) {
    var season = scopedSeason(scope, seasonNumber);
    return season === null || (season !== undefined && season.episodeNumbers.indexOf(episodeNumber) !== -1);
}
