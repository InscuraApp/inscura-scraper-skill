// Capability methods and the host's standard scrape-field allowlist.
// `result` names the detail property that carries each field; it often differs
// from the manifest field ID (for example media `description` -> `summary`).

export const METHODS = {
    media: ["searchMedia", "getMediaDetail"],
    actor: ["searchActors", "getActorDetail"],
    tv: ["searchTv", "getTvDetail"],
};

export const CAPABILITIES = Object.keys(METHODS);

function field(fieldType, translatable, en, zh, result, zhTW, ja, ko) {
    return { fieldType, translatable, label: { en, "zh-CN": zh, "zh-TW": zhTW, ja, ko }, result };
}

export const STANDARD_FIELD_META = {
    media: {
        code: field("text", false, "Code", "编号", "number", "編號", "識別コード", "식별 코드"),
        title: field("text", true, "Title", "标题", "title", "標題", "タイトル", "제목"),
        originalTitle: field("text", false, "Original title", "原始标题", "originalTitle", "原始標題", "原題", "원제"),
        description: field("long_text", true, "Description", "简介", "summary", "簡介", "概要", "설명"),
        releaseDate: field("text", false, "Release date", "发行日期", "releaseDate", "發行日期", "公開日", "공개일"),
        rating: field("text", false, "Rating", "评分", "score", "評分", "評価", "평점"),
        portraitCover: field("text", false, "Poster", "海报", "bigThumbUrl / thumbUrl", "海報", "ポスター", "포스터"),
        backdrop: field("text", false, "Backdrop", "背景图", "bigCoverUrl / coverUrl", "背景圖", "背景画像", "배경 이미지"),
        screenshot: field("text", false, "Screenshots", "截图", null, "截圖", "スクリーンショット", "스크린샷"),
        previewVideo: field("text", false, "Preview video", "预览视频", "previewVideoUrl", "預覽影片", "プレビュー動画", "미리보기 영상"),
        photos: field("text", false, "Photos", "图片", "photos", "圖片", "画像", "이미지"),
        maker: field("single_select", true, "Maker", "制作商", "maker", "製作商", "メーカー", "제작사"),
        collections: field("multi_select", true, "Collections", "合集", "collections / collectionDetails", "合集", "コレクション", "컬렉션"),
        label: field("single_select", true, "Label", "发行商", "label", "發行商", "レーベル", "레이블"),
        genres: field("multi_select", true, "Genres", "类型", "genres", "類型", "ジャンル", "장르"),
        tags: field("multi_select", true, "Tags", "标签", "tags", "標籤", "タグ", "태그"),
        series: field("single_select", true, "Series", "系列", "series", "系列", "シリーズ", "시리즈"),
        cast: field("long_text", false, "Cast", "演员", "cast", "演員", "出演者", "출연진"),
        crew: field("long_text", false, "Crew", "职员", "crew", "工作人員", "スタッフ", "제작진"),
        roles: field("long_text", false, "Roles", "角色", "cast[].roles / crew[].roles", "角色", "役割", "역할"),
    },
    actor: {
        name: field("text", true, "Name", "姓名", "name", "姓名", "名前", "이름"),
        description: field("long_text", true, "Biography", "简介", "description", "簡介", "人物紹介", "인물 소개"),
        birthday: field("text", false, "Birthday", "生日", "birthday", "生日", "生年月日", "생년월일"),
        debutDate: field("text", false, "Debut date", "出道日期", "debutDate", "出道日期", "デビュー日", "데뷔일"),
        height: field("text", false, "Height (cm)", "身高（厘米）", "height", "身高（公分）", "身長（cm）", "키(cm)"),
        measurements: field("text", false, "Measurements", "三围", "measurements", "三圍", "スリーサイズ", "신체 치수"),
        nationality: field("single_select", true, "Nationality", "国籍", "nationality", "國籍", "国籍", "국적"),
        gender: field("single_select", false, "Gender", "性别", "gender", "性別", "性別", "성별"),
        avatar: field("text", false, "Avatar", "头像", "avatar", "頭像", "プロフィール画像", "프로필 이미지"),
        photos: field("text", false, "Photos", "图片", "photos", "圖片", "画像", "이미지"),
        skills: field("multi_select", true, "Skills", "技能", "skills", "技能", "特技", "특기"),
        tags: field("multi_select", true, "Tags", "标签", "tags", "標籤", "タグ", "태그"),
        socialLinks: field("long_text", false, "Social links", "社交链接", "socialLinks", "社群連結", "ソーシャルリンク", "소셜 링크"),
    },
    tv: {
        title: field("text", true, "Title", "标题", "title", "標題", "タイトル", "제목"),
        originalTitle: field("text", false, "Original title", "原始标题", "originalTitle", "原始標題", "原題", "원제"),
        tagline: field("text", true, "Tagline", "标语", "tagline", "標語", "キャッチコピー", "태그라인"),
        description: field("long_text", true, "Description", "简介", "description", "簡介", "概要", "설명"),
        year: field("text", false, "Year", "年份", "year", "年份", "年", "연도"),
        firstAired: field("text", false, "First aired", "首播日期", "firstAired", "首播日期", "初回放送日", "첫 방영일"),
        lastAired: field("text", false, "Last aired", "最后播出", "lastAired", "最後播出日期", "最終放送日", "마지막 방영일"),
        contentRating: field("single_select", false, "Content rating", "分级", "contentRating", "分級", "年齢区分", "시청 등급"),
        averageRuntime: field("text", false, "Average runtime (minutes)", "平均时长（分钟）", "averageRuntime", "平均片長（分鐘）", "平均再生時間（分）", "평균 재생 시간(분)"),
        rating: field("text", false, "Rating", "评分", "rating", "評分", "評価", "평점"),
        aliases: field("multi_select", true, "Aliases", "别名", "aliases", "別名", "別名", "별칭"),
        externalIds: field("text", false, "External IDs", "外部 ID", "externalIds", "外部 ID", "外部 ID", "외부 ID"),
        tvGenre: field("multi_select", true, "Genres", "类型", "tvGenre", "類型", "ジャンル", "장르"),
        network: field("multi_select", true, "Networks", "播出平台", "network", "播出平台", "放送局", "방송사"),
        tvStudio: field("multi_select", true, "Studios", "制作公司", "tvStudio", "製作公司", "制作会社", "제작사"),
        tvTag: field("multi_select", true, "Tags", "标签", "tvTag", "標籤", "タグ", "태그"),
        tvStatus: field("single_select", true, "Status", "状态", "tvStatus", "狀態", "状態", "상태"),
        cast: field("long_text", false, "Cast", "演员", "cast", "演員", "出演者", "출연진"),
        crew: field("long_text", false, "Crew", "职员", "crew", "工作人員", "スタッフ", "제작진"),
        trailer: field("text", false, "Trailer", "预告片", "trailer", "預告片", "予告編", "예고편"),
        poster: field("text", false, "Poster", "海报", "poster", "海報", "ポスター", "포스터"),
        backdrop: field("text", false, "Backdrop", "背景图", "backdrop", "背景圖", "背景画像", "배경 이미지"),
        banner: field("text", false, "Banner", "横幅", "banner", "橫幅", "バナー", "배너"),
        logo: field("text", false, "Logo", "标志", "logo", "標誌", "ロゴ", "로고"),
        clearart: field("text", false, "Clear art", "透明图", "clearart", "透明圖", "透過アート", "투명 아트"),
        photos: field("text", false, "Photos", "图片", "photos", "圖片", "画像", "이미지"),
        seasons: field("long_text", true, "Seasons", "季信息", "seasons", "季資訊", "シーズン情報", "시즌 정보"),
        episodes: field("long_text", true, "Episodes and catalogs", "剧集与目录", "episodes / episodeCatalogs", "劇集與目錄", "エピソードと一覧", "에피소드 및 목록"),
    },
};

export const STANDARD_FIELDS = Object.fromEntries(
    Object.entries(STANDARD_FIELD_META).map(([capability, fields]) => [capability, new Set(Object.keys(fields))]),
);
