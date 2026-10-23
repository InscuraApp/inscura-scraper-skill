// Capability methods and the host's standard scrape-field allowlist.
// `result` names the detail property that carries each field; it often differs
// from the manifest field ID (for example media `description` -> `summary`).

export const METHODS = {
    media: ["searchMedia", "getMediaDetail"],
    actor: ["searchActors", "getActorDetail"],
    tv: ["searchTv", "getTvDetail"],
};

export const CAPABILITIES = Object.keys(METHODS);

function field(fieldType, translatable, en, zh, result) {
    return { fieldType, translatable, label: { en, "zh-CN": zh }, result };
}

export const STANDARD_FIELD_META = {
    media: {
        code: field("text", false, "Code", "编号", "number"),
        title: field("text", true, "Title", "标题", "title"),
        originalTitle: field("text", false, "Original title", "原始标题", "originalTitle"),
        description: field("long_text", true, "Description", "简介", "summary"),
        releaseDate: field("text", false, "Release date", "发行日期", "releaseDate"),
        rating: field("text", false, "Rating", "评分", "score"),
        portraitCover: field("text", false, "Poster", "海报", "bigThumbUrl / thumbUrl"),
        backdrop: field("text", false, "Backdrop", "背景图", "bigCoverUrl / coverUrl"),
        screenshot: field("text", false, "Screenshots", "截图", null),
        previewVideo: field("text", false, "Preview video", "预览视频", "previewVideoUrl"),
        photos: field("text", false, "Photos", "图片", "photos"),
        maker: field("single_select", true, "Maker", "制作商", "maker"),
        collections: field("multi_select", true, "Collections", "合集", "collections / collectionDetails"),
        label: field("single_select", true, "Label", "发行商", "label"),
        genres: field("multi_select", true, "Genres", "类型", "genres"),
        tags: field("multi_select", true, "Tags", "标签", "tags"),
        series: field("single_select", true, "Series", "系列", "series"),
        cast: field("long_text", false, "Cast", "演员", "cast"),
        crew: field("long_text", false, "Crew", "职员", "crew"),
        roles: field("long_text", false, "Roles", "角色", "cast[].roles / crew[].roles"),
    },
    actor: {
        name: field("text", true, "Name", "姓名", "name"),
        description: field("long_text", true, "Biography", "简介", "description"),
        birthday: field("text", false, "Birthday", "生日", "birthday"),
        debutDate: field("text", false, "Debut date", "出道日期", "debutDate"),
        height: field("text", false, "Height (cm)", "身高（厘米）", "height"),
        measurements: field("text", false, "Measurements", "三围", "measurements"),
        nationality: field("single_select", true, "Nationality", "国籍", "nationality"),
        gender: field("single_select", true, "Gender", "性别", "gender"),
        avatar: field("text", false, "Avatar", "头像", "avatar"),
        photos: field("text", false, "Photos", "图片", "photos"),
        skills: field("multi_select", true, "Skills", "技能", "skills"),
        tags: field("multi_select", true, "Tags", "标签", "tags"),
        socialLinks: field("long_text", false, "Social links", "社交链接", "socialLinks"),
    },
    tv: {
        title: field("text", true, "Title", "标题", "title"),
        originalTitle: field("text", false, "Original title", "原始标题", "originalTitle"),
        tagline: field("text", true, "Tagline", "标语", "tagline"),
        description: field("long_text", true, "Description", "简介", "description"),
        year: field("text", false, "Year", "年份", "year"),
        firstAired: field("text", false, "First aired", "首播日期", "firstAired"),
        lastAired: field("text", false, "Last aired", "最后播出", "lastAired"),
        contentRating: field("single_select", false, "Content rating", "分级", "contentRating"),
        averageRuntime: field("text", false, "Average runtime (minutes)", "平均时长（分钟）", "averageRuntime"),
        rating: field("text", false, "Rating", "评分", "rating"),
        aliases: field("multi_select", true, "Aliases", "别名", "aliases"),
        externalIds: field("text", false, "External IDs", "外部 ID", "externalIds"),
        tvGenre: field("multi_select", true, "Genres", "类型", "tvGenre"),
        network: field("multi_select", true, "Networks", "播出平台", "network"),
        tvStudio: field("multi_select", true, "Studios", "制作公司", "tvStudio"),
        tvTag: field("multi_select", true, "Tags", "标签", "tvTag"),
        tvStatus: field("single_select", true, "Status", "状态", "tvStatus"),
        cast: field("long_text", false, "Cast", "演员", "cast"),
        crew: field("long_text", false, "Crew", "职员", "crew"),
        trailer: field("text", false, "Trailer", "预告片", "trailer"),
        poster: field("text", false, "Poster", "海报", "poster"),
        backdrop: field("text", false, "Backdrop", "背景图", "backdrop"),
        banner: field("text", false, "Banner", "横幅", "banner"),
        logo: field("text", false, "Logo", "标志", "logo"),
        clearart: field("text", false, "Clear art", "透明图", "clearart"),
        photos: field("text", false, "Photos", "图片", "photos"),
        seasons: field("long_text", true, "Seasons", "季信息", "seasons"),
        episodes: field("long_text", true, "Episodes and catalogs", "剧集与目录", "episodes / episodeCatalogs"),
    },
};

export const STANDARD_FIELDS = Object.fromEntries(
    Object.entries(STANDARD_FIELD_META).map(([capability, fields]) => [capability, new Set(Object.keys(fields))]),
);
