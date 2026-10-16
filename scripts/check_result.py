#!/usr/bin/env python3
"""Check a plugin's raw result JSON against the bundled result-types.md contract.

Python 3.9+ standard library only. No plugin execution, network access, manifest
cross-check, TV request-scope completeness check, or persistence verification.
Use JSON captured before host deserialization: host results may contain added
empty-string defaults that this generation contract deliberately rejects.
"""
import argparse
from datetime import date
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


class InvalidResult(ValueError):
    pass


def require(ok, path, message):
    if not ok:
        raise InvalidResult(path + ": " + message)


def string(value, path):
    require(isinstance(value, str), path, "expected string, not null or another type")


def nonempty(value, path):
    string(value, path)
    require(bool(value.strip()), path, "must not be empty")


def number(value, path):
    require(type(value) in (int, float) and math.isfinite(value), path, "expected finite number")


def integer(value, path):
    require(type(value) is int, path, "expected integer")
    require(-(2 ** 63) <= value < 2 ** 63, path, "integer outside signed 64-bit range")


def nonnegative(value, path):
    integer(value, path)
    require(value >= 0, path, "must be a nonnegative integer")


def positive(value, path):
    integer(value, path)
    require(value > 0, path, "must be a positive integer (runtime uses minutes)")


def boolean(value, path):
    require(type(value) is bool, path, "expected boolean")


def nullable(check):
    return lambda value, path: None if value is None else check(value, path)


def array(check):
    def validate(value, path):
        require(isinstance(value, list), path, "expected array, not null")
        for index, item in enumerate(value):
            check(item, path + "[" + str(index) + "]")
    return validate


def choice(*allowed):
    def validate(value, path):
        string(value, path)
        require(value in allowed, path, "expected one of " + ", ".join(allowed))
    return validate


def bounded(low, high, strict_low=False):
    def validate(value, path):
        number(value, path)
        require((value > low if strict_low else value >= low) and value <= high,
                path, "number outside " + ("(" if strict_low else "[") + str(low) + ", " + str(high) + "]")
    return validate


def year(value, path):
    integer(value, path)
    require(1000 <= value <= 9999, path, "year must be 1000..9999")


def calendar_date(value, path, actor=False):
    string(value, path)
    pattern = r"\d{4}-\d{2}-\d{2}" if actor else r"\d{4}(?:-\d{2}(?:-\d{2})?)?"
    require(re.fullmatch(pattern, value) is not None, path, "invalid date format")
    parts = [int(part) for part in value.split("-")]
    try:
        date(*parts, *([1] * (3 - len(parts))))
    except ValueError:
        raise InvalidResult(path + ": invalid calendar date") from None
    require(parts[0] >= (1900 if actor else 1000), path, "date year is outside the supported range")


def url(value, path):
    nonempty(value, path)
    try:
        parsed = urlsplit(value)
        valid = parsed.scheme in ("http", "https") and bool(parsed.hostname) and not any(c.isspace() for c in value)
        parsed.port  # Reject malformed port syntax.
    except ValueError:
        valid = False
    require(valid, path, "expected HTTP(S) URL; file paths and data URIs are not supported")


def fields(names, check):
    return dict.fromkeys(names.split(), check)


def object_check(value, path, spec, required=()):
    require(isinstance(value, dict), path, "expected object")
    unknown = set(value) - set(spec)
    require(not unknown, path, "unknown fields: " + ", ".join(sorted(unknown)))
    require(set(required) <= set(value), path, "missing fields: " + ", ".join(sorted(set(required) - set(value))))
    for key, item in value.items():
        spec[key](item, path + "." + key)


def role(value, path):
    if isinstance(value, str):
        nonempty(value, path)
    else:
        object_check(value, path, {**fields("slug name character job department creditId", string),
                                  "episodeCount": nullable(nonnegative), "order": nullable(integer)})


def credit(value, path):
    object_check(value, path, {**fields("name", nonempty), **fields("scraperPluginId providerId providerActorId originalName", string),
        "aliases": array(string), "roles": array(role), "profileUrl": url,
        **fields("sortOrder gender", nullable(integer)), "episodeCount": nullable(nonnegative), "popularity": nullable(number)}, ("name",))


def photo(value, path):
    if isinstance(value, str):
        url(value, path)
    else:
        object_check(value, path, {"url": url, "type": choice("poster", "fanart", "landscape", "banner", "clearart",
            "clearlogo", "discart", "keyart", "default")}, ("url",))


def custom_field(value, path):
    object_check(value, path, {**fields("metaKey fieldName", nonempty),
        "fieldType": choice("text", "long_text", "url", "single_select", "multi_select"),
        "value": lambda v, p: array(string)(v, p) if isinstance(v, list) else string(v, p),
        "autoCreate": nullable(boolean)}, ("metaKey", "fieldName", "fieldType", "value"))
    (array(string) if value["fieldType"] == "multi_select" else string)(value["value"], path + ".value")


def custom_fields(value, path):
    array(custom_field)(value, path)
    keys = [item["metaKey"] for item in value]
    require(len(keys) == len(set(keys)), path, "duplicate metaKey")


def external_ids(value, path, season=False):
    allowed = ("tvdb", "tmdb", "wikidata") if season else ("imdb", "tvdb", "tmdb", "wikidata")
    def external(item, location):
        object_check(item, location, {"provider": choice(*allowed), "id": nonempty}, ("provider", "id"))
        if item["provider"] == "imdb":
            require(re.fullmatch(r"tt[0-9]+", item["id"]) is not None, location + ".id", "IMDb TV IDs must retain their tt prefix")
    array(external)(value, path)
    providers = [item["provider"] for item in value]
    require(len(providers) == len(set(providers)), path, "duplicate external-ID provider")


def collection(value, path):
    object_check(value, path, fields("id name overview", string))


def social(value, path):
    object_check(value, path, {"platform": nonempty, "handle": nullable(string), "url": nullable(url)}, ("platform",))


def height(value, path):
    string(value, path)
    require(re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value) is not None, path, "expected decimal centimetres as text, e.g. '175'")


TV_RATING = nullable(bounded(0, 10, True))
TV_BASE = {**fields("title originalTitle description", nullable(string)), **fields("year", nullable(year)),
           **fields("firstAired", nullable(calendar_date)), "rating": TV_RATING,
           **fields("cast crew", array(credit)), "externalIds": external_ids,
           **fields("poster backdrop banner", nullable(url))}


def season(value, path):
    object_check(value, path, {key: check for key, check in {**TV_BASE, "seasonNumber": nonnegative,
        **fields("voteCount episodeCount", nullable(nonnegative)),
        "externalIds": lambda v, p: external_ids(v, p, season=True)}.items() if key != "originalTitle"}, ("seasonNumber",))


def episode(value, path):
    object_check(value, path, {**fields("seasonNumber episodeNumber", nonnegative),
        **fields("title originalTitle description productionCode episodeType", nullable(string)),
        "releaseDate": nullable(calendar_date), "rating": TV_RATING, "voteCount": nullable(nonnegative), "runtime": nullable(positive),
        **fields("stillUrl poster banner", nullable(url)), "externalIds": external_ids,
        **fields("cast guestStars crew directors writers", array(credit))}, ("seasonNumber", "episodeNumber"))


def catalog(value, path):
    def entry(item, location):
        object_check(item, location, {"episodeNumber": nonnegative, "title": nullable(string)}, ("episodeNumber",))
    object_check(value, path, {"seasonNumber": nonnegative, "episodes": array(entry)}, ("seasonNumber", "episodes"))


def artwork(value, path):
    object_check(value, path, {"provider": nonempty, "scope": choice("series", "season", "episode"),
        "type": choice("poster", "backdrop", "banner", "logo", "clearart", "photo"), "urlOrPath": url,
        "thumbUrl": nullable(url), "language": nullable(string), **fields("width height", nullable(integer)), "scoreOrLikes": nullable(number),
        **fields("voteCount seasonNumber episodeNumber", nullable(nonnegative)), "isSelected": boolean}, ("provider", "scope", "type", "urlOrPath"))
    if value["scope"] != "series":
        require(value.get("seasonNumber") is not None, path, "season/episode artwork requires seasonNumber")
        require(value["type"] not in ("logo", "clearart"), path, "logo/clearart only support series scope")
    if value["scope"] == "episode":
        require(value.get("episodeNumber") is not None, path, "episode artwork requires episodeNumber")


IDENTITY = fields("id provider", nonempty)
MEDIA_SEARCH = {**IDENTITY, "title": nonempty, **fields("number originalTitle", string),
    **fields("thumbUrl coverUrl", url), "releaseDate": calendar_date, "score": bounded(0, 10), "matchScore": bounded(0, 1)}
MEDIA_DETAIL = {**IDENTITY, **fields("number title originalTitle summary maker label series imdbId tmdbId wikidataId releaseSource releaseGroup", string),
    **fields("thumbUrl bigThumbUrl coverUrl bigCoverUrl previewVideoUrl sourceUrl", url), "releaseDate": calendar_date,
    **fields("score imdbRating", bounded(0, 10)), "imdbVotes": nonnegative, "photos": array(photo), **fields("cast crew", array(credit)),
    **fields("studios genres tags collections releaseFlags", array(string)), "collectionDetails": array(collection), "customFields": custom_fields}
ACTOR_SEARCH = {**IDENTITY, "name": nonempty, "avatar": url, "matchScore": bounded(0, 1)}
ACTOR_DETAIL = {**IDENTITY, "name": nonempty, **fields("description measurements nationality gender", string),
    **fields("sourceUrl avatar", url), **fields("aliases skills tags", array(string)), "photos": array(url),
    **fields("birthday debutDate", lambda v, p: calendar_date(v, p, actor=True)), "height": height,
    "socialLinks": array(social), "customFields": custom_fields}
TV_SEARCH = {**IDENTITY, "title": nonempty, **fields("originalTitle status network overview originalLanguage", nullable(string)),
    "year": nullable(year), "firstAired": nullable(calendar_date), **fields("posterUrl backdropUrl", nullable(url)),
    "rating": TV_RATING, "voteCount": nullable(nonnegative), "popularity": nullable(number), "originCountries": array(string),
    "adult": nullable(boolean), "genreIds": array(integer), "externalIds": external_ids, "matchScore": bounded(0, 1)}
TV_DETAIL = {**IDENTITY, **TV_BASE, **fields("tagline contentRating tvStatus", nullable(string)), "lastAired": nullable(calendar_date),
    "averageRuntime": nullable(positive), **fields("aliases tvGenre network tvStudio tvTag", array(string)),
    **fields("logo clearart trailer sourceUrl", nullable(url)), "photos": array(photo), "seasons": array(season),
    "episodes": array(episode), "episodeCatalogs": nullable(array(catalog)), "artworks": array(artwork), "customFields": custom_fields}
SPECS = {("media", "search"): MEDIA_SEARCH, ("media", "detail"): MEDIA_DETAIL,
         ("actor", "search"): ACTOR_SEARCH, ("actor", "detail"): ACTOR_DETAIL,
         ("tv", "search"): TV_SEARCH, ("tv", "detail"): TV_DETAIL}


def check_result(capability, operation, data, provider=None):
    required = ["id", "provider"] + (["name"] if capability == "actor" else ["title"] if operation == "search" else [])
    def item(value, path):
        object_check(value, path, SPECS[capability, operation], required)
        if provider is not None:
            require(value["provider"] == provider, path + ".provider", "does not match expected provider " + provider)
    (array(item) if operation == "search" else item)(data, "$")


def pairs(items):
    result = {}
    for key, value in items:
        require(key not in result, "$", "duplicate JSON key: " + key)
        result[key] = value
    return result


def reject_constant(value):
    raise InvalidResult("$: non-finite JSON number: " + value)


def finite_float(value):
    result = float(value)
    number(result, "$")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capability", choices=("media", "actor", "tv"))
    parser.add_argument("operation", choices=("search", "detail"))
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--provider", help="require exact top-level provider IDs")
    args = parser.parse_args()
    try:
        if args.provider is not None:
            nonempty(args.provider, "--provider")
        data = json.loads(args.json_file.read_text(encoding="utf-8"), object_pairs_hook=pairs,
                          parse_constant=reject_constant, parse_float=finite_float)
        check_result(args.capability, args.operation, data, args.provider)
    except (OSError, ValueError, OverflowError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        return 1
    print("PASS: raw plugin JSON shape, field allowlists, required identities, nullable/type/range and nested-value checks")
    print("LIMIT: no network/plugin execution, manifest mapping, TV scope/catalog completeness or persistence validation")
    return 0


if __name__ == "__main__":
    sys.exit(main())
